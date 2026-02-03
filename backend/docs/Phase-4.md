# Phase 4: Inventory & Stock Management (MVP CRITICAL)

> **IMPORTANT**: Before implementing any feature in this phase, always refer back to [Planning.md](./Planning.md) and [README.md](../README.md) to ensure alignment with system requirements and scope. This phase is **CRITICAL for MVP** as it implements branch-specific pricing and stock tracking - core requirements for the multi-branch inventory system.

---

## 🎯 Phase Objectives

Build the inventory and stock management system with branch-specific operations. This is the **heart of the MVP** that enables:
- **Branch-specific stock tracking** - Each branch maintains its own inventory levels
- **Branch-specific pricing** - Same product can have different prices per branch
- **Stock transfers between branches** - Move inventory between locations
- **Low stock alerts** - Automatic notifications for reorder points
- **Supplier management** - Track product suppliers
- **Stock adjustments** - Manual stock corrections and restocking

**Expected Outcome**: A fully functional inventory management system where each branch independently tracks stock levels and pricing, with the ability to transfer stock between branches.

---

## 📋 Pre-requisites

### Must Be Completed First ✅
- [x] **Phase 1: Core Infrastructure** - ApiResponse, Cache, Constants, Validation
- [x] **Phase 2: Branch Management** - Branches must exist
- [x] **Phase 3: Product & Category Management** - Products must exist

### Required Services Running ✅
- MongoDB running on `localhost:27017`
- Redis running on `localhost:6379` (optional but recommended)
- Backend server running
- At least one branch and one product in the system

---

## 🛠️ Implementation Steps

### Step 1: Create Supplier Model
**File**: `src/models/Supplier.js`

**Purpose**: Track product suppliers for procurement.

**Implementation**:
```javascript
const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Supplier name is required'],
      unique: true,
      trim: true,
      maxlength: [200, 'Supplier name cannot exceed 200 characters']
    },
    code: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [50, 'Supplier code cannot exceed 50 characters']
    },
    contact: {
      person: {
        type: String,
        trim: true
      },
      phone: {
        type: String,
        required: [true, 'Phone number is required']
      },
      email: {
        type: String,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
      },
      fax: String
    },
    address: {
      street: String,
      city: String,
      province: String,
      postalCode: String,
      country: {
        type: String,
        default: 'Philippines'
      }
    },
    paymentTerms: {
      type: String,
      enum: ['cash', 'cod', 'net-15', 'net-30', 'net-60', 'net-90'],
      default: 'net-30'
    },
    taxId: {
      type: String,
      trim: true
    },
    website: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
supplierSchema.index({ name: 1 });
supplierSchema.index({ code: 1 });
supplierSchema.index({ isActive: 1 });

// Auto-generate code from name if not provided
supplierSchema.pre('save', function(next) {
  if (!this.code && this.name) {
    this.code = this.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);
  }
  next();
});

const Supplier = mongoose.model('Supplier', supplierSchema);

module.exports = Supplier;
```

---

### Step 2: Create Stock Model (CRITICAL - Branch-Specific Pricing)
**File**: `src/models/Stock.js`

**Purpose**: Track inventory levels and pricing PER BRANCH. This is the core of multi-branch inventory.

