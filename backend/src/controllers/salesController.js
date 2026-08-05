import SalesOrder from '../models/SalesOrder.js';
import Stock from '../models/Stock.js';
import Product from '../models/Product.js';
import Transaction from '../models/Transaction.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import CacheUtil from '../utils/cache.js';
import { PAGINATION, USER_ROLES } from '../config/constants.js';
import { createMovementWithOldQuantity, MOVEMENT_TYPES } from '../utils/stockMovement.js';
import { canAccessBranch } from '../utils/branchScope.js';

/**
 * Normalize a branch reference that may be a populated Branch document or a
 * raw ObjectId into a plain string id.
 */
const resolveBranchId = (branchRef) =>
  branchRef?._id ? branchRef._id.toString() : branchRef?.toString();

/**
 * @desc    Get all sales orders with filters
 * @route   GET /api/sales
 * @access  Private (Admin, Salesperson)
 */
export const getSalesOrders = asyncHandler(async (req, res) => {
  const {
    branch,
    status,
    paymentStatus,
    startDate,
    endDate,
    page = 1,
    limit = PAGINATION.DEFAULT_LIMIT
  } = req.query;

  const query = {};
  
  // Branch filter (non-admins can only see their branch)
  if (req.user.role !== USER_ROLES.ADMIN) {
    query.branch = req.user.branch;
  } else if (branch) {
    query.branch = branch;
  }

  if (status) {
    query.status = status;
  }

  if (paymentStatus) {
    query['payment.status'] = paymentStatus;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [orders, total] = await Promise.all([
    SalesOrder.find(query)
      .populate('branch', 'name code')
      .populate('processedBy', 'name')
      .populate('items.product', 'sku name brand')
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    SalesOrder.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    orders,
    pageNum,
    limitNum,
    total,
    'Sales orders retrieved successfully'
  );
});

/**
 * @desc    Get single sales order
 * @route   GET /api/sales/:id
 * @access  Private
 */
export const getSalesOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await SalesOrder.findById(id)
    .populate('branch', 'name code address contact')
    .populate('processedBy', 'name email')
    .populate('items.product', 'sku name brand images');

  if (!order) {
    return ApiResponse.error(res, 404, 'Sales order not found');
  }

  // Check access (non-admins can only view their branch orders)
  if (!canAccessBranch(req.user, resolveBranchId(order.branch))) {
    return ApiResponse.error(res, 403, 'Access denied to this order');
  }

  return ApiResponse.success(res, 200, 'Sales order retrieved successfully', order);
});

/**
 * @desc    Get sales orders by branch
 * @route   GET /api/sales/branch/:branchId
 * @access  Private
 */
export const getSalesOrdersByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { status, startDate, endDate, page = 1, limit = 20 } = req.query;

  // Check access
  if (!canAccessBranch(req.user, branchId)) {
    return ApiResponse.error(res, 403, 'Access denied to this branch');
  }

  const query = { branch: branchId };
  
  if (status) {
    query.status = status;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [orders, total] = await Promise.all([
    SalesOrder.find(query)
      .populate('processedBy', 'name')
      .populate('items.product', 'sku name')
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    SalesOrder.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    orders,
    pageNum,
    limitNum,
    total,
    'Branch sales orders retrieved successfully'
  );
});

/**
 * @desc    Create new sales order (MVP CRITICAL)
 * @route   POST /api/sales
 * @access  Private (Admin, Salesperson)
 */
