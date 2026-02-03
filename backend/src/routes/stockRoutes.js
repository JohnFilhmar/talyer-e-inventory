const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const stockController = require('../controllers/stockController');
const { protect, authorize } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');
const { checkBranchAccess } = require('../middleware/branchAccess');
const handleValidationErrors = require('../middleware/validationHandler');

// Validation rules
const restockValidation = [
  body('product').notEmpty().isMongoId().withMessage('Valid product ID is required'),
  body('branch').notEmpty().isMongoId().withMessage('Valid branch ID is required'),
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('costPrice').notEmpty().isFloat({ min: 0 }).withMessage('Cost price must be a positive number'),
  body('sellingPrice').notEmpty().isFloat({ min: 0 }).withMessage('Selling price must be a positive number'),
  body('reorderPoint').optional().isInt({ min: 0 }).withMessage('Reorder point must be a non-negative integer'),
  body('reorderQuantity').optional().isInt({ min: 0 }).withMessage('Reorder quantity must be a non-negative integer'),
  body('supplier').optional().isMongoId().withMessage('Valid supplier ID required if provided'),
  body('location').optional().isString().isLength({ max: 100 }).withMessage('Location cannot exceed 100 characters')
];

const adjustStockValidation = [
  body('product').notEmpty().isMongoId().withMessage('Valid product ID is required'),
  body('branch').notEmpty().isMongoId().withMessage('Valid branch ID is required'),
  body('adjustment').notEmpty().isInt().withMessage('Adjustment must be an integer'),
  body('reason').notEmpty().isString().isLength({ min: 5, max: 500 })
    .withMessage('Reason is required and must be between 5-500 characters')
];

const createTransferValidation = [
  body('product').notEmpty().isMongoId().withMessage('Valid product ID is required'),
  body('fromBranch').notEmpty().isMongoId().withMessage('Valid source branch ID is required'),
  body('toBranch').notEmpty().isMongoId().withMessage('Valid destination branch ID is required'),
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

const updateTransferStatusValidation = [
  param('id').isMongoId().withMessage('Valid transfer ID is required'),
  body('status').notEmpty().isIn(['pending', 'in-transit', 'completed', 'cancelled'])
    .withMessage('Status must be one of: pending, in-transit, completed, cancelled')
];

const mongoIdValidation = [
  param('id').isMongoId().withMessage('Valid ID is required')
];

const branchIdValidation = [
  param('branchId').isMongoId().withMessage('Valid branch ID is required')
];

const productIdValidation = [
  param('productId').isMongoId().withMessage('Valid product ID is required')
];

// Validation for restocking by stock ID (simpler - just add quantity)
const restockByIdValidation = [
  param('id').isMongoId().withMessage('Valid stock ID is required'),
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('supplierId').optional().isMongoId().withMessage('Valid supplier ID required if provided'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

// Validation for adjusting stock by ID
const adjustByIdValidation = [
  param('id').isMongoId().withMessage('Valid stock ID is required'),
  body('quantity').notEmpty().isInt().withMessage('Adjustment quantity is required'),
  body('reason').notEmpty().isString().isLength({ min: 5, max: 500 })
    .withMessage('Reason is required and must be between 5-500 characters'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

// Validation for stock ID param
const stockIdValidation = [
  param('stockId').isMongoId().withMessage('Valid stock ID is required')
];

// Routes

// GET /api/stock - Get all stock with filters
router.get(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  stockController.getAllStock
);

// GET /api/stock/low-stock - Get low stock items
router.get(
  '/low-stock',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  stockController.getLowStock
);

// ============ Stock Movement Routes ============

// GET /api/stock/movements - Get all movements with filters (Admin only)
router.get(
  '/movements',
  protect,
  authorize(USER_ROLES.ADMIN),
  stockController.getMovements
);

// GET /api/stock/movements/stock/:stockId - Get movements for specific stock
router.get(
  '/movements/stock/:stockId',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  stockIdValidation,
  handleValidationErrors,
  stockController.getMovementsByStock
);

// GET /api/stock/movements/product/:productId - Get movements for specific product
router.get(
  '/movements/product/:productId',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  productIdValidation,
  handleValidationErrors,
  stockController.getMovementsByProduct
);

// GET /api/stock/movements/branch/:branchId - Get movements for specific branch
router.get(
  '/movements/branch/:branchId',
  protect,
  checkBranchAccess,
  branchIdValidation,
  handleValidationErrors,
  stockController.getMovementsByBranch
);

// GET /api/stock/transfers - Get stock transfer history
router.get(
  '/transfers',
  protect,
  stockController.getStockTransfers
);

// GET /api/stock/transfers/:id - Get single transfer
router.get(
  '/transfers/:id',
  protect,
  mongoIdValidation,
  handleValidationErrors,
  stockController.getStockTransfer
);

// POST /api/stock/transfers - Create stock transfer
router.post(
  '/transfers',
  protect,
  authorize(USER_ROLES.ADMIN),
  createTransferValidation,
  handleValidationErrors,
  stockController.createStockTransfer
);

// PUT /api/stock/transfers/:id - Update transfer status
router.put(
  '/transfers/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  updateTransferStatusValidation,
  handleValidationErrors,
  stockController.updateStockTransferStatus
);

// GET /api/stock/branch/:branchId - Get stock for specific branch
router.get(
  '/branch/:branchId',
  protect,
  checkBranchAccess,
  branchIdValidation,
  handleValidationErrors,
  stockController.getBranchStock
);

// GET /api/stock/product/:productId - Get stock for specific product
router.get(
  '/product/:productId',
  protect,
  productIdValidation,
  handleValidationErrors,
  stockController.getProductStock
);

// POST /api/stock/restock - Add or update stock (create new stock record)
router.post(
  '/restock',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  restockValidation,
  handleValidationErrors,
  stockController.restockProduct
);

// PUT /api/stock/:id/restock - Add quantity to existing stock (no price change)
router.put(
  '/:id/restock',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  restockByIdValidation,
  handleValidationErrors,
  stockController.restockById
);

// POST /api/stock/adjust - Manual stock adjustment (by product+branch)
router.post(
  '/adjust',
  protect,
  authorize(USER_ROLES.ADMIN),
  adjustStockValidation,
  handleValidationErrors,
  stockController.adjustStock
);

// PUT /api/stock/:id/adjust - Manual stock adjustment by ID
router.put(
  '/:id/adjust',
  protect,
  authorize(USER_ROLES.ADMIN),
  adjustByIdValidation,
  handleValidationErrors,
  stockController.adjustById
);

module.exports = router;