**Implementation**:
```javascript
const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required']
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      default: 0,
      min: [0, 'Quantity cannot be negative']
    },
    reservedQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Reserved quantity cannot be negative']
    },
    // CRITICAL: Branch-specific pricing
    costPrice: {
      type: Number,
      required: [true, 'Cost price is required'],
      min: [0, 'Cost price cannot be negative']
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative']
    },
    reorderPoint: {
      type: Number,
      default: 10,
      min: [0, 'Reorder point cannot be negative']
    },
    reorderQuantity: {
      type: Number,
      default: 50,
      min: [1, 'Reorder quantity must be at least 1']
    },
    location: {
      aisle: String,
      rack: String,
      bin: String
    },
    lastRestockedAt: {
      type: Date
    },
    lastRestockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// CRITICAL: Compound unique index - one stock record per product+branch combination
stockSchema.index({ product: 1, branch: 1 }, { unique: true });
stockSchema.index({ branch: 1 });
stockSchema.index({ quantity: 1 });

// Virtual for available quantity
stockSchema.virtual('availableQuantity').get(function() {
  return Math.max(0, this.quantity - this.reservedQuantity);
});

// Virtual to check if stock is low
stockSchema.virtual('isLowStock').get(function() {
  return this.quantity <= this.reorderPoint;
});

// Virtual for stock status
stockSchema.virtual('stockStatus').get(function() {
  if (this.quantity === 0) return 'out-of-stock';
  if (this.quantity <= this.reorderPoint) return 'low-stock';
  return 'in-stock';
});

// Method to check if sufficient stock is available
stockSchema.methods.hasSufficientStock = function(requestedQuantity) {
  return this.availableQuantity >= requestedQuantity;
};

// Method to reserve stock (for orders)
stockSchema.methods.reserveStock = async function(quantity) {
  if (!this.hasSufficientStock(quantity)) {
    throw new Error('Insufficient stock available');
  }
  this.reservedQuantity += quantity;
  return await this.save();
};

// Method to release reserved stock (order cancelled)
stockSchema.methods.releaseReservedStock = async function(quantity) {
  this.reservedQuantity = Math.max(0, this.reservedQuantity - quantity);
  return await this.save();
};

// Method to deduct stock (order completed)
stockSchema.methods.deductStock = async function(quantity) {
  if (quantity > this.quantity) {
    throw new Error('Cannot deduct more than available quantity');
  }
  this.quantity -= quantity;
  this.reservedQuantity = Math.max(0, this.reservedQuantity - quantity);
  return await this.save();
};

const Stock = mongoose.model('Stock', stockSchema);

module.exports = Stock;
```

---

### Step 3: Create StockTransfer Model
**File**: `src/models/StockTransfer.js`

**Purpose**: Track inventory transfers between branches.

**Implementation**:
```javascript
const mongoose = require('mongoose');

const stockTransferSchema = new mongoose.Schema(
  {
    transferNumber: {
      type: String,
      unique: true,
      required: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required']
    },
    fromBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Source branch is required']
    },
    toBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Destination branch is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1']
    },
    status: {
      type: String,
      enum: ['pending', 'in-transit', 'completed', 'cancelled'],
      default: 'pending'
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    shippedAt: {
      type: Date
    },
    receivedAt: {
      type: Date
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters']
    }
  },
  {
    timestamps: true
  }
);

// Indexes
stockTransferSchema.index({ transferNumber: 1 });
stockTransferSchema.index({ fromBranch: 1, toBranch: 1 });
stockTransferSchema.index({ status: 1 });
stockTransferSchema.index({ createdAt: -1 });

// Auto-generate transfer number
stockTransferSchema.pre('save', async function(next) {
  if (this.isNew && !this.transferNumber) {
    const year = new Date().getFullYear();
    const count = await this.model('StockTransfer').countDocuments();
    this.transferNumber = `TR-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Validate that fromBranch and toBranch are different
stockTransferSchema.pre('save', function(next) {
  if (this.fromBranch.toString() === this.toBranch.toString()) {
    next(new Error('Source and destination branches must be different'));
  } else {
    next();
  }
});

const StockTransfer = mongoose.model('StockTransfer', stockTransferSchema);

