const Stock = require('../models/Stock');
const Product = require('../models/Product');
const Branch = require('../models/Branch');
const StockTransfer = require('../models/StockTransfer');
const StockMovement = require('../models/StockMovement');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const CacheUtil = require('../utils/cache');
const { createMovementWithOldQuantity, MOVEMENT_TYPES } = require('../utils/stockMovement');
const { CACHE_TTL, USER_ROLES, PAGINATION } = require('../config/constants');

/**
 * @desc    Get all stock records with filters
 * @route   GET /api/stock
 * @access  Private (Admin, Salesperson)
 */
exports.getAllStock = asyncHandler(async (req, res) => {
  const {
    branch,
    product,
    lowStock,
    outOfStock,
    page = 1,
    limit = PAGINATION.DEFAULT_LIMIT
  } = req.query;

  const query = {};
  
  if (branch) {
    query.branch = branch;
  }
  
  if (product) {
    query.product = product;
  }
  
  if (lowStock === 'true') {
    query.$expr = { $lte: ['$quantity', '$reorderPoint'] };
  }
  
  if (outOfStock === 'true') {
    query.quantity = 0;
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [stockRecords, total] = await Promise.all([
    Stock.find(query)
      .populate('product', 'sku name brand images')
      .populate('branch', 'name code')
      .populate('supplier', 'name code')
      .sort({ 'branch.name': 1, 'product.name': 1 })
      .skip(skip)
      .limit(limitNum),
    Stock.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    stockRecords,
    pageNum,
    limitNum,
    total,
    'Stock records retrieved successfully'
  );
});

/**
 * @desc    Get stock for specific branch
 * @route   GET /api/stock/branch/:branchId
 * @access  Private
 */
exports.getBranchStock = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { category, lowStock, page = 1, limit = 50 } = req.query;

  // Check if branch exists
  const branch = await Branch.findById(branchId);
  if (!branch) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  // Build query
  const query = { branch: branchId };
  
  if (lowStock === 'true') {
    query.$expr = { $lte: ['$quantity', '$reorderPoint'] };
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  // Build product filter if category specified
  let productQuery = {};
  if (category) {
    productQuery.category = category;
  }

  // Get products matching category filter
  const products = category ? await Product.find(productQuery).select('_id') : null;
  if (products && products.length > 0) {
    query.product = { $in: products.map(p => p._id) };
  }

  const [stockRecords, total] = await Promise.all([
    Stock.find(query)
      .populate({
        path: 'product',
        select: 'sku name brand category images',
        populate: { path: 'category', select: 'name code' }
      })
      .populate('supplier', 'name code')
      .sort({ 'product.name': 1 })
      .skip(skip)
      .limit(limitNum),
    Stock.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    stockRecords,
    pageNum,
    limitNum,
    total,
    `Stock for ${branch.name} retrieved successfully`
  );
});

/**
 * @desc    Get stock for specific product across all branches
 * @route   GET /api/stock/product/:productId
 * @access  Private
 */
exports.getProductStock = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const product = await Product.findById(productId);
  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  const stockRecords = await Stock.find({ product: productId })
    .populate('branch', 'name code address')
    .sort({ 'branch.name': 1 });

  const summary = {
    product: {
      _id: product._id,
      sku: product.sku,
      name: product.name,
      brand: product.brand
    },
    totalQuantity: stockRecords.reduce((sum, stock) => sum + stock.quantity, 0),
    totalReserved: stockRecords.reduce((sum, stock) => sum + stock.reservedQuantity, 0),
    totalAvailable: stockRecords.reduce((sum, stock) => sum + stock.availableQuantity, 0),
    branches: stockRecords.map(stock => ({
      branch: stock.branch,
      quantity: stock.quantity,
      reservedQuantity: stock.reservedQuantity,
      availableQuantity: stock.availableQuantity,
      costPrice: stock.costPrice,
      sellingPrice: stock.sellingPrice,
      reorderPoint: stock.reorderPoint,
      stockStatus: stock.stockStatus,
      location: stock.location
    }))
  };

  return ApiResponse.success(
    res,
    200,
    'Product stock retrieved successfully',
    summary
  );
});