export const createSalesOrder = asyncHandler(async (req, res) => {
  const {
    clientRequestId,
    branch,
    customer,
    items,
    taxRate = 0,
    discount = 0,
    paymentMethod,
    amountPaid = 0,
    notes
  } = req.body;

  // Validate branch access
  if (!canAccessBranch(req.user, branch)) {
    return ApiResponse.error(res, 403, 'Cannot create order for different branch');
  }

  // Idempotent replay: a queued offline order can be retried after a dropped
  // response. Recognise the retry and return the order already created for
  // this key instead of creating a duplicate. This must run before any stock
  // is touched below (product/stock lookups, reservations) — otherwise a
  // replay would silently double-reserve or double-deduct stock while still
  // appearing to succeed. Scoped to `branch` (already access-checked above)
  // so this can't be used to read an order from a branch the caller can't
  // access.
  if (clientRequestId) {
    const existing = await SalesOrder.findOne({ clientRequestId, branch })
      .populate('branch', 'name code')
      .populate('processedBy', 'name')
      .populate('items.product', 'sku name brand images');
    if (existing) {
      return ApiResponse.success(res, 200, 'Order already recorded', existing);
    }
  }

  // Validate and prepare items
  const preparedItems = [];
  for (const item of items) {
    // Check if product exists
    const product = await Product.findById(item.product);
    if (!product) {
      return ApiResponse.error(res, 404, `Product ${item.product} not found`);
    }

    if (!product.isActive) {
      return ApiResponse.error(res, 400, `Product ${product.name} is not active`);
    }

    // Check stock availability
    const stock = await Stock.findOne({ product: item.product, branch });
    if (!stock) {
      return ApiResponse.error(
        res,
        404,
        `Product ${product.name} is not available at this branch`
      );
    }

    if (!stock.hasSufficientStock(item.quantity)) {
      return ApiResponse.error(
        res,
        400,
        `Insufficient stock for ${product.name}. Available: ${stock.availableQuantity}, Requested: ${item.quantity}`
      );
    }

    // Use branch-specific pricing (MVP CRITICAL)
    preparedItems.push({
      product: product._id,
      sku: product.sku,
      name: product.name,
      quantity: item.quantity,
      unitPrice: stock.sellingPrice, // Branch-specific price
      discount: item.discount || 0,
      total: 0 // Will be calculated in pre-save hook
    });

    // Reserve stock
    await stock.reserveStock(item.quantity);
  }

  // Generate order number (MVP CRITICAL - model validation requires it)
  const count = await SalesOrder.countDocuments();
  const year = new Date().getFullYear();
  const orderNumber = `SO-${year}-${String(count + 1).padStart(6, '0')}`;

  // Create sales order
  const order = await SalesOrder.create({
    orderNumber,
    clientRequestId,
    branch,
    customer,
    items: preparedItems,
    tax: {
      rate: taxRate,
      amount: 0 // Will be calculated in pre-save hook
    },
    discount,
    subtotal: 0, // Will be calculated in pre-save hook
    total: 0, // Will be calculated in pre-save hook
    payment: {
      method: paymentMethod,
      amountPaid,
      change: 0, // Will be calculated in pre-save hook
      status: 'pending' // Will be calculated in pre-save hook
    },
    status: 'pending',
    processedBy: req.user._id,
    notes
  });

  // Populate for response
  const populatedOrder = await SalesOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('processedBy', 'name')
    .populate('items.product', 'sku name brand images');

  // Invalidate cache
  await CacheUtil.delPattern('cache:sales:*');

  return ApiResponse.success(
    res,
    201,
    'Sales order created successfully',
    populatedOrder
  );
});

/**
 * @desc    Update sales order status (Complete/Cancel)
 * @route   PUT /api/sales/:id/status
 * @access  Private (Admin, Salesperson)
 */
export const updateSalesOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = await SalesOrder.findById(id);

  if (!order) {
    return ApiResponse.error(res, 404, 'Sales order not found');
  }

  // Check access
  if (!canAccessBranch(req.user, resolveBranchId(order.branch))) {
    return ApiResponse.error(res, 403, 'Access denied to this order');
  }

  // Validate status transition
  const validTransitions = {
    pending: ['processing', 'cancelled'],
    processing: ['completed', 'cancelled'],
    completed: [],
    cancelled: []
  };

  if (!validTransitions[order.status].includes(status)) {
    return ApiResponse.error(
      res,
      400,
      `Cannot change status from ${order.status} to ${status}`
    );
  }

  const oldStatus = order.status;
  order.status = status;

  if (status === 'completed') {
    // Deduct stock from inventory
    for (const item of order.items) {
      const stock = await Stock.findOne({
        product: item.product,
        branch: order.branch
      });
      
      if (stock) {
        const oldQuantity = stock.quantity;
        await stock.deductStock(item.quantity);
        
        // Log stock movement for sale
        await createMovementWithOldQuantity(stock, oldQuantity, {
          type: MOVEMENT_TYPES.SALE,
          reference: { type: 'SalesOrder', id: order._id },
          notes: `Sale order ${order.orderNumber}`,
          performedBy: req.user._id,
        });
      }
    }

    // Create transaction record (MVP CRITICAL - CASH FLOW)
    if (order.payment.status === 'paid') {
      // Generate transaction number
      const txnCount = await Transaction.countDocuments();
      const timestamp = Date.now().toString().slice(-6);
      const transactionNumber = `TXN-${String(txnCount + 1).padStart(6, '0')}-${timestamp}`;
      
      await Transaction.create({
        transactionNumber,
        type: 'sale',
        branch: order.branch,
        amount: order.total,
        paymentMethod: order.payment.method,
        reference: {
          model: 'SalesOrder',
          id: order._id
        },
        description: `Sales Order ${order.orderNumber}`,
        processedBy: req.user._id
      });
    }

    order.completedAt = new Date();
  } else if (status === 'cancelled') {
    // Release reserved stock
    for (const item of order.items) {
      const stock = await Stock.findOne({
        product: item.product,
        branch: order.branch
      });
      
      if (stock) {
        const oldQuantity = stock.quantity;
        await stock.releaseReservedStock(item.quantity);
        
        // Log stock movement for cancelled sale
        await createMovementWithOldQuantity(stock, oldQuantity, {
          type: MOVEMENT_TYPES.SALE_CANCEL,
          reference: { type: 'SalesOrder', id: order._id },
          notes: `Sale order ${order.orderNumber} cancelled`,
          performedBy: req.user._id,
        });
      }
    }
  }

  await order.save();

  const populatedOrder = await SalesOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('processedBy', 'name')
    .populate('items.product', 'sku name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:sales:*');
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    `Sales order ${status} successfully`,
    {
      order: populatedOrder,
      statusChange: {
        from: oldStatus,
        to: status,
        changedBy: req.user.name,
        changedAt: new Date()
      }
    }
  );
});