module.exports = StockTransfer;
```

---

### Step 4: Create Stock Controller (MVP Core Logic)
**File**: `src/controllers/stockController.js`

**Purpose**: Handle all stock operations including branch-specific pricing.

**Implementation**:
```javascript
const Stock = require('../models/Stock');
const Product = require('../models/Product');
const Branch = require('../models/Branch');
const StockTransfer = require('../models/StockTransfer');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const CacheUtil = require('../utils/cache');
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
      .populate('product', 'sku name brand')
      .populate('branch', 'name code')
      .skip(skip)
      .limit(limitNum)
      .sort({ updatedAt: -1 }),
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
        populate: { path: 'category', select: 'name' }
      })
      .skip(skip)
      .limit(limitNum)
      .sort({ 'product.name': 1 }),
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
      id: product._id,
      sku: product.sku,
      name: product.name,
      brand: product.brand
    },
    totalQuantity: stockRecords.reduce((sum, stock) => sum + stock.quantity, 0),
    totalAvailable: stockRecords.reduce((sum, stock) => sum + stock.availableQuantity, 0),
    branchCount: stockRecords.length,
    branches: stockRecords.map(stock => ({
      branchId: stock.branch._id,
      branchName: stock.branch.name,
      branchCode: stock.branch.code,
      quantity: stock.quantity,
      availableQuantity: stock.availableQuantity,
      reservedQuantity: stock.reservedQuantity,
      costPrice: stock.costPrice,
      sellingPrice: stock.sellingPrice, // Branch-specific pricing
      isLowStock: stock.isLowStock,
      stockStatus: stock.stockStatus,
      location: stock.location
    }))
  };

  return ApiResponse.success(
    res,
    200,
    'Product stock summary retrieved successfully',
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
    .sort({ quantity: 1 });

  return ApiResponse.success(
    res,
    200,
    `Found ${lowStockItems.length} low stock item(s)`,
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

  if (stock) {
    // Update existing stock
    stock.quantity += quantity;
    if (costPrice !== undefined) stock.costPrice = costPrice;
    if (sellingPrice !== undefined) stock.sellingPrice = sellingPrice;
    if (reorderPoint !== undefined) stock.reorderPoint = reorderPoint;
    if (reorderQuantity !== undefined) stock.reorderQuantity = reorderQuantity;
    if (location) stock.location = location;
    stock.lastRestockedAt = new Date();
    stock.lastRestockedBy = req.user._id;
    
    await stock.save();
  } else {
    // Create new stock record
    stock = await Stock.create({
      product,
      branch,
      quantity,
      costPrice: costPrice || productExists.costPrice,
      sellingPrice: sellingPrice || productExists.sellingPrice,
      reorderPoint,
      reorderQuantity,
      location,
      lastRestockedAt: new Date(),
      lastRestockedBy: req.user._id
    });
  }

  const populatedStock = await Stock.findById(stock._id)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code')
    .populate('lastRestockedBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    stock.isNew ? 201 : 200,
    'Stock updated successfully',
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

  const populatedStock = await Stock.findById(stock._id)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code');

  // TODO: Log this adjustment in ActivityLog (Phase 10)

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    'Stock adjusted successfully',
    {
      ...populatedStock.toObject(),
      adjustment: {
        oldQuantity,
        newQuantity: stock.quantity,
        difference: adjustment,
        reason,
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
      `Insufficient stock. Available: ${sourceStock.availableQuantity}, Requested: ${quantity}`
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
    .populate('fromBranch', 'name code')
    .populate('toBranch', 'name code')
    .populate('initiatedBy', 'name email');

  // TODO: Send notification to destination branch manager (Phase 9)

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    201,
    'Stock transfer initiated successfully',
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
      `Cannot change status from ${transfer.status} to ${status}`
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
    
    if (sourceStock) {
      await sourceStock.deductStock(transfer.quantity);
    }

    // Add to destination branch
    let destStock = await Stock.findOne({
      product: transfer.product,
      branch: transfer.toBranch
    });

    if (destStock) {
      destStock.quantity += transfer.quantity;
      await destStock.save();
    } else {
      // Get source stock pricing as default
      destStock = await Stock.create({
        product: transfer.product,
        branch: transfer.toBranch,
        quantity: transfer.quantity,
        costPrice: sourceStock.costPrice,
        sellingPrice: sourceStock.sellingPrice,
        reorderPoint: sourceStock.reorderPoint,
        reorderQuantity: sourceStock.reorderQuantity
      });
    }
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
    `Stock transfer ${status === 'completed' ? 'completed' : 'updated'} successfully`,
    {
      ...populatedTransfer.toObject(),
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
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
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
    'Stock transfer details retrieved successfully',
    transfer
  );
});
```

---

### Step 5: Create Supplier Controller
**File**: `src/controllers/supplierController.js`

**Purpose**: Manage supplier information.

**Implementation**:
```javascript
const Supplier = require('../models/Supplier');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const CacheUtil = require('../utils/cache');
const { CACHE_TTL, PAGINATION } = require('../config/constants');

/**
 * @desc    Get all suppliers
 * @route   GET /api/suppliers
 * @access  Private (Admin, Salesperson)
 */
exports.getSuppliers = asyncHandler(async (req, res) => {
  const { active, search, page = 1, limit = PAGINATION.DEFAULT_LIMIT } = req.query;

  const query = {};
  
  if (active !== undefined) {
    query.isActive = active === 'true';
  }
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } }
    ];
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [suppliers, total] = await Promise.all([
    Supplier.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ name: 1 }),
    Supplier.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    suppliers,
    pageNum,
    limitNum,
    total,
    'Suppliers retrieved successfully'
  );
});

