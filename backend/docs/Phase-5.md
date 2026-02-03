# Phase 5: Sales Order Management (MVP CRITICAL - CASH FLOW)

> **IMPORTANT**: Before implementing any feature in this phase, always refer back to [Planning.md](./Planning.md) and [README.md](../README.md) to ensure alignment with system requirements and scope. This phase is **CRITICAL for MVP** as it implements cash flow tracking and sales processing - core requirements for business operations.

---

## 🎯 Phase Objectives

Build the sales order management system that tracks cash flow and revenue per branch. This is **essential for MVP** as it enables:
- **Sales order processing** - Complete customer purchase workflow
- **Cash flow tracking** - Monitor incoming revenue per branch
- **Automatic stock deduction** - Update inventory when orders complete
- **Payment tracking** - Support multiple payment methods
- **Order history** - Complete audit trail of all sales
- **Invoice generation** - Professional order receipts

**Expected Outcome**: A fully functional sales system where each branch can process orders, track payments, and monitor cash flow in real-time.

---

## 📋 Pre-requisites

### Must Be Completed First ✅
- [x] **Phase 1: Core Infrastructure**
- [x] **Phase 2: Branch Management**
- [x] **Phase 3: Product & Category Management**
- [x] **Phase 4: Inventory & Stock Management** ⚠️ CRITICAL - Stock must be available

### Required Data ✅
- At least one active branch
- At least one product with stock
- At least one user with salesperson role

---

## 🛠️ Implementation Steps

### Step 1: Create Transaction Model (Auto-created from Sales)
**File**: `src/models/Transaction.js`

**Purpose**: Track all financial transactions (sales, payments, refunds).

**Implementation**:
```javascript
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      unique: true,
      required: true
    },
    type: {
      type: String,
      enum: ['sale', 'refund', 'expense', 'transfer'],
      required: true
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required']
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required']
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'gcash', 'paymaya', 'bank-transfer'],
      required: true
    },
    reference: {
      model: {
        type: String,
        enum: ['SalesOrder', 'ServiceOrder', 'Expense']
      },
      id: {
        type: mongoose.Schema.Types.ObjectId
      }
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
transactionSchema.index({ transactionNumber: 1 });
transactionSchema.index({ branch: 1, createdAt: -1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ paymentMethod: 1 });

// Auto-generate transaction number
transactionSchema.pre('save', async function(next) {
  if (this.isNew && !this.transactionNumber) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const count = await this.model('Transaction').countDocuments();
    this.transactionNumber = `TXN-${year}${month}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
```

---

### Step 2: Create SalesOrder Model
**File**: `src/models/SalesOrder.js`

**Purpose**: Track customer purchases and manage order lifecycle.

**Implementation**:
```javascript
const mongoose = require('mongoose');

const salesOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: true
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required']
    },
    customer: {
      name: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true
      },
      phone: {
        type: String,
        trim: true
      },
      email: {
        type: String,
        lowercase: true
      },
      address: String
    },
    items: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      sku: {
        type: String,
        required: true
      },
      name: {
        type: String,
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity must be at least 1']
      },
      unitPrice: {
        type: Number,
        required: true,
        min: [0, 'Unit price cannot be negative']
      },
      discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative']
      },
      total: {
        type: Number,
        required: true
      }
    }],
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal cannot be negative']
    },
    tax: {
      rate: {
        type: Number,
        default: 0,
        min: [0, 'Tax rate cannot be negative']
      },
      amount: {
        type: Number,
        default: 0,
        min: [0, 'Tax amount cannot be negative']
      }
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative']
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'Total cannot be negative']
    },
    payment: {
      method: {
        type: String,
        enum: ['cash', 'card', 'gcash', 'paymaya', 'bank-transfer'],
        required: true
      },
      amountPaid: {
        type: Number,
        required: true,
        min: [0, 'Amount paid cannot be negative']
      },
      change: {
        type: Number,
        default: 0,
        min: [0, 'Change cannot be negative']
      },
      status: {
        type: String,
        enum: ['pending', 'partial', 'paid', 'refunded'],
        default: 'pending'
      },
      paidAt: Date
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'cancelled'],
      default: 'pending'
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    completedAt: Date,
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    }
  },
  {
    timestamps: true
  }
);

