import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import * as supplierController from '../controllers/supplierController.js';
import { protect, authorize } from '../middleware/auth.js';
import { USER_ROLES } from '../config/constants.js';
import handleValidationErrors from '../middleware/validationHandler.js';

// Validation rules
const createSupplierValidation = [
  body('name').notEmpty().isLength({ max: 200 }).withMessage('Name is required and cannot exceed 200 characters'),
  body('code').optional().isLength({ max: 50 }).withMessage('Code cannot exceed 50 characters'),
  body('contact.personName').optional().isString().isLength({ max: 100 }).withMessage('Contact person name cannot exceed 100 characters'),
  body('contact.phone').optional().isString().isLength({ max: 20 }).withMessage('Phone cannot exceed 20 characters'),
  body('contact.email').optional().isEmail({ allow_utf8_local_part: false }).withMessage('Invalid email format'),
  body('contact.website').optional().isURL().withMessage('Invalid website URL'),
  body('address.street').optional().isString().isLength({ max: 200 }).withMessage('Street cannot exceed 200 characters'),
  body('address.city').optional().isString().isLength({ max: 100 }).withMessage('City cannot exceed 100 characters'),
  body('address.province').optional().isString().isLength({ max: 100 }).withMessage('Province cannot exceed 100 characters'),
  body('address.postalCode').optional().isString().isLength({ max: 10 }).withMessage('Postal code cannot exceed 10 characters'),
  body('address.country').optional().isString().isLength({ max: 100 }).withMessage('Country cannot exceed 100 characters'),
  body('paymentTerms').optional().isIn(['COD', 'Net 7', 'Net 15', 'Net 30', 'Net 60', 'Net 90', 'Custom'])
    .withMessage('Invalid payment terms'),
  body('creditLimit').optional().isFloat({ min: 0 }).withMessage('Credit limit must be a non-negative number'),
  body('notes').optional().isString().isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

const updateSupplierValidation = [
  param('id').isMongoId().withMessage('Valid supplier ID is required'),
  ...createSupplierValidation.map(rule => rule.optional())
];

const mongoIdValidation = [
  param('id').isMongoId().withMessage('Valid supplier ID is required')
];

// Routes

// GET /api/suppliers - Get all suppliers
router.get(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  supplierController.getSuppliers
);

// GET /api/suppliers/:id - Get single supplier
router.get(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  mongoIdValidation,
  handleValidationErrors,
  supplierController.getSupplier
);

// POST /api/suppliers - Create new supplier
router.post(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN),
  createSupplierValidation,
  handleValidationErrors,
  supplierController.createSupplier
);

// PUT /api/suppliers/:id - Update supplier
router.put(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  updateSupplierValidation,
  handleValidationErrors,
  supplierController.updateSupplier
);

// DELETE /api/suppliers/:id - Delete (deactivate) supplier
router.delete(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  mongoIdValidation,
  handleValidationErrors,
  supplierController.deleteSupplier
);

export default router;
