import SalesOrder from '../models/SalesOrder.js';
import Stock from '../models/Stock.js';
import Product from '../models/Product.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import CacheUtil from '../utils/cache.js';
import { PAGINATION, USER_ROLES } from '../config/constants.js';
import { createMovementWithOldQuantity, MOVEMENT_TYPES } from '../utils/stockMovement.js';
import { getReportingPeriodBounds } from '../utils/reportingPeriod.js';
import { canAccessBranch } from '../utils/branchScope.js';
import { escapeRegex } from '../utils/regex.js';
import { asDate, asObjectId } from '../utils/narrowing.js';
// The fields a list may be ordered by. `sortBy` is used as an object key, so an
// allow-list is what keeps an arbitrary string out of that position; anything
// outside it is rejected by the route rather than silently ignored.
export const SALES_SORT_FIELDS = ['createdAt', 'orderNumber', 'total', 'status'];
import { completeSalesOrder, recordSaleTransaction } from '../utils/salesCompletion.js';

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
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
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

  // Server-side search. The list page filtered client-side, which only ever
  // searched the page already fetched: an order number on page three was
  // invisible from page one, and the UI gave no sign it was looking at a
  // subset. Escaped, because this reaches a $regex.
  if (search) {
    const pattern = { $regex: escapeRegex(search), $options: 'i' };
    query.$or = [
      { orderNumber: pattern },
      { 'customer.name': pattern },
      { 'customer.phone': pattern }
    ];
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const sort = { [SALES_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt']:
    sortOrder === 'asc' ? 1 : -1 };

  const [orders, total] = await Promise.all([
    SalesOrder.find(query)
      .populate('branch', 'name code')
      .populate('processedBy', 'name')
      .populate('items.product', 'sku name brand')
      .skip(skip)
      .limit(limitNum)
      .sort(sort),
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
    // Both narrowed at the sink. `branch` has passed canAccessBranch above and
    // `clientRequestId` is an id the client generates, but neither is narrowed
    // on the path that reaches this filter, which is what the analysis reads
    // and what a route missing its chain would expose. See utils/narrowing.js.
    const replayKey = asObjectId(clientRequestId);
    const replayBranch = asObjectId(branch);
    if (!replayKey || !replayBranch) {
      return ApiResponse.error(res, 400, 'Invalid clientRequestId or branch');
    }

    const existing = await SalesOrder.findOne({
      clientRequestId: replayKey,
      branch: replayBranch,
    })
      .populate('branch', 'name code')
      .populate('processedBy', 'name')
      .populate('items.product', 'sku name brand images');
    if (existing) {
      return ApiResponse.success(res, 200, 'Order already recorded', existing);
    }
  }

  // Pass one: resolve and validate every item, writing nothing.
  //
  // The reservation used to happen inside this loop, so any later item that was
  // missing, inactive, unstocked or short returned early with the earlier items
  // already reserved in the database. Nothing released them: availableQuantity
  // is `quantity - reservedQuantity`, so those units became permanently
  // unsellable with no endpoint to clear them and no sign in the UI. Validating
  // first means the common failures never reserve at all.
  const preparedItems = [];
  const resolvedStocks = [];
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) {
      return ApiResponse.error(res, 404, `Product ${item.product} not found`);
    }

    if (!product.isActive) {
      return ApiResponse.error(res, 400, `Product ${product.name} is not active`);
    }

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

    resolvedStocks.push({ stock, quantity: item.quantity });
  }

  // Two items in one order can name the same product, and the per-item
  // hasSufficientStock check above passes each on its own. Sum them and check
  // the total against one row, or an order for 6 + 6 of a product with 8 in
  // stock reserves 12 and drives availableQuantity negative.
  const totalsByStock = new Map();
  resolvedStocks.forEach(({ stock, quantity }, index) => {
    const key = String(stock._id);
    const seen = totalsByStock.get(key);
    totalsByStock.set(key, {
      stock,
      name: seen ? seen.name : preparedItems[index].name,
      quantity: (seen ? seen.quantity : 0) + quantity
    });
  });
  for (const { stock, name, quantity } of totalsByStock.values()) {
    if (!stock.hasSufficientStock(quantity)) {
      return ApiResponse.error(
        res,
        400,
        `Insufficient stock for ${name}. Available: ${stock.availableQuantity}, Requested: ${quantity}`
      );
    }
  }

  // Pass two: reserve, then create. Anything that throws from here on must put
  // back exactly what it took. This is a compensating action, not a
  // transaction: production Mongo is standalone, so sessions are unavailable.
  // GAP-046 owns the real atomicity fix.
  const reserved = [];
  let order;
  try {
    for (const { stock, quantity } of resolvedStocks) {
      await stock.reserveStock(quantity);
      reserved.push({ stock, quantity });
    }

    // The order number is allocated by SalesOrder's validate hook, atomically.
    // This used to build it here from a document count, which two cashiers
    // ringing up in the same second would compute identically; the second lost
    // on the unique index, and offline that discarded a real sale.
    order = await SalesOrder.create({
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
  } catch (error) {
    // Release in reverse so a partially-applied release is still consistent.
    for (const { stock, quantity } of reserved.reverse()) {
      try {
        await stock.releaseReservedStock(quantity);
      } catch (releaseError) {
        // A failed release is worse than the original error, because it is the
        // leak this block exists to prevent. Log it with enough to reconcile by
        // hand and keep releasing the rest.
        console.error(
          'Failed to release reserved stock after order-creation failure:',
          { stockId: String(stock._id), quantity },
          releaseError
        );
      }
    }
    throw error;
  }

  // A counter sale paid in full is finished the moment it is rung up: the cash
  // is in the drawer and the goods have left with the customer. Leaving it
  // 'pending' meant the stock stayed reserved rather than deducted, so the shelf
  // count stayed wrong until someone remembered to walk the order through two
  // more status changes — and the sale never reached the transaction log.
  //
  // Partial or unpaid orders stay pending, which is what that status is for.
  if (order.payment.status === 'paid') {
    await completeSalesOrder(order, req.user);
    await order.save();
  }

  // Populate for response
  const populatedOrder = await SalesOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('processedBy', 'name')
    .populate('items.product', 'sku name brand images');

  // Invalidate cache. Stock too when the order completed, since quantities moved.
  await CacheUtil.delPattern('cache:sales:*');
  if (order.status === 'completed') {
    await CacheUtil.delPattern('cache:stock:*');
  }

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

  // Valid status transitions.
  //
  // pending -> completed is allowed directly. 'processing' is a real state for
  // an order being picked or packed, but forcing every sale through it made the
  // common case — hand over the goods, done — a two-step chore, which is what
  // pushed staff to leave orders sitting at pending.
  const validTransitions = {
    pending: ['processing', 'completed', 'cancelled'],
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

  if (status === 'completed') {
    // Shared with the create and payment paths — stock deduction, the movement
    // ledger entry and the transaction record must not drift between them.
    await completeSalesOrder(order, req.user);
  } else if (status === 'cancelled') {
    order.status = status;
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
  } else {
    order.status = status;
  }

  await order.save();

  const populatedOrder = await SalesOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('processedBy', 'name')
    .populate('items.product', 'sku name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:sales:*');
  await CacheUtil.delPattern('cache:stock:*');

  // The order itself is the payload, not { order, statusChange }.
  //
  // The wrapper was typed as a SalesOrder on the client, so `updated._id` was
  // undefined and the detail query was invalidated under the key
  // ['sales','detail',undefined] — which matches nothing. The write succeeded
  // and the screen kept showing the old badge until a remount. The transition
  // is still reported, as a sibling field the client can ignore.
  return ApiResponse.success(
    res,
    200,
    `Sales order ${status} successfully`,
    populatedOrder,
    {
      statusChange: {
        from: oldStatus,
        to: order.status,
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

  // Only 'cancelled' is refused, matching updatePayment in serviceController.
  //
  // Refusing 'completed' too made on-account sales unrecordable. Staff mark an
  // order completed so the shelf count is right; completeSalesOrder sees it is
  // unpaid and deliberately writes no Transaction, documenting that the payment
  // path will write it later. But this guard then refused that payment, so
  // there was no third path: the order stayed payment.status 'pending' forever
  // and no Transaction was ever written, while getSalesStatistics counted it in
  // revenue because that aggregation filters on status 'completed'. Reported
  // revenue and the cash ledger diverged permanently.
  if (order.status === 'cancelled') {
    return ApiResponse.error(res, 400, 'Cannot update payment for a cancelled order');
  }

  if (amountPaid !== undefined) {
    order.payment.amountPaid = amountPaid;
  }
  
  if (paymentMethod) {
    order.payment.method = paymentMethod;
  }

  await order.save(); // Pre-save hook will recalculate payment status and change

  // Settling the balance finishes the sale, the same way paying in full at the
  // counter does. Without this an order paid off later would sit at 'pending'
  // with its stock still merely reserved, which is the confusion this flow was
  // reworked to remove.
  if (order.payment.status === 'paid') {
    // completeSalesOrder is idempotent and returns false when the order is
    // already 'completed', in which case it also writes no Transaction. That is
    // the on-account case: the sale was completed while unpaid, so the money
    // has only now arrived and still needs recording. recordSaleTransaction
    // dedupes by reference, so calling it here can never double-write.
    const justCompleted = await completeSalesOrder(order, req.user);
    if (!justCompleted && order.status === 'completed') {
      await recordSaleTransaction(order, req.user);
    }
    await order.save();
  }

  const populatedOrder = await SalesOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('processedBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:sales:*');
  if (order.status === 'completed') {
    await CacheUtil.delPattern('cache:stock:*');
  }

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
    const branchId = asObjectId(branch);
    if (!branchId) {
      return ApiResponse.error(res, 400, 'Invalid branch ID');
    }
    query.branch = branchId;
  }

  // Date filter. An unparseable date is `Invalid Date`, which Mongoose casts
  // into the filter as null rather than rejecting, so the range would silently
  // stop meaning what it says.
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = asDate(startDate);
    if (endDate) query.createdAt.$lte = asDate(endDate);
  }

  // "Today" and "this month" are wall-clock concepts, so they need a timezone.
  // The container runs UTC, and Manila is UTC+8 — computing these in UTC would
  // roll the day over at 08:00 local, so a morning's takings would be reported
  // against the previous day. REPORT_TIMEZONE defaults to the timezone the
  // seeded branches use.
  const { startOfToday, startOfMonth } = getReportingPeriodBounds(
    process.env.REPORT_TIMEZONE || 'Asia/Manila'
  );

  const revenueSince = (since) =>
    SalesOrder.aggregate([
      { $match: { ...query, status: 'completed', createdAt: { $gte: since } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

  const [
    totalOrders,
    completedOrders,
    cancelledOrders,
    pendingOrders,
    totalRevenue,
    paidOrders,
    todayRevenue,
    monthRevenue
  ] = await Promise.all([
    SalesOrder.countDocuments(query),
    SalesOrder.countDocuments({ ...query, status: 'completed' }),
    SalesOrder.countDocuments({ ...query, status: 'cancelled' }),
    SalesOrder.countDocuments({ ...query, status: 'pending' }),
    SalesOrder.aggregate([
      { $match: { ...query, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]),
    SalesOrder.countDocuments({ ...query, 'payment.status': 'paid' }),
    revenueSince(startOfToday),
    revenueSince(startOfMonth)
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
      today: todayRevenue.length > 0 ? todayRevenue[0].total : 0,
      month: monthRevenue.length > 0 ? monthRevenue[0].total : 0,
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