// Indexes
salesOrderSchema.index({ orderNumber: 1 });
salesOrderSchema.index({ branch: 1, createdAt: -1 });
salesOrderSchema.index({ status: 1 });
salesOrderSchema.index({ 'payment.status': 1 });
salesOrderSchema.index({ processedBy: 1 });

// Auto-generate order number
salesOrderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    const year = new Date().getFullYear();
    const count = await this.model('SalesOrder').countDocuments();
    this.orderNumber = `SO-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Calculate totals before saving
salesOrderSchema.pre('save', function(next) {
  // Calculate item totals
  this.items.forEach(item => {
    item.total = (item.quantity * item.unitPrice) - item.discount;
  });
  
  // Calculate subtotal
  this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
  
  // Calculate tax
  this.tax.amount = this.subtotal * (this.tax.rate / 100);
  
  // Calculate final total
  this.total = this.subtotal + this.tax.amount - this.discount;
  
  // Calculate change
  if (this.payment.amountPaid > this.total) {
    this.payment.change = this.payment.amountPaid - this.total;
  }
  
  // Update payment status
  if (this.payment.amountPaid === 0) {
    this.payment.status = 'pending';
  } else if (this.payment.amountPaid < this.total) {
    this.payment.status = 'partial';
  } else if (this.payment.amountPaid >= this.total) {
    this.payment.status = 'paid';
    if (!this.payment.paidAt) {
      this.payment.paidAt = new Date();
    }
  }
  
  next();
});

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);

module.exports = SalesOrder;
```

---

### Step 3: Create Sales Controller (MVP Core Logic)
**File**: `src/controllers/salesController.js`

**Purpose**: Handle sales order processing, stock deduction, and transaction creation.

**Implementation**:
```javascript
const SalesOrder = require('../models/SalesOrder');
const Stock = require('../models/Stock');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const CacheUtil = require('../utils/cache');
const { PAGINATION } = require('../config/constants');

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
    amountPaid,
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

    // Check stock availability
    const stock = await Stock.findOne({ product: item.product, branch });
    if (!stock) {
      return ApiResponse.error(
        res,
        400,
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

    // Use branch-specific pricing
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

  // Create sales order
  const order = await SalesOrder.create({
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
      amountPaid: amountPaid || 0,
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
        await stock.deductStock(item.quantity);
      }
    }

    // Create transaction record (MVP CRITICAL - CASH FLOW)
    if (order.payment.status === 'paid') {
      await Transaction.create({
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
        await stock.releaseReservedStock(item.quantity);
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
      ...populatedOrder.toObject(),
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
```

---

### Step 4: Create Sales Routes
**File**: `src/routes/salesRoutes.js`