/**
 * @desc    Get single supplier
 * @route   GET /api/suppliers/:id
 * @access  Private (Admin, Salesperson)
 */
exports.getSupplier = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const supplier = await Supplier.findById(id);

  if (!supplier) {
    return ApiResponse.error(res, 404, 'Supplier not found');
  }

  return ApiResponse.success(res, 200, 'Supplier retrieved successfully', supplier);
});

/**
 * @desc    Create new supplier
 * @route   POST /api/suppliers
 * @access  Private (Admin only)
 */
exports.createSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.create(req.body);

  return ApiResponse.success(res, 201, 'Supplier created successfully', supplier);
});

/**
 * @desc    Update supplier
 * @route   PUT /api/suppliers/:id
 * @access  Private (Admin only)
 */
exports.updateSupplier = asyncHandler(async (req, res) => {
  let supplier = await Supplier.findById(req.params.id);

  if (!supplier) {
    return ApiResponse.error(res, 404, 'Supplier not found');
  }

  supplier = await Supplier.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  return ApiResponse.success(res, 200, 'Supplier updated successfully', supplier);
});

/**
 * @desc    Delete supplier
 * @route   DELETE /api/suppliers/:id
 * @access  Private (Admin only)
 */
exports.deleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);

  if (!supplier) {
    return ApiResponse.error(res, 404, 'Supplier not found');
  }

  supplier.isActive = false;
  await supplier.save();

  return ApiResponse.success(
    res,
    200,
    'Supplier deactivated successfully',
    { id: supplier._id, name: supplier.name, isActive: false }
  );
});
```

---

### Step 6: Create Stock Routes
**File**: `src/routes/stockRoutes.js`

**Implementation**:
```javascript
const express = require('express');
const { body, param } = require('express-validator');
const {
  getAllStock,
  getBranchStock,
  getProductStock,
  getLowStock,
  restockProduct,
  adjustStock,
  createStockTransfer,
  updateStockTransferStatus,
  getStockTransfers,
  getStockTransfer
} = require('../controllers/stockController');
const { protect, authorize } = require('../middleware/auth');
const { checkBranchAccess } = require('../middleware/branchAccess');
const validate = require('../middleware/validate');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

// Stock operations
router.get('/', protect, authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON), getAllStock);
router.get('/low-stock', protect, authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON), getLowStock);
router.get('/branch/:branchId', protect, checkBranchAccess, getBranchStock);
router.get('/product/:productId', protect, getProductStock);