/**
 * @desc    Update sales order payment
 * @route   PUT /api/sales/:id/payment
 * @access  Private (Admin, Salesperson)
 */
export const updateSalesOrderPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amountPaid, paymentMethod } = req.body;

  const order = await SalesOrder.findById(id);

  if (!order) {
    return ApiResponse.error(res, 404, 'Sales order not found');
  }

  // Check access
  if (!canAccessBranch(req.user, resolveBranchId(order.branch))) {
    return ApiResponse.error(res, 403, 'Access denied to this order');
  }

  if (order.status === 'completed' || order.status === 'cancelled') {
    return ApiResponse.error(res, 400, 'Cannot update payment for completed/cancelled order');
  }

  if (amountPaid !== undefined) {
    order.payment.amountPaid = amountPaid;
  }
  
  if (paymentMethod) {
    order.payment.method = paymentMethod;
  }

  await order.save(); // Pre-save hook will recalculate payment status and change

  const populatedOrder = await SalesOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('processedBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:sales:*');

  return ApiResponse.success(res, 200, 'Payment updated successfully', populatedOrder);
});

/**
 * @desc    Delete/Cancel sales order
 * @route   DELETE /api/sales/:id
 * @access  Private (Admin only)
 */
export const deleteSalesOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await SalesOrder.findById(id);

  if (!order) {
    return ApiResponse.error(res, 404, 'Sales order not found');
  }

  if (order.status === 'completed') {
    return ApiResponse.error(res, 400, 'Cannot delete completed order');
  }

  // Release reserved stock if pending/processing
  if (order.status === 'pending' || order.status === 'processing') {
    for (const item of order.items) {
      const stock = await Stock.findOne({
        product: item.product,
        branch: order.branch
      });
      
      if (stock) {
        await stock.releaseReservedStock(item.quantity);
      }
    }
  }

  order.status = 'cancelled';
  await order.save();

  // Invalidate cache
  await CacheUtil.delPattern('cache:sales:*');
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    'Sales order cancelled successfully',
    { id: order._id, orderNumber: order.orderNumber, status: 'cancelled' }
  );
});

/**
 * @desc    Get sales order invoice data
 * @route   GET /api/sales/:id/invoice
 * @access  Private
 */
export const getSalesOrderInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await SalesOrder.findById(id)
    .populate('branch', 'name code address contact')
    .populate('processedBy', 'name')
    .populate('items.product', 'sku name brand');

  if (!order) {
    return ApiResponse.error(res, 404, 'Sales order not found');
  }

  // Check access
  if (!canAccessBranch(req.user, resolveBranchId(order.branch))) {
    return ApiResponse.error(res, 403, 'Access denied to this order');
  }

  const invoice = {
    orderNumber: order.orderNumber,
    date: order.createdAt,
    branch: {
      name: order.branch.name,
      code: order.branch.code,
      address: order.branch.address,
      contact: order.branch.contact
    },
    customer: order.customer,
    items: order.items.map(item => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      total: item.total
    })),
    subtotal: order.subtotal,
    tax: order.tax,
    discount: order.discount,
    total: order.total,
    payment: order.payment,
    processedBy: order.processedBy.name,
    notes: order.notes
  };

  return ApiResponse.success(res, 200, 'Invoice data retrieved successfully', invoice);
});

/**
 * @desc    Get sales statistics
 * @route   GET /api/sales/stats
 * @access  Private (Admin, Salesperson)
 */
export const getSalesStatistics = asyncHandler(async (req, res) => {
  const { branch, startDate, endDate } = req.query;

  const query = {};

  // Branch filter
  if (req.user.role !== USER_ROLES.ADMIN) {
    query.branch = req.user.branch;
  } else if (branch) {
    query.branch = branch;
  }

  // Date filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const [
    totalOrders,
    completedOrders,
    cancelledOrders,
    pendingOrders,
    totalRevenue,
    paidOrders
  ] = await Promise.all([
    SalesOrder.countDocuments(query),
    SalesOrder.countDocuments({ ...query, status: 'completed' }),
    SalesOrder.countDocuments({ ...query, status: 'cancelled' }),
    SalesOrder.countDocuments({ ...query, status: 'pending' }),
    SalesOrder.aggregate([
      { $match: { ...query, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]),
    SalesOrder.countDocuments({ ...query, 'payment.status': 'paid' })
  ]);

  const statistics = {
    orders: {
      total: totalOrders,
      completed: completedOrders,
      cancelled: cancelledOrders,
      pending: pendingOrders,
      processing: totalOrders - completedOrders - cancelledOrders - pendingOrders
    },
    revenue: {
      total: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
      averageOrderValue: completedOrders > 0 
        ? (totalRevenue.length > 0 ? totalRevenue[0].total : 0) / completedOrders 
        : 0
    },
    payment: {
      paidOrders,
      pendingPayment: totalOrders - paidOrders
    }
  };

  return ApiResponse.success(res, 200, 'Sales statistics retrieved successfully', statistics);
});