**Implementation**:
```javascript
const express = require('express');
const { body, param } = require('express-validator');
const {
  getSalesOrders,
  getSalesOrder,
  getSalesOrdersByBranch,
  createSalesOrder,
  updateSalesOrderStatus,
  updateSalesOrderPayment,
  deleteSalesOrder,
  getSalesOrderInvoice
} = require('../controllers/salesController');
const { protect, authorize } = require('../middleware/auth');
const { checkBranchAccess } = require('../middleware/branchAccess');
const validate = require('../middleware/validate');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

// Validation
const createOrderValidation = [
  body('branch').isMongoId().withMessage('Invalid branch ID'),
  body('customer.name').trim().notEmpty().withMessage('Customer name is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Invalid product ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('paymentMethod')
    .isIn(['cash', 'card', 'gcash', 'paymaya', 'bank-transfer'])
    .withMessage('Invalid payment method'),
  validate
];

// Routes
router.get(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  getSalesOrders
);

router.get(
  '/branch/:branchId',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  checkBranchAccess,
  getSalesOrdersByBranch
);

router.get(
  '/:id',
  protect,
  [param('id').isMongoId(), validate],
  getSalesOrder
);

router.get(
  '/:id/invoice',
  protect,
  [param('id').isMongoId(), validate],
  getSalesOrderInvoice
);

router.post(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  createOrderValidation,
  createSalesOrder
);

router.put(
  '/:id/status',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  [
    param('id').isMongoId(),
    body('status').isIn(['processing', 'completed', 'cancelled']),
    validate
  ],
  updateSalesOrderStatus
);

router.put(
  '/:id/payment',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  [
    param('id').isMongoId(),
    body('amountPaid').optional().isFloat({ min: 0 }),
    body('paymentMethod').optional().isIn(['cash', 'card', 'gcash', 'paymaya', 'bank-transfer']),
    validate
  ],
  updateSalesOrderPayment
);

router.delete(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  [param('id').isMongoId(), validate],
  deleteSalesOrder
);

module.exports = router;
```

---

### Step 5: Mount Routes in Server
**File**: `src/server.js` (MODIFY EXISTING)

**Add**:
```javascript
// Import routes
const salesRoutes = require('./routes/salesRoutes');

// Mount routes
app.use('/api/sales', salesRoutes);
```

---

### Step 6: Update Constants (if needed)
**File**: `src/config/constants.js` (VERIFY EXISTS)

Ensure these constants exist:
```javascript
PAYMENT_METHODS: {
  CASH: 'cash',
  CARD: 'card',
  GCASH: 'gcash',
  PAYMAYA: 'paymaya',
  BANK_TRANSFER: 'bank-transfer'
},

ORDER_STATUS: {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
},

PAYMENT_STATUS: {
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  REFUNDED: 'refunded'
}
```

---

## ✅ Phase 5 Completion Checklist

### Files Created
- [ ] `src/models/Transaction.js` - Transaction model for cash flow
- [ ] `src/models/SalesOrder.js` - Sales order model
- [ ] `src/controllers/salesController.js` - All 9 sales operations
- [ ] `src/routes/salesRoutes.js` - Sales routes with validation

### Files Modified
- [ ] `src/server.js` - Sales routes mounted
- [ ] `src/config/constants.js` - Payment/order constants verified

### Critical MVP Features Testing ⚠️
- [ ] **Create sales order** - Order created with items
- [ ] **Stock reservation** - Stock reserved on order creation
- [ ] **Branch-specific pricing used** - Order items use branch stock prices
- [ ] **Auto-calculate totals** - Subtotal, tax, total, change calculated
- [ ] **Payment status auto-update** - Changes based on amountPaid vs total
- [ ] **Complete order** - Stock deducted, transaction created
- [ ] **Transaction record created** - Cash flow tracked (MVP CRITICAL)
- [ ] **Cancel order** - Reserved stock released
- [ ] **Payment update** - Can update payment before completion
- [ ] **Invoice generation** - Invoice data retrieved

### Manual Testing Endpoints