router.post(
  '/restock',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  [
    body('product').isMongoId().withMessage('Invalid product ID'),
    body('branch').isMongoId().withMessage('Invalid branch ID'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('costPrice').optional().isFloat({ min: 0 }).withMessage('Cost price must be positive'),
    body('sellingPrice').optional().isFloat({ min: 0 }).withMessage('Selling price must be positive'),
    validate
  ],
  restockProduct
);

router.post(
  '/adjust',
  protect,
  authorize(USER_ROLES.ADMIN),
  [
    body('product').isMongoId().withMessage('Invalid product ID'),
    body('branch').isMongoId().withMessage('Invalid branch ID'),
    body('adjustment').isInt().withMessage('Adjustment must be an integer'),
    body('reason').notEmpty().withMessage('Reason is required'),
    validate
  ],
  adjustStock
);

// Stock transfers
router.get('/transfers', protect, getStockTransfers);
router.get('/transfers/:id', protect, [param('id').isMongoId(), validate], getStockTransfer);

router.post(
  '/transfers',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  [
    body('product').isMongoId().withMessage('Invalid product ID'),
    body('fromBranch').isMongoId().withMessage('Invalid source branch ID'),
    body('toBranch').isMongoId().withMessage('Invalid destination branch ID'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    validate
  ],
  createStockTransfer
);

router.put(
  '/transfers/:id',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  [
    param('id').isMongoId().withMessage('Invalid transfer ID'),
    body('status')
      .isIn(['in-transit', 'completed', 'cancelled'])
      .withMessage('Invalid status'),
    validate
  ],
  updateStockTransferStatus
);

module.exports = router;
```

---

### Step 7: Create Supplier Routes
**File**: `src/routes/supplierRoutes.js`

**Implementation**:
```javascript
const express = require('express');
const { body, param } = require('express-validator');
const {
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier
} = require('../controllers/supplierController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

const supplierValidation = [
  body('name').trim().notEmpty().withMessage('Supplier name is required'),
  body('contact.phone').trim().notEmpty().withMessage('Phone number is required'),
  body('contact.email').optional().isEmail().withMessage('Invalid email format').normalizeEmail(),
  validate
];

router.get('/', protect, authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON), getSuppliers);
router.get('/:id', protect, authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON), getSupplier);

router.post(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN),
  supplierValidation,
  createSupplier
);

router.put(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  [param('id').isMongoId(), validate],
  updateSupplier
);

router.delete(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  [param('id').isMongoId(), validate],
  deleteSupplier
);

module.exports = router;
```

---

### Step 8: Mount Routes in Server
**File**: `src/server.js` (MODIFY EXISTING)

**Add these imports and mounts**:
```javascript
// Import routes
const stockRoutes = require('./routes/stockRoutes');
const supplierRoutes = require('./routes/supplierRoutes');

// Mount routes
app.use('/api/stock', stockRoutes);
app.use('/api/suppliers', supplierRoutes);
```

---

## ✅ Phase 4 Completion Checklist

### Files Created
- [ ] `src/models/Supplier.js` - Supplier model
- [ ] `src/models/Stock.js` - Stock model with branch-specific pricing ⚠️ CRITICAL
- [ ] `src/models/StockTransfer.js` - Stock transfer model
- [ ] `src/controllers/stockController.js` - All 10 stock operations
- [ ] `src/controllers/supplierController.js` - All 5 supplier operations
- [ ] `src/routes/stockRoutes.js` - Stock routes
- [ ] `src/routes/supplierRoutes.js` - Supplier routes

### Files Modified
- [ ] `src/server.js` - Stock and supplier routes mounted

### Critical MVP Features Testing ⚠️
- [ ] **Branch-specific pricing works** - Same product has different prices per branch
- [ ] Stock record is unique per product+branch combination
- [ ] Get product stock shows all branches with different prices
- [ ] Restock creates/updates stock with branch-specific price
- [ ] Low stock alerts work correctly
- [ ] Stock transfer reserves stock at source
- [ ] Stock transfer deducts from source when completed
- [ ] Stock transfer adds to destination when completed
- [ ] Stock transfer can be cancelled
- [ ] Reserved stock is released on cancellation
- [ ] Available quantity calculation works (quantity - reserved)
- [ ] Cannot transfer more than available stock

### Manual Testing Endpoints

```bash
# CRITICAL TEST: Branch-specific pricing
# 1. Create stock at Branch A with price 250
POST http://localhost:5000/api/stock/restock
Headers: { "Authorization": "Bearer <token>" }
Body: {
  "product": "<product_id>",
  "branch": "<branch_a_id>",
  "quantity": 100,
  "costPrice": 150,
  "sellingPrice": 250
}

