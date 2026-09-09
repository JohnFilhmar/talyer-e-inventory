import ServiceOrder from '../models/ServiceOrder.js';
import Stock from '../models/Stock.js';
import Product from '../models/Product.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import CacheUtil from '../utils/cache.js';
import { PAGINATION, USER_ROLES } from '../config/constants.js';
import { createMovementWithOldQuantity, MOVEMENT_TYPES } from '../utils/stockMovement.js';
import { roundCurrency } from '../utils/currency.js';
import { asObjectId } from '../utils/narrowing.js';
import { canAccessBranch } from '../utils/branchScope.js';
import { escapeRegex } from '../utils/regex.js';
// The fields a list may be ordered by. `sortBy` is used as an object key, so an
// allow-list is what keeps an arbitrary string out of that position; anything
// outside it is rejected by the route rather than silently ignored.
export const SERVICE_SORT_FIELDS = ['createdAt', 'jobNumber', 'totalAmount', 'status', 'priority'];

/**
 * Normalize a branch reference that may be a populated Branch document or a
 * raw ObjectId into a plain string id.
 */
const resolveBranchId = (branchRef) =>
  branchRef?._id ? branchRef._id.toString() : branchRef?.toString();

/**
 * @desc    Get all service orders with filters
 * @route   GET /api/services
 * @access  Private (Admin, Salesperson, Mechanic)
 */
