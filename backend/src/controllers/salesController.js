const SalesOrder = require('../models/SalesOrder');
const Stock = require('../models/Stock');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const CacheUtil = require('../utils/cache');
const { PAGINATION } = require('../config/constants');
const { createMovementWithOldQuantity, MOVEMENT_TYPES } = require('../utils/stockMovement');

/**
 * @desc    Get all sales orders with filters
 * @route   GET /api/sales
 * @access  Private (Admin, Salesperson)
 */
exports.getSalesOrders = asyncHandler(async (req, res) => {
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
  if (req.user.role !== 'admin') {
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
exports.getSalesOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await SalesOrder.findById(id)
    .populate('branch', 'name code address contact')
    .populate('processedBy', 'name email')
    .populate('items.product', 'sku name brand images');

  if (!order) {
    return ApiResponse.error(res, 404, 'Sales order not found');
  }

  // Check access (non-admins can only view their branch orders)
  if (req.user.role !== 'admin' && order.branch._id.toString() !== req.user.branch.toString()) {
    return ApiResponse.error(res, 403, 'Access denied to this order');
  }

  return ApiResponse.success(res, 200, 'Sales order retrieved successfully', order);
});

/**
 * @desc    Get sales orders by branch
 * @route   GET /api/sales/branch/:branchId
 * @access  Private
 */
exports.getSalesOrdersByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { status, startDate, endDate, page = 1, limit = 20 } = req.query;

  // Check access
  if (req.user.role !== 'admin' && req.user.branch.toString() !== branchId) {
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
exports.createSalesOrder = asyncHandler(async (req, res) => {
  const {
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
  if (req.user.role !== 'admin' && req.user.branch.toString() !== branch) {
    return ApiResponse.error(res, 403, 'Cannot create order for different branch');
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
exports.updateSalesOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = await SalesOrder.findById(id);

  if (!order) {
    return ApiResponse.error(res, 404, 'Sales order not found');
  }

  // Check access
  if (req.user.role !== 'admin' && order.branch.toString() !== req.user.branch.toString()) {
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
exports.updateSalesOrderPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amountPaid, paymentMethod } = req.body;

  const order = await SalesOrder.findById(id);

  if (!order) {
    return ApiResponse.error(res, 404, 'Sales order not found');
  }

  // Check access
  if (req.user.role !== 'admin' && order.branch.toString() !== req.user.branch.toString()) {
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
exports.deleteSalesOrder = asyncHandler(async (req, res) => {
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
exports.getSalesOrderInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await SalesOrder.findById(id)
    .populate('branch', 'name code address contact')
    .populate('processedBy', 'name')
    .populate('items.product', 'sku name brand');

  if (!order) {
    return ApiResponse.error(res, 404, 'Sales order not found');
  }

  // Check access
  if (req.user.role !== 'admin' && order.branch._id.toString() !== req.user.branch.toString()) {
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
exports.getSalesStatistics = asyncHandler(async (req, res) => {
  const { branch, startDate, endDate } = req.query;

  const query = {};

  // Branch filter
  if (req.user.role !== 'admin') {
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