# 2. Create stock at Branch B with DIFFERENT price 300
POST http://localhost:5000/api/stock/restock
Body: {
  "product": "<product_id>",
  "branch": "<branch_b_id>",
  "quantity": 50,
  "costPrice": 150,
  "sellingPrice": 300  // Different price!
}

# 3. Verify different pricing
GET http://localhost:5000/api/stock/product/<product_id>
Expected: Shows both branches with different sellingPrice values

# Stock transfer test
# 4. Create transfer
POST http://localhost:5000/api/stock/transfers
Body: {
  "product": "<product_id>",
  "fromBranch": "<branch_a_id>",
  "toBranch": "<branch_b_id>",
  "quantity": 10
}
Expected: 201 with status 'pending', source stock reserved

# 5. Update to in-transit
PUT http://localhost:5000/api/stock/transfers/<transfer_id>
Body: { "status": "in-transit" }

# 6. Complete transfer
PUT http://localhost:5000/api/stock/transfers/<transfer_id>
Body: { "status": "completed" }
Expected: Source deducted, destination increased

# Low stock test
# 7. Get low stock items
GET http://localhost:5000/api/stock/low-stock?branch=<branch_id>
Expected: 200 with items where quantity <= reorderPoint
```

---

## 📊 Expected Outcomes

**MVP CRITICAL FEATURES COMPLETED:**

1. ✅ **Branch-Specific Pricing** - Different prices per branch for same product
2. ✅ **Stock Tracking Per Branch** - Independent inventory levels
3. ✅ **Stock Transfers** - Move inventory between branches
4. ✅ **Low Stock Alerts** - Identify items needing reorder
5. ✅ **Reserved Stock** - Prevent overselling during transfers/orders
6. ✅ **Stock Adjustments** - Manual corrections with reason tracking
7. ✅ **Supplier Management** - Track product sources

---

## 🚀 Next Steps

1. **Create Phase 4 Completion Document**: `backend/Phase-4-done.md`
   - **CRITICAL**: Document branch-specific pricing test results
   - Include sample stock records showing different prices per branch
   
2. **Proceed to Phase 5**: Sales Order Management (Cash Flow Tracking - MVP CRITICAL)

---

## 📝 Notes

- **CRITICAL**: Stock model has compound unique index on (product + branch) - one record per combination
- **CRITICAL**: Each branch can set its own costPrice and sellingPrice
- **Reserved Quantity**: Used during transfers and orders to prevent overselling
- **Available Quantity**: quantity - reservedQuantity
- **Stock Status**: out-of-stock (0), low-stock (≤ reorderPoint), in-stock (> reorderPoint)
- **Transfer Status Flow**: pending → in-transit → completed (or cancelled anytime)

---

## ⚠️ Common Issues & Solutions

### Issue 1: Duplicate Stock Record Error
**Problem**: Error when creating stock with same product+branch
**Solution**: Stock is unique per product+branch. Use restock endpoint to update existing stock

### Issue 2: Negative Stock After Transfer
**Problem**: Stock goes negative after transfer
**Solution**: Transfer validation checks availableQuantity before reserving

### Issue 3: Different Pricing Not Working
**Problem**: All branches show same price
**Solution**: Ensure you're setting costPrice and sellingPrice in the Stock model, not Product model

---

## 📚 References

- [Planning.md](./Planning.md) - Phase 4 details (lines 830-1004)
- [README.md](../README.md) - Multi-branch inventory features

---

> **COMPLETION NOTE**: After testing, create `Phase-4-done.md`. **CRITICAL**: Include proof that branch-specific pricing works (screenshots or API response showing same product with different prices in different branches). This is a core MVP requirement. Then proceed to `Phase-5.md` for Sales Order Management (cash flow tracking).
