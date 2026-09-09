import express from 'express';
const router = express.Router();
import { body, param, query } from 'express-validator';
import * as stockController from '../controllers/stockController.js';
import { protect, authorize } from '../middleware/auth.js';
import { USER_ROLES, STOCK_TRANSFER_STATUS } from '../config/constants.js';
import { checkBranchAccess } from '../middleware/branchAccess.js';
import handleValidationErrors from '../middleware/validationHandler.js';
import { MOVEMENT_TYPES } from '../utils/stockMovement.js';
import {
  idRule,
  enumRule,
  boolRule,
  textRule,
  paginationRules,
  dateRangeRules,
} from '../utils/queryRules.js';

// Validation rules
const restockValidation = [
  body('product').notEmpty().isMongoId().withMessage('Valid product ID is required'),
  body('branch').notEmpty().isMongoId().withMessage('Valid branch ID is required'),
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be at least 1').toInt(),
  // Optional: a branch stocking a product for the first time inherits the
  // catalog price from the Product, which is the reference (supplier/market)
  // price. Sending a price here overrides it for this branch only.
  body('costPrice').optional().isFloat({ min: 0 }).withMessage('Cost price must be a positive number').toFloat(),
  body('sellingPrice').optional().isFloat({ min: 0 }).withMessage('Selling price must be a positive number').toFloat(),
  body('reorderPoint').optional().isInt({ min: 0 }).withMessage('Reorder point must be a non-negative integer').toInt(),
  body('reorderQuantity').optional().isInt({ min: 0 }).withMessage('Reorder quantity must be a non-negative integer').toInt(),
  body('supplier').optional().isMongoId().withMessage('Valid supplier ID required if provided'),
  body('location').optional().isString().isLength({ max: 100 }).withMessage('Location cannot exceed 100 characters')
];

const adjustStockValidation = [
  body('product').notEmpty().isMongoId().withMessage('Valid product ID is required'),
  body('branch').notEmpty().isMongoId().withMessage('Valid branch ID is required'),
  body('adjustment').notEmpty().isInt().withMessage('Adjustment must be an integer').toInt(),
  // min 3, not 5: 'lost' is four characters and is a value the UI itself
  // offers, so a min of 5 made writing off lost stock impossible. The enum
  // values are persisted in the StockMovement ledger and must not be renamed
  // to suit a validator.
  body('reason').notEmpty().isString().isLength({ min: 3, max: 500 })
    .withMessage('Reason is required and must be between 3-500 characters')
];

const createTransferValidation = [
  body('product').notEmpty().isMongoId().withMessage('Valid product ID is required'),
  body('fromBranch').notEmpty().isMongoId().withMessage('Valid source branch ID is required'),
  body('toBranch').notEmpty().isMongoId().withMessage('Valid destination branch ID is required'),
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be at least 1').toInt(),
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
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be at least 1').toInt(),
  body('supplierId').optional().isMongoId().withMessage('Valid supplier ID required if provided'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

// Validation for adjusting stock by ID
const adjustByIdValidation = [
  param('id').isMongoId().withMessage('Valid stock ID is required'),
  body('quantity').notEmpty().isInt().withMessage('Adjustment quantity is required').toInt(),
  // Same floor as adjustStockValidation above; the two routes must agree.
  body('reason').notEmpty().isString().isLength({ min: 3, max: 500 })
    .withMessage('Reason is required and must be between 3-500 characters'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

// Validation for stock ID param
const stockIdValidation = [
  param('stockId').isMongoId().withMessage('Valid stock ID is required')
];

// Query validation for the read routes (GAP-015d). These had no chain at all,
// so their filter values reached Mongo unconstrained.
const listStockValidation = [
  idRule('branch'),
  idRule('product'),
  // Reaches an escaped $regex over product name, SKU, barcode, brand and
  // productModel. textRule trims, caps the length and rejects a repeated
  // parameter, which Express would otherwise hand over as an array.
  textRule('search'),
  boolRule('lowStock'),
  boolRule('outOfStock'),
  ...paginationRules()
];

const lowStockValidation = [idRule('branch'), ...paginationRules()];

const listMovementsValidation = [
  enumRule('type', Object.values(MOVEMENT_TYPES)),
  idRule('branch'),
  idRule('product'),
  ...dateRangeRules(),
  ...paginationRules()
];

const movementsByStockValidation = [...paginationRules()];

const movementsByProductValidation = [idRule('branch'), ...paginationRules()];

const movementsByBranchValidation = [
  enumRule('type', Object.values(MOVEMENT_TYPES)),
  ...dateRangeRules(),
  ...paginationRules()
];

const listTransfersValidation = [
  idRule('branch'),
  enumRule('status', Object.values(STOCK_TRANSFER_STATUS)),
  ...paginationRules()
];

const branchStockValidation = [
  idRule('category'),
  textRule('search'),
  boolRule('lowStock'),
  ...paginationRules()
];

// Routes

// GET /api/stock - Get all stock with filters
router.get(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  listStockValidation,
  handleValidationErrors,
  stockController.getAllStock
);

// GET /api/stock/low-stock - Get low stock items
router.get(
  '/low-stock',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  lowStockValidation,
  handleValidationErrors,
  stockController.getLowStock
);

// ============ Stock Movement Routes ============

// GET /api/stock/movements - Get all movements with filters (Admin only)
router.get(
  '/movements',
  protect,
  authorize(USER_ROLES.ADMIN),
  listMovementsValidation,
  handleValidationErrors,
  stockController.getMovements
);

// GET /api/stock/movements/stock/:stockId - Get movements for specific stock
router.get(
  '/movements/stock/:stockId',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  stockIdValidation,
  movementsByStockValidation,
  handleValidationErrors,
  stockController.getMovementsByStock
);

// GET /api/stock/movements/product/:productId - Get movements for specific product
router.get(
  '/movements/product/:productId',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  productIdValidation,
  movementsByProductValidation,
  handleValidationErrors,
  stockController.getMovementsByProduct
);

// GET /api/stock/movements/branch/:branchId - Get movements for specific branch
router.get(
  '/movements/branch/:branchId',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  checkBranchAccess,
  branchIdValidation,
  movementsByBranchValidation,
  handleValidationErrors,
  stockController.getMovementsByBranch
);

// GET /api/stock/transfers - Get stock transfer history
router.get(
  '/transfers',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  listTransfersValidation,
  handleValidationErrors,
  stockController.getStockTransfers
);

// GET /api/stock/transfers/:id - Get single transfer
router.get(
  '/transfers/:id',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
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
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  checkBranchAccess,
  branchIdValidation,
  branchStockValidation,
  handleValidationErrors,
  stockController.getBranchStock
);

// GET /api/stock/product/:productId - Get stock for specific product
router.get(
  '/product/:productId',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
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

export default router;