/**
 * @desc    Get low stock items
 * @route   GET /api/stock/low-stock
 * @access  Private (Admin, Salesperson)
 */
exports.getLowStock = asyncHandler(async (req, res) => {
  const { branch } = req.query;

  const query = {
    $expr: { $lte: ['$quantity', '$reorderPoint'] }
  };
  
  if (branch) {
    query.branch = branch;
  }

  const lowStockItems = await Stock.find(query)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code')
    .populate('supplier', 'name code contact')
    .sort({ quantity: 1 });

  return ApiResponse.success(
    res,
    200,
    'Low stock items retrieved successfully',
    lowStockItems
  );
});

/**
 * @desc    Add or update stock (restock)
 * @route   POST /api/stock/restock
 * @access  Private (Admin, Salesperson)
 */
exports.restockProduct = asyncHandler(async (req, res) => {
  const {
    product,
    branch,
    quantity,
    costPrice,
    sellingPrice,
    reorderPoint,
    reorderQuantity,
    supplier,
    location
  } = req.body;

  // Validate product and branch exist
  const [productExists, branchExists] = await Promise.all([
    Product.findById(product),
    Branch.findById(branch)
  ]);

  if (!productExists) {
    return ApiResponse.error(res, 404, 'Product not found');
  }
  
  if (!branchExists) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  // Find existing stock record or create new one
  let stock = await Stock.findOne({ product, branch });
  const isNewStock = !stock;
  const oldQuantity = stock ? stock.quantity : 0;

  if (stock) {
    // Update existing stock
    stock.quantity += quantity;
    stock.costPrice = costPrice !== undefined ? costPrice : stock.costPrice;
    stock.sellingPrice = sellingPrice !== undefined ? sellingPrice : stock.sellingPrice;
    stock.reorderPoint = reorderPoint !== undefined ? reorderPoint : stock.reorderPoint;
    stock.reorderQuantity = reorderQuantity !== undefined ? reorderQuantity : stock.reorderQuantity;
    stock.supplier = supplier !== undefined ? supplier : stock.supplier;
    stock.location = location !== undefined ? location : stock.location;
    stock.lastRestockedAt = new Date();
    stock.lastRestockedBy = req.user._id;
    
    await stock.save();
  } else {
    // Create new stock record
    stock = await Stock.create({
      product,
      branch,
      quantity,
      costPrice,
      sellingPrice,
      reorderPoint,
      reorderQuantity,
      supplier,
      location,
      lastRestockedAt: new Date(),
      lastRestockedBy: req.user._id
    });
  }

  // Log stock movement
  await createMovementWithOldQuantity(stock, oldQuantity, {
    type: isNewStock ? MOVEMENT_TYPES.INITIAL : MOVEMENT_TYPES.RESTOCK,
    supplier: supplier || undefined,
    notes: isNewStock ? 'Initial stock setup' : undefined,
    performedBy: req.user._id,
  });

  const populatedStock = await Stock.findById(stock._id)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code')
    .populate('supplier', 'name code')
    .populate('lastRestockedBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    201,
    'Stock restocked successfully',
    populatedStock
  );
});

/**
 * @desc    Adjust stock quantity (manual correction)
 * @route   POST /api/stock/adjust
 * @access  Private (Admin only)
 */
exports.adjustStock = asyncHandler(async (req, res) => {
  const { product, branch, adjustment, reason } = req.body;

  if (!reason) {
    return ApiResponse.error(res, 400, 'Reason for adjustment is required');
  }

  const stock = await Stock.findOne({ product, branch });

  if (!stock) {
    return ApiResponse.error(res, 404, 'Stock record not found');
  }

  const oldQuantity = stock.quantity;
  stock.quantity = Math.max(0, stock.quantity + adjustment);
  await stock.save();

  // Log stock movement
  await createMovementWithOldQuantity(stock, oldQuantity, {
    type: adjustment > 0 ? MOVEMENT_TYPES.ADJUSTMENT_ADD : MOVEMENT_TYPES.ADJUSTMENT_REMOVE,
    reason,
    performedBy: req.user._id,
  });

  const populatedStock = await Stock.findById(stock._id)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    'Stock adjusted successfully',
    {
      stock: populatedStock,
      adjustment: {
        oldQuantity,
        newQuantity: stock.quantity,
        adjustment,
        reason,
        adjustedBy: req.user.name,
        adjustedAt: new Date()
      }
    }
  );
});