```bash
# CRITICAL TEST: Complete sales flow with cash flow tracking

# 1. Create sales order
POST http://localhost:5000/api/sales
Headers: { "Authorization": "Bearer <salesperson_token>" }
Body: {
  "branch": "<branch_id>",
  "customer": {
    "name": "Juan Dela Cruz",
    "phone": "+63 912 345 6789",
    "email": "juan@example.com"
  },
  "items": [
    {
      "product": "<product_id>",
      "quantity": 2
    }
  ],
  "taxRate": 12,
  "discount": 0,
  "paymentMethod": "cash",
  "amountPaid": 1000
}
Expected: 201 with order, stock reserved, totals calculated

# 2. Verify stock was reserved
GET http://localhost:5000/api/stock/product/<product_id>
Expected: reservedQuantity increased by 2

# 3. Complete the order (CRITICAL - triggers stock deduction and transaction)
PUT http://localhost:5000/api/sales/<order_id>/status
Body: { "status": "completed" }
Expected: 200, stock deducted, transaction created

# 4. Verify stock was deducted
GET http://localhost:5000/api/stock/product/<product_id>
Expected: quantity decreased by 2, reservedQuantity back to 0

# 5. Verify transaction was created (CASH FLOW TRACKING)
GET http://localhost:5000/api/finance/transactions
Expected: New transaction with type 'sale', amount = order.total

# 6. Get invoice
GET http://localhost:5000/api/sales/<order_id>/invoice
Expected: 200 with formatted invoice data

# 7. Test cancellation
POST http://localhost:5000/api/sales
# (create another order)
DELETE http://localhost:5000/api/sales/<new_order_id>
Expected: Order cancelled, reserved stock released
```

---

## 📊 Expected Outcomes

**MVP CRITICAL FEATURES COMPLETED:**

1. ✅ **Sales Order Processing** - Complete purchase workflow
2. ✅ **Cash Flow Tracking** - Transaction records created automatically
3. ✅ **Branch-Specific Pricing** - Orders use correct branch prices
4. ✅ **Stock Management Integration** - Auto reserve/deduct/release stock
5. ✅ **Payment Tracking** - Multiple payment methods supported
6. ✅ **Order History** - Complete audit trail per branch
7. ✅ **Invoice Generation** - Professional invoice data
8. ✅ **Change Calculation** - Automatic change computation

---

## 🚀 Next Steps

1. **Create Phase 5 Completion Document**: `backend/Phase-5-done.md`
   - **CRITICAL**: Document cash flow tracking test results
   - Show transaction created when order completed
   - Include order-to-transaction linkage proof

2. **Proceed to Phase 6**: Service Order Management (Secondary MVP feature)

---

## 📝 Notes

- **Order Number Format**: SO-YYYY-XXXXXX (e.g., SO-2026-000001)
- **Transaction Number Format**: TXN-YYYYMM-XXXXXX (e.g., TXN-202601-000001)
- **Status Flow**: pending → processing → completed (or cancelled anytime)
- **Payment Status**: Auto-calculated based on amountPaid vs total
- **Stock Reservation**: Happens on order creation, released on cancel
- **Stock Deduction**: Only happens when order is completed
- **Transaction Creation**: Only when order completed AND payment.status === 'paid'
- **Branch-Specific Pricing**: Item unitPrice comes from Stock model, not Product model

---

## ⚠️ Common Issues & Solutions

### Issue 1: Insufficient Stock Error
**Problem**: Cannot create order due to insufficient stock
**Solution**: Verify stock exists at branch and quantity > requested amount

### Issue 2: Transaction Not Created
**Problem**: Order completed but no transaction record
**Solution**: Ensure payment.status is 'paid' before completing order

### Issue 3: Wrong Price in Order
**Problem**: Order uses product price instead of branch price
**Solution**: Ensure using stock.sellingPrice, not product.sellingPrice

### Issue 4: Stock Not Released on Cancel
**Problem**: Reserved stock remains after cancellation
**Solution**: Verify cancel endpoint calls releaseReservedStock()

---

## 📚 References

- [Planning.md](./Planning.md) - Phase 5 details (lines 1005-1296)
- [README.md](../README.md) - Cash flow management features
- [Phase-4.md](./Phase-4.md) - Stock management (prerequisite)

---

> **COMPLETION NOTE**: After testing, create `Phase-5-done.md`. **CRITICAL**: Include proof that transactions are created when orders complete (screenshot or API response showing Transaction record linked to SalesOrder). This demonstrates cash flow tracking is working. Then proceed to `Phase-6.md` for Service Order Management.
