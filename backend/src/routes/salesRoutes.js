import express from 'express';
import { body, param } from 'express-validator';
import {
  getSalesOrders,
  getSalesOrder,
  getSalesOrdersByBranch,
  createSalesOrder,
  updateSalesOrderStatus,
  updateSalesOrderPayment,
  deleteSalesOrder,
  getSalesOrderInvoice,
  getSalesStatistics
} from '../controllers/salesController.js';
import { protect, authorize } from '../middleware/auth.js';
import { checkBranchAccess } from '../middleware/branchAccess.js';
import validate from '../middleware/validate.js';
import { USER_ROLES } from '../config/constants.js';

const router = express.Router();

// Validation rules
const createOrderValidation = [
  body('branch').notEmpty().isMongoId().withMessage('Valid branch ID is required'),
  body('customer.name').trim().notEmpty().withMessage('Customer name is required')
    .isLength({ max: 100 }).withMessage('Customer name cannot exceed 100 characters'),
  body('customer.phone').optional().trim().isLength({ max: 20 }).withMessage('Phone cannot exceed 20 characters'),
  body('customer.email').optional().trim().isEmail().withMessage('Invalid email format'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Invalid product ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.discount').optional().isFloat({ min: 0 }).withMessage('Discount cannot be negative'),
  body('taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
  body('discount').optional().isFloat({ min: 0 }).withMessage('Discount cannot be negative'),
  body('paymentMethod')
    .isIn(['cash', 'card', 'gcash', 'paymaya', 'bank-transfer'])
    .withMessage('Invalid payment method'),
  body('amountPaid').optional().isFloat({ min: 0 }).withMessage('Amount paid cannot be negative'),
  body('notes').optional().isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters'),
  validate
];

const updateStatusValidation = [
  param('id').isMongoId().withMessage('Valid order ID is required'),
  body('status')
    .isIn(['processing', 'completed', 'cancelled'])
    .withMessage('Status must be processing, completed, or cancelled'),
  validate
];

const updatePaymentValidation = [
  param('id').isMongoId().withMessage('Valid order ID is required'),
  body('amountPaid').optional().isFloat({ min: 0 }).withMessage('Amount paid cannot be negative'),
  body('paymentMethod')
    .optional()
    .isIn(['cash', 'card', 'gcash', 'paymaya', 'bank-transfer'])
    .withMessage('Invalid payment method'),
  validate
];

const mongoIdValidation = [
  param('id').isMongoId().withMessage('Valid order ID is required'),
  validate
];

const branchIdValidation = [
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  validate
];

// Routes

// GET /api/sales/stats - Get sales statistics
router.get(
  '/stats',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  getSalesStatistics
);

// GET /api/sales - Get all sales orders
router.get(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  getSalesOrders
);

// GET /api/sales/branch/:branchId - Get sales orders by branch
router.get(
  '/branch/:branchId',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  branchIdValidation,
  checkBranchAccess,
  getSalesOrdersByBranch
);

// GET /api/sales/:id - Get single sales order
router.get(
  '/:id',
  protect,
  mongoIdValidation,
  getSalesOrder
);

// GET /api/sales/:id/invoice - Get sales order invoice
router.get(
  '/:id/invoice',
  protect,
  mongoIdValidation,
  getSalesOrderInvoice
);

// POST /api/sales - Create new sales order
router.post(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  createOrderValidation,
  createSalesOrder
);

// PUT /api/sales/:id/status - Update sales order status
router.put(
  '/:id/status',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  updateStatusValidation,
  updateSalesOrderStatus
);

// PUT /api/sales/:id/payment - Update sales order payment
router.put(
  '/:id/payment',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  updatePaymentValidation,
  updateSalesOrderPayment
);

// DELETE /api/sales/:id - Cancel sales order
router.delete(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  mongoIdValidation,
  deleteSalesOrder
);

export default router;