/**
 * @desc    Add quantity to existing stock record (simple restock)
 * @route   PUT /api/stock/:id/restock
 * @access  Private (Admin, Salesperson)
 * @note    This does NOT change prices - only adds quantity
 */
exports.restockById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, supplierId, notes } = req.body;

  const stock = await Stock.findById(id);

  if (!stock) {
    return ApiResponse.error(res, 404, 'Stock record not found');
  }

  const oldQuantity = stock.quantity;

  // Simply add quantity - prices stay the same
  stock.quantity += quantity;
  stock.lastRestockedAt = new Date();
  stock.lastRestockedBy = req.user._id;
  
  // Update supplier if provided
  if (supplierId) {
    stock.supplier = supplierId;
  }

  await stock.save();

  // Log stock movement
  await createMovementWithOldQuantity(stock, oldQuantity, {
    type: MOVEMENT_TYPES.RESTOCK,
    supplier: supplierId || undefined,
    notes: notes || undefined,
    performedBy: req.user._id,
  });

  const populatedStock = await Stock.findById(stock._id)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code')
    .populate('supplier', 'name code')
    .populate('lastRestockedBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    `Added ${quantity} units to stock`,
    populatedStock
  );
});

/**
 * @desc    Adjust stock quantity by ID (manual correction)
 * @route   PUT /api/stock/:id/adjust
 * @access  Private (Admin only)
 */
exports.adjustById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, reason, notes } = req.body;

  const stock = await Stock.findById(id);

  if (!stock) {
    return ApiResponse.error(res, 404, 'Stock record not found');
  }

  const oldQuantity = stock.quantity;
  stock.quantity = Math.max(0, stock.quantity + quantity);
  await stock.save();

  // Log stock movement
  await createMovementWithOldQuantity(stock, oldQuantity, {
    type: quantity > 0 ? MOVEMENT_TYPES.ADJUSTMENT_ADD : MOVEMENT_TYPES.ADJUSTMENT_REMOVE,
    reason,
    notes: notes || undefined,
    performedBy: req.user._id,
  });

  const populatedStock = await Stock.findById(stock._id)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    'Stock adjusted successfully',
    {
      stock: populatedStock,
      adjustment: {
        oldQuantity,
        newQuantity: stock.quantity,
        adjustment: quantity,
        reason,
        notes,
        adjustedBy: req.user.name,
        adjustedAt: new Date()
      }
    }
  );
});

/**
 * @desc    Create stock transfer
 * @route   POST /api/stock/transfers
 * @access  Private (Admin, Branch Manager)
 */
exports.createStockTransfer = asyncHandler(async (req, res) => {
  const { product, fromBranch, toBranch, quantity, notes } = req.body;

  // Validate branches are different
  if (fromBranch === toBranch) {
    return ApiResponse.error(res, 400, 'Source and destination branches must be different');
  }

  // Check if source branch has sufficient stock
  const sourceStock = await Stock.findOne({ product, branch: fromBranch });

  if (!sourceStock) {
    return ApiResponse.error(res, 404, 'No stock found at source branch');
  }

  if (!sourceStock.hasSufficientStock(quantity)) {
    return ApiResponse.error(
      res,
      400,
      `Insufficient stock available. Available: ${sourceStock.availableQuantity}, Requested: ${quantity}`
    );
  }

  // Reserve stock at source
  await sourceStock.reserveStock(quantity);

  // Create transfer record
  const transfer = await StockTransfer.create({
    product,
    fromBranch,
    toBranch,
    quantity,
    initiatedBy: req.user._id,
    notes
  });

  const populatedTransfer = await StockTransfer.findById(transfer._id)
    .populate('product', 'sku name brand')
    .populate('fromBranch', 'name code address')
    .populate('toBranch', 'name code address')
    .populate('initiatedBy', 'name email');

  // TODO: Send notification to destination branch manager (Phase 9)

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    201,
    'Stock transfer created successfully',
    populatedTransfer
  );
});