export const getServiceOrders = asyncHandler(async (req, res) => {
  const {
    branch,
    status,
    priority,
    assignedTo,
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

  // A mechanic sees only their own jobs, and the `?assignedTo=` filter cannot
  // move them off that. The previous shape was
  // `if (MECHANIC && !assignedTo) ... else if (assignedTo) ...`, so a mechanic
  // who supplied the parameter took the second branch and read another
  // mechanic's jobs within their branch. Everyone else may filter freely: only
  // admins see across branches, and the branch clamp above already applies.
  if (req.user.role === USER_ROLES.MECHANIC) {
    query.assignedTo = req.user._id;
  } else if (assignedTo) {
    query.assignedTo = assignedTo;
  }
  
  if (status) {
    query.status = status;
  }
  
  if (priority) {
    query.priority = priority;
  }
  
  if (paymentStatus) {
    query['payment.status'] = paymentStatus;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Same server-side search as the sales list, over the fields a service order
  // is actually looked up by: its job number, the customer, and the vehicle a
  // counter operator has in front of them.
  if (search) {
    const pattern = { $regex: escapeRegex(search), $options: 'i' };
    query.$or = [
      { jobNumber: pattern },
      { 'customer.name': pattern },
      { 'customer.phone': pattern },
      { 'vehicle.plateNumber': pattern }
    ];
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const sort = { [SERVICE_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt']:
    sortOrder === 'asc' ? 1 : -1 };

  const [orders, total] = await Promise.all([
    ServiceOrder.find(query)
      .populate('branch', 'name code')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
      .populate('partsUsed.product', 'sku name')
      .skip(skip)
      .limit(limitNum)
      .sort(sort),
    ServiceOrder.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    orders,
    pageNum,
    limitNum,
    total,
    'Service orders retrieved successfully'
  );
});

/**
 * @desc    Get mechanic's assigned jobs
 * @route   GET /api/services/my-jobs
 * @access  Private (Mechanic)
 */
export const getMyJobs = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const query = {
    assignedTo: req.user._id
  };
  
  if (status) {
    query.status = status;
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [orders, total] = await Promise.all([
    ServiceOrder.find(query)
      .populate('branch', 'name code')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
      .populate('partsUsed.product', 'sku name')
      .skip(skip)
      .limit(limitNum)
      .sort({ priority: -1, createdAt: -1 }),
    ServiceOrder.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    orders,
    pageNum,
    limitNum,
    total,
    'Your assigned jobs retrieved successfully'
  );
});

/**
 * @desc    Get single service order
 * @route   GET /api/services/:id
 * @access  Private
 */
export const getServiceOrder = asyncHandler(async (req, res) => {
  const order = await ServiceOrder.findById(req.params.id)
    .populate('branch', 'name code address phone')
    .populate('assignedTo', 'name email phone')
    .populate('createdBy', 'name email')
    .populate('partsUsed.product', 'sku name brand');

  if (!order) {
    return ApiResponse.error(res, 404, 'Service order not found');
  }

  // Check access
  if (req.user.role === USER_ROLES.MECHANIC && order.assignedTo?._id.toString() !== req.user._id.toString()) {
    return ApiResponse.error(res, 403, 'Access denied to this service order');
  }

  if (!canAccessBranch(req.user, resolveBranchId(order.branch))) {
    return ApiResponse.error(res, 403, 'Access denied to this branch');
  }

  return ApiResponse.success(res, 200, 'Service order retrieved successfully', order);
});

/**
 * @desc    Create new service order
 * @route   POST /api/services
 * @access  Private (Admin, Salesperson)
 */
export const createServiceOrder = asyncHandler(async (req, res) => {
  const {
    clientRequestId,
    branch,
    customer,
    vehicle,
    description,
    diagnosis,
    assignedTo,
    priority,
    laborCost,
    otherCharges,
    scheduledAt,
    notes
  } = req.body;

  // Basic required field validation to return 400 instead of 500
  if (!branch) {
    return ApiResponse.error(res, 400, 'Branch is required');
  }
  if (!customer || !customer.name || !customer.phone) {
    return ApiResponse.error(res, 400, 'Customer name and phone are required');
  }
  if (!description) {
    return ApiResponse.error(res, 400, 'Service description is required');
  }

  // Validate branch access
  if (!canAccessBranch(req.user, branch)) {
    return ApiResponse.error(res, 403, 'Cannot create service order for different branch');
  }

  // Idempotent replay of a queued offline order. This must run before any
  // stock is touched below (parts lookups, reservations) — otherwise a replay
  // would silently double-reserve or double-deduct stock while still appearing
  // to succeed. Scoped to `branch` (already access-checked above) so a guessed
  // key cannot be used to read an order from a branch the caller cannot reach.
  if (clientRequestId) {
    // Narrowed at the sink, the same as the sales path. See utils/narrowing.js.
    const replayKey = asObjectId(clientRequestId);
    const replayBranch = asObjectId(branch);
    if (!replayKey || !replayBranch) {
      return ApiResponse.error(res, 400, 'Invalid clientRequestId or branch');
    }

    const existing = await ServiceOrder.findOne({
      clientRequestId: replayKey,
      branch: replayBranch,
    })
      .populate('branch', 'name code')
      .populate('assignedTo', 'name')
      .populate('createdBy', 'name');
    if (existing) {
      return ApiResponse.success(res, 200, 'Service order already recorded', existing);
    }
  }

  // Validate mechanic if assigned. Narrowed at the sink: the route's chain is
  // in another module, and a value that is not an id cannot name a mechanic.
  if (assignedTo) {
    const assignedToId = asObjectId(assignedTo);
    const mechanic = assignedToId ? await User.findById(assignedToId) : null;
    if (!mechanic) {
      return ApiResponse.error(res, 404, 'Assigned mechanic not found');
    }
    if (mechanic.role !== USER_ROLES.MECHANIC) {
      return ApiResponse.error(res, 400, 'Assigned user must be a mechanic');
    }
    if (req.user.role !== USER_ROLES.ADMIN && mechanic.branch.toString() !== branch) {
      return ApiResponse.error(res, 400, 'Cannot assign mechanic from different branch');
    }
  }

  // The job number is allocated by ServiceOrder's validate hook, atomically.
  const order = await ServiceOrder.create({
    clientRequestId,
    branch,
    customer,
    vehicle,
    description,
    diagnosis,
    assignedTo,
    priority: priority || 'normal',
    laborCost: laborCost || 0,
    otherCharges: otherCharges || 0,
    scheduledAt,
    status: assignedTo ? 'scheduled' : 'pending',
    createdBy: req.user._id,
    notes
  });

  // Populate for response
  const populatedOrder = await ServiceOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:services:*');

  return ApiResponse.success(
    res,
    201,
    'Service order created successfully',
    populatedOrder
  );
});

/**
 * @desc    Assign/reassign mechanic
 * @route   PUT /api/services/:id/assign
 * @access  Private (Admin, Manager)
 */
export const assignMechanic = asyncHandler(async (req, res) => {
  const { mechanicId } = req.body;
  const order = await ServiceOrder.findById(req.params.id);

  if (!order) {
    return ApiResponse.error(res, 404, 'Service order not found');
  }

  // Check access
  if (!canAccessBranch(req.user, resolveBranchId(order.branch))) {
    return ApiResponse.error(res, 403, 'Access denied to this order');
  }

  // Validate mechanic. Narrowed at the sink: this route reached the controller
  // with no chain at all before GAP-017, which is the assumption being removed.
  const mechanicRef = asObjectId(mechanicId);
  const mechanic = mechanicRef ? await User.findById(mechanicRef) : null;
  if (!mechanic) {
    return ApiResponse.error(res, 404, 'Mechanic not found');
  }
  if (mechanic.role !== USER_ROLES.MECHANIC) {
    return ApiResponse.error(res, 400, 'Assigned user must be a mechanic');
  }
  if (req.user.role !== USER_ROLES.ADMIN && mechanic.branch.toString() !== order.branch.toString()) {
    return ApiResponse.error(res, 400, 'Cannot assign mechanic from different branch');
  }

  order.assignedTo = mechanicId;
  if (order.status === 'pending') {
    order.status = 'scheduled';
  }
  
  await order.save();

  const populatedOrder = await ServiceOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:services:*');

  return ApiResponse.success(
    res,
    200,
    'Mechanic assigned successfully',
    populatedOrder
  );
});

/**
 * @desc    Update service order status
 * @route   PUT /api/services/:id/status
 * @access  Private (Admin, Mechanic)
 */
export const updateServiceOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = await ServiceOrder.findById(id);

  if (!order) {
    return ApiResponse.error(res, 404, 'Service order not found');
  }

  // Check access
  const assignedId = order.assignedTo && order.assignedTo._id
    ? order.assignedTo._id.toString()
    : order.assignedTo
      ? order.assignedTo.toString()
      : null;
  if (req.user.role === USER_ROLES.MECHANIC && assignedId !== req.user._id.toString()) {
    return ApiResponse.error(res, 403, 'Access denied to this order');
  }

  if (!canAccessBranch(req.user, resolveBranchId(order.branch))) {
    return ApiResponse.error(res, 403, 'Access denied to this branch');
  }

  // Validate status transition
  const validTransitions = {
    pending: ['scheduled', 'cancelled'],
    scheduled: ['in-progress', 'cancelled'],
    'in-progress': ['completed', 'cancelled'],
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

  if (status === 'in-progress' && !order.startedAt) {
    order.startedAt = new Date();
  }

  if (status === 'completed') {
    // Resolve every part's stock row before deducting any. A missing row used
    // to be skipped silently, so the job completed and was billed while the
    // parts were never taken off the shelf. Refusing up front also stops a
    // later missing row leaving the order half-deducted.
    const partDeductions = [];
    for (const part of order.partsUsed) {
      const stock = await Stock.findOne({
        product: part.product,
        branch: order.branch
      });

      if (!stock) {
        return ApiResponse.error(
          res,
          400,
          `Cannot complete job ${order.jobNumber}: no stock record for product ${part.product} at this branch`
        );
      }

      partDeductions.push({ stock, quantity: part.quantity });
    }

    // Deduct parts from stock
    for (const { stock, quantity } of partDeductions) {
      const oldQuantity = stock.quantity;
      await stock.deductStock(quantity);

      // Log stock movement for service parts usage
      await createMovementWithOldQuantity(stock, oldQuantity, {
        type: MOVEMENT_TYPES.SERVICE_USE,
        reference: { type: 'ServiceOrder', id: order._id },
        notes: `Service order ${order.jobNumber} - parts used`,
        performedBy: req.user._id,
      });
    }

    // Create transaction record if paid
    if (order.payment.status === 'paid') {
      // The transaction number is allocated by Transaction's validate hook. The
      // number built here was `TXN-<count>-<timestamp>`, which is not the
      // `TXN-YYYYMM-NNNNNN` format the model and the docs describe, and
      // supplying it meant the model's own generator never ran.
      await Transaction.create({
        type: 'service',
        branch: order.branch,
        amount: roundCurrency(order.totalAmount),
        paymentMethod: order.payment.method,
        reference: {
          model: 'ServiceOrder',
          id: order._id
        },
        description: `Service Order ${order.jobNumber}`,
        processedBy: req.user._id
      });
    }

    order.completedAt = new Date();
  }

  await order.save();

  const populatedOrder = await ServiceOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name')
    .populate('partsUsed.product', 'sku name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:services:*');
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    'Service order status updated successfully',
    {
      order: populatedOrder,
      statusChanged: { from: oldStatus, to: status }
    }
  );
});

/**
 * @desc    Add/update parts used
 * @route   PUT /api/services/:id/parts
 * @access  Private (Admin, Mechanic)
 */
export const updatePartsUsed = asyncHandler(async (req, res) => {
  const { partsUsed } = req.body;
  const order = await ServiceOrder.findById(req.params.id);

  if (!order) {
    return ApiResponse.error(res, 404, 'Service order not found');
  }

  // Check access
  const assignedId = order.assignedTo && order.assignedTo._id
    ? order.assignedTo._id.toString()
    : order.assignedTo
      ? order.assignedTo.toString()
      : null;
  if (req.user.role === USER_ROLES.MECHANIC && assignedId !== req.user._id.toString()) {
    return ApiResponse.error(res, 403, 'Access denied to this order');
  }

  if (!canAccessBranch(req.user, resolveBranchId(order.branch))) {
    return ApiResponse.error(res, 403, 'Access denied to this branch');
  }

  if (order.status === 'completed' || order.status === 'cancelled') {
    return ApiResponse.error(res, 400, 'Cannot update parts for completed or cancelled orders');
  }

  // Validate and prepare parts
  const preparedParts = [];
  for (const part of partsUsed) {
    // Narrowed at the sink. `partsUsed` is an array of objects, so each element
    // is a body value the route chain reaches only by validating a wildcard
    // path, and both reads below take the id straight into a filter.
    const partProductId = asObjectId(part.product);
    const product = partProductId ? await Product.findById(partProductId) : null;
    if (!product) {
      return ApiResponse.error(res, 404, `Product ${part.product} not found`);
    }

    const stock = await Stock.findOne({ product: partProductId, branch: order.branch });
    if (!stock) {
      return ApiResponse.error(
        res,
        404,
        `Product ${product.name} is not available at this branch`
      );
    }

    if (!stock.hasSufficientStock(part.quantity)) {
      return ApiResponse.error(
        res,
        400,
        `Insufficient stock for ${product.name}. Available: ${stock.availableQuantity}, Requested: ${part.quantity}`
      );
    }

    preparedParts.push({
      product: product._id,
      sku: product.sku,
      name: product.name,
      quantity: part.quantity,
      unitPrice: stock.sellingPrice,
      total: 0 // Will be calculated in pre-save hook
    });
  }

  order.partsUsed = preparedParts;
  await order.save();

  const populatedOrder = await ServiceOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('assignedTo', 'name email')
    .populate('partsUsed.product', 'sku name brand');

  // Invalidate cache
  await CacheUtil.delPattern('cache:services:*');

  return ApiResponse.success(
    res,
    200,
    'Parts updated successfully',
    populatedOrder
  );
});

/**
 * @desc    Update payment
 * @route   PUT /api/services/:id/payment
 * @access  Private (Admin, Salesperson)
 */
export const updatePayment = asyncHandler(async (req, res) => {
  const { paymentMethod, amountPaid } = req.body;
  const order = await ServiceOrder.findById(req.params.id);

  if (!order) {
    return ApiResponse.error(res, 404, 'Service order not found');
  }

  // Check access
  if (!canAccessBranch(req.user, resolveBranchId(order.branch))) {
    return ApiResponse.error(res, 403, 'Access denied to this order');
  }

  if (order.status === 'cancelled') {
    return ApiResponse.error(res, 400, 'Cannot update payment for cancelled order');
  }

  if (paymentMethod) {
    order.payment.method = paymentMethod;
  }

  if (amountPaid !== undefined) {
    order.payment.amountPaid = amountPaid;
  }

  const wasUnpaid = order.payment.status !== 'paid';
  await order.save();

  // Create transaction if order is completed and now fully paid
  if (order.status === 'completed' && order.payment.status === 'paid' && wasUnpaid) {
    // Allocated by Transaction's validate hook; see the note on the other
    // transaction write in this file.
    await Transaction.create({
      type: 'service',
      branch: order.branch,
      amount: roundCurrency(order.totalAmount),
      paymentMethod: order.payment.method,
      reference: {
        model: 'ServiceOrder',
        id: order._id
      },
      description: `Service Order ${order.jobNumber}`,
      processedBy: req.user._id
    });
  }

  const populatedOrder = await ServiceOrder.findById(order._id)
    .populate('branch', 'name code')
    .populate('assignedTo', 'name email')
    .populate('partsUsed.product', 'sku name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:services:*');

  return ApiResponse.success(
    res,
    200,
    'Payment updated successfully',
    populatedOrder
  );
});

/**
 * @desc    Cancel service order
 * @route   DELETE /api/services/:id
 * @access  Private (Admin only)
 */
export const cancelServiceOrder = asyncHandler(async (req, res) => {
  const order = await ServiceOrder.findById(req.params.id);

  if (!order) {
    return ApiResponse.error(res, 404, 'Service order not found');
  }

  if (order.status === 'completed') {
    return ApiResponse.error(res, 400, 'Cannot cancel completed service order');
  }

  if (order.status === 'cancelled') {
    return ApiResponse.error(res, 400, 'Service order is already cancelled');
  }

  order.status = 'cancelled';
  await order.save();

  // Invalidate cache
  await CacheUtil.delPattern('cache:services:*');

  return ApiResponse.success(
    res,
    200,
    'Service order cancelled successfully',
    { id: order._id, jobNumber: order.jobNumber, status: 'cancelled' }
  );
});

/**
 * @desc    Get service invoice
 * @route   GET /api/services/:id/invoice
 * @access  Private
 */
export const getServiceInvoice = asyncHandler(async (req, res) => {
  const order = await ServiceOrder.findById(req.params.id)
    .populate('branch', 'name code address phone email')
    .populate('assignedTo', 'name')
    .populate('createdBy', 'name')
    .populate('partsUsed.product', 'sku name brand');

  if (!order) {
    return ApiResponse.error(res, 404, 'Service order not found');
  }

  // Check access
  if (
    req.user.role === USER_ROLES.MECHANIC &&
    order.assignedTo?._id.toString() !== req.user._id.toString()
  ) {
    return ApiResponse.error(res, 403, 'Access denied to this service order');
  }

  if (req.user.role !== USER_ROLES.ADMIN) {
    const orderBranchId = order.branch?._id ? order.branch._id.toString() : order.branch?.toString();
    if (!req.user.branch || orderBranchId !== req.user.branch.toString()) {
      return ApiResponse.error(res, 403, 'Access denied to this branch');
    }
  }

  const invoice = {
    jobNumber: order.jobNumber,
    date: order.createdAt,
    completedDate: order.completedAt,
    branch: order.branch,
    customer: order.customer,
    vehicle: order.vehicle,
    assignedMechanic: order.assignedTo,
    description: order.description,
    diagnosis: order.diagnosis,
    partsUsed: order.partsUsed,
    totalParts: order.totalParts,
    laborCost: order.laborCost,
    otherCharges: order.otherCharges,
    totalAmount: order.totalAmount,
    payment: order.payment,
    notes: order.notes,
    status: order.status
  };

  return ApiResponse.success(res, 200, 'Invoice retrieved successfully', invoice);
});