/**
 * @desc    Update stock transfer status
 * @route   PUT /api/stock/transfers/:id
 * @access  Private (Admin, Branch Manager)
 */
exports.updateStockTransferStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const transfer = await StockTransfer.findById(id);

  if (!transfer) {
    return ApiResponse.error(res, 404, 'Stock transfer not found');
  }

  // Validate status transition
  const validTransitions = {
    pending: ['in-transit', 'cancelled'],
    'in-transit': ['completed', 'cancelled'],
    completed: [],
    cancelled: []
  };

  if (!validTransitions[transfer.status].includes(status)) {
    return ApiResponse.error(
      res,
      400,
      `Cannot transition from ${transfer.status} to ${status}`
    );
  }

  const oldStatus = transfer.status;
  transfer.status = status;

  if (status === 'in-transit') {
    transfer.shippedAt = new Date();
    transfer.approvedBy = req.user._id;
  } else if (status === 'completed') {
    transfer.receivedAt = new Date();
    transfer.receivedBy = req.user._id;

    // Deduct from source branch
    const sourceStock = await Stock.findOne({
      product: transfer.product,
      branch: transfer.fromBranch
    });

    const sourceOldQuantity = sourceStock ? sourceStock.quantity : 0;

    if (sourceStock) {
      await sourceStock.deductStock(transfer.quantity);
      
      // Log transfer out movement
      await createMovementWithOldQuantity(sourceStock, sourceOldQuantity, {
        type: MOVEMENT_TYPES.TRANSFER_OUT,
        reference: { type: 'StockTransfer', id: transfer._id },
        notes: `Transfer to ${transfer.toBranch}`,
        performedBy: req.user._id,
      });
    }

    // Add to destination branch
    let destStock = await Stock.findOne({
      product: transfer.product,
      branch: transfer.toBranch
    });

    const destOldQuantity = destStock ? destStock.quantity : 0;
    const isNewDestStock = !destStock;

    if (destStock) {
      destStock.quantity += transfer.quantity;
      await destStock.save();
    } else {
      // Create new stock record at destination with source pricing
      destStock = await Stock.create({
        product: transfer.product,
        branch: transfer.toBranch,
        quantity: transfer.quantity,
        costPrice: sourceStock.costPrice,
        sellingPrice: sourceStock.sellingPrice,
        reorderPoint: sourceStock.reorderPoint,
        reorderQuantity: sourceStock.reorderQuantity,
        supplier: sourceStock.supplier,
        lastRestockedAt: new Date(),
        lastRestockedBy: req.user._id
      });
    }

    // Log transfer in movement
    await createMovementWithOldQuantity(destStock, destOldQuantity, {
      type: MOVEMENT_TYPES.TRANSFER_IN,
      reference: { type: 'StockTransfer', id: transfer._id },
      notes: `Transfer from ${transfer.fromBranch}`,
      performedBy: req.user._id,
    });

  } else if (status === 'cancelled') {
    // Release reserved stock at source
    const sourceStock = await Stock.findOne({
      product: transfer.product,
      branch: transfer.fromBranch
    });

    if (sourceStock) {
      await sourceStock.releaseReservedStock(transfer.quantity);
    }
  }

  await transfer.save();

  const populatedTransfer = await StockTransfer.findById(transfer._id)
    .populate('product', 'sku name brand')
    .populate('fromBranch', 'name code')
    .populate('toBranch', 'name code')
    .populate('initiatedBy', 'name')
    .populate('approvedBy', 'name')
    .populate('receivedBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    'Stock transfer status updated successfully',
    {
      transfer: populatedTransfer,
      statusChange: {
        from: oldStatus,
        to: status,
        updatedBy: req.user.name,
        updatedAt: new Date()
      }
    }
  );
});

/**
 * @desc    Get stock transfer history
 * @route   GET /api/stock/transfers
 * @access  Private
 */
exports.getStockTransfers = asyncHandler(async (req, res) => {
  const { branch, status, page = 1, limit = 20 } = req.query;

  const query = {};
  
  if (branch) {
    query.$or = [
      { fromBranch: branch },
      { toBranch: branch }
    ];
  }
  
  if (status) {
    query.status = status;
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [transfers, total] = await Promise.all([
    StockTransfer.find(query)
      .populate('product', 'sku name brand')
      .populate('fromBranch', 'name code')
      .populate('toBranch', 'name code')
      .populate('initiatedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    StockTransfer.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    transfers,
    pageNum,
    limitNum,
    total,
    'Stock transfers retrieved successfully'
  );
});

/**
 * @desc    Get single stock transfer details
 * @route   GET /api/stock/transfers/:id
 * @access  Private
 */
exports.getStockTransfer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const transfer = await StockTransfer.findById(id)
    .populate('product', 'sku name brand images')
    .populate('fromBranch', 'name code address contact')
    .populate('toBranch', 'name code address contact')
    .populate('initiatedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate('receivedBy', 'name email');

  if (!transfer) {
    return ApiResponse.error(res, 404, 'Stock transfer not found');
  }

  return ApiResponse.success(
    res,
    200,
    'Stock transfer retrieved successfully',
    transfer
  );
});

// ============ Stock Movement Methods ============

/**
 * @desc    Get all stock movements with filters
 * @route   GET /api/stock/movements
 * @access  Private (Admin)
 */
exports.getMovements = asyncHandler(async (req, res) => {
  const { 
    type, 
    branch, 
    product, 
    startDate, 
    endDate, 
    page = 1, 
    limit = 20 
  } = req.query;

  const query = {};

  if (type) {
    query.type = type;
  }

  if (branch) {
    query.branch = branch;
  }

  if (product) {
    query.product = product;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [movements, total] = await Promise.all([
    StockMovement.find(query)
      .populate('product', 'sku name brand')
      .populate('branch', 'name code')
      .populate('supplier', 'name code')
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    StockMovement.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    movements,
    pageNum,
    limitNum,
    total,
    'Stock movements retrieved successfully'
  );
});

/**
 * @desc    Get movements for a specific stock record
 * @route   GET /api/stock/movements/stock/:stockId
 * @access  Private (Admin, Salesperson)
 */
exports.getMovementsByStock = asyncHandler(async (req, res) => {
  const { stockId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  // Verify stock exists
  const stock = await Stock.findById(stockId);
  if (!stock) {
    return ApiResponse.error(res, 404, 'Stock record not found');
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [movements, total] = await Promise.all([
    StockMovement.find({ stock: stockId })
      .populate('product', 'sku name brand')
      .populate('branch', 'name code')
      .populate('supplier', 'name code')
      .populate('performedBy', 'name email')
      .populate({
        path: 'reference.id',
        select: 'orderId transferId status'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    StockMovement.countDocuments({ stock: stockId })
  ]);

  return ApiResponse.paginate(
    res,
    movements,
    pageNum,
    limitNum,
    total,
    'Stock movements retrieved successfully'
  );
});

/**
 * @desc    Get movements for a specific product across all branches
 * @route   GET /api/stock/movements/product/:productId
 * @access  Private (Admin, Salesperson)
 */
exports.getMovementsByProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { branch, page = 1, limit = 20 } = req.query;

  // Verify product exists
  const product = await Product.findById(productId);
  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  const query = { product: productId };
  if (branch) {
    query.branch = branch;
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [movements, total] = await Promise.all([
    StockMovement.find(query)
      .populate('branch', 'name code')
      .populate('supplier', 'name code')
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    StockMovement.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    movements,
    pageNum,
    limitNum,
    total,
    'Product movements retrieved successfully'
  );
});

/**
 * @desc    Get movements for a specific branch
 * @route   GET /api/stock/movements/branch/:branchId
 * @access  Private (Admin + Branch Access)
 */
exports.getMovementsByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { type, startDate, endDate, page = 1, limit = 20 } = req.query;

  // Verify branch exists
  const branch = await Branch.findById(branchId);
  if (!branch) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  const query = { branch: branchId };

  if (type) {
    query.type = type;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [movements, total] = await Promise.all([
    StockMovement.find(query)
      .populate('product', 'sku name brand')
      .populate('supplier', 'name code')
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    StockMovement.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    movements,
    pageNum,
    limitNum,
    total,
    `Movements for ${branch.name} retrieved successfully`
  );
});
