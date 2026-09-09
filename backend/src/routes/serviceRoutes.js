import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import * as serviceController from '../controllers/serviceController.js';
import { protect, authorize } from '../middleware/auth.js';
import validationHandler from '../middleware/validationHandler.js';
import { isValidPhoneNumber, normalizePhoneNumber } from '../utils/phoneValidation.js';
import {
  SERVICE_STATUS,
  SERVICE_PRIORITY,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
} from '../config/constants.js';
import {
  idRule,
  enumRule,
  textRule,
  paginationRules,
  dateRangeRules,
} from '../utils/queryRules.js';
import { SERVICE_SORT_FIELDS } from '../controllers/serviceController.js';

// Custom phone number validator
const phoneValidator = body('customer.phone')
  .trim()
  .notEmpty().withMessage('Phone number is required')
  .custom((value) => {
    const normalized = normalizePhoneNumber(value);
    if (!isValidPhoneNumber(normalized)) {
      throw new Error('Phone number must be 10 digits starting with 9 (e.g., 9171234567)');
    }
    return true;
  });

// GAP-017. POST / was the only route in this file with a validator; the four
// mutating PUTs and the DELETE went straight from authorize to the controller.
//
// Every one of them takes an :id, so validating it as a MongoId turns a
// malformed id into a 400 naming the field rather than a CastError surfacing
// as a 404 or a 500.
const serviceIdValidation = [
  param('id').isMongoId().withMessage('Valid service order ID is required')
];

const assignValidation = [
  ...serviceIdValidation,
  body('mechanicId').notEmpty().withMessage('Mechanic ID is required')
    .bail()
    .isMongoId().withMessage('Valid mechanic ID is required')
];

// updatePartsUsed destructured partsUsed and fed it straight to `for...of`, so
// a body of {} threw `TypeError: partsUsed is not iterable` and surfaced as a
// 500. The array and its element shape are both declared.
const partsValidation = [
  ...serviceIdValidation,
  body('partsUsed').isArray().withMessage('partsUsed must be an array'),
  body('partsUsed.*.product').isMongoId().withMessage('Invalid product ID'),
  body('partsUsed.*.quantity').isInt({ min: 1 })
    .withMessage('Part quantity must be at least 1').toInt()
];

// amountPaid was assigned with no numeric check, so "abc" cast to NaN. The
// pre-save comparison chain then left payment.status unchanged while amountPaid
// persisted as NaN, producing a document no later save could repair.
const paymentValidation = [
  ...serviceIdValidation,
  body('amountPaid').notEmpty().withMessage('Amount paid is required')
    .bail()
    .isFloat({ min: 0 }).withMessage('Amount paid must be a non-negative number').toFloat(),
  body('paymentMethod').optional()
    .isIn(Object.values(PAYMENT_METHODS)).withMessage('Invalid payment method')
];

const statusValidation = [
  ...serviceIdValidation,
  body('status').notEmpty().withMessage('Status is required')
    .bail()
    .isIn(Object.values(SERVICE_STATUS)).withMessage('Invalid status')
];

// Query validation for the read routes (GAP-015d). These had no chain at all.
const listServicesValidation = [
  idRule('branch'),
  idRule('assignedTo'),
  textRule('search'),
  enumRule('sortBy', SERVICE_SORT_FIELDS),
  enumRule('sortOrder', ['asc', 'desc']),
  enumRule('status', Object.values(SERVICE_STATUS)),
  enumRule('priority', Object.values(SERVICE_PRIORITY)),
  enumRule('paymentStatus', Object.values(PAYMENT_STATUS)),
  ...dateRangeRules(),
  ...paginationRules()
];

const myJobsValidation = [
  enumRule('status', Object.values(SERVICE_STATUS)),
  ...paginationRules()
];

// Validation rules for creating service order
const createServiceValidation = [
  // Optional idempotency key from an offline device replaying a queued order.
  // Opaque to the server — it only ever compares it for equality.
  body('clientRequestId').optional().isString().isLength({ min: 8, max: 100 })
    .withMessage('clientRequestId must be an opaque string of 8-100 characters'),
  body('branch').notEmpty().withMessage('Branch is required').isMongoId().withMessage('Invalid branch ID'),
  body('customer.name').trim().notEmpty().withMessage('Customer name is required').isLength({ max: 100 }).withMessage('Customer name cannot exceed 100 characters'),
  phoneValidator,
  body('customer.email').optional({ checkFalsy: true }).isEmail({ allow_utf8_local_part: false }).withMessage('Invalid email address'),
  body('customer.address').optional().isLength({ max: 200 }).withMessage('Address cannot exceed 200 characters'),
  body('description').trim().notEmpty().withMessage('Service description is required'),
  body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']).withMessage('Invalid priority'),
  body('laborCost').optional().isFloat({ min: 0 }).withMessage('Labor cost must be a positive number'),
  body('otherCharges').optional().isFloat({ min: 0 }).withMessage('Other charges must be a positive number'),
];

// Apply authentication to all routes
router.use(protect);

/**
 * @route   GET /api/services
 * @desc    Get all service orders with filters
 * @access  Private (Admin, Salesperson, Mechanic)
 */
router.get(
  '/',
  authorize('admin', 'salesperson', 'mechanic'),
  listServicesValidation,
  validationHandler,
  serviceController.getServiceOrders
);

/**
 * @route   GET /api/services/my-jobs
 * @desc    Get mechanic's assigned jobs
 * @access  Private (Mechanic)
 */
router.get(
  '/my-jobs',
  authorize('mechanic'),
  myJobsValidation,
  validationHandler,
  serviceController.getMyJobs
);

/**
 * @route   GET /api/services/:id
 * @desc    Get single service order
 * @access  Private
 */
router.get(
  '/:id',
  authorize('admin', 'salesperson', 'mechanic'),
  serviceController.getServiceOrder
);

/**
 * @route   GET /api/services/:id/invoice
 * @desc    Get service invoice
 * @access  Private
 */
router.get(
  '/:id/invoice',
  authorize('admin', 'salesperson', 'mechanic'),
  serviceController.getServiceInvoice
);

/**
 * @route   POST /api/services
 * @desc    Create new service order
 * @access  Private (Admin, Salesperson)
 */
router.post(
  '/',
  authorize('admin', 'salesperson'),
  createServiceValidation,
  validationHandler,
  serviceController.createServiceOrder
);

/**
 * @route   PUT /api/services/:id/assign
 * @desc    Assign/reassign mechanic
 * @access  Private (Admin, Salesperson)
 */
router.put(
  '/:id/assign',
  authorize('admin', 'salesperson'),
  assignValidation,
  validationHandler,
  serviceController.assignMechanic
);

/**
 * @route   PUT /api/services/:id/status
 * @desc    Update service order status
 * @access  Private (Admin, Salesperson, Mechanic)
 */
router.put(
  '/:id/status',
  authorize('admin', 'salesperson', 'mechanic'),
  statusValidation,
  validationHandler,
  serviceController.updateServiceOrderStatus
);

/**
 * @route   PUT /api/services/:id/parts
 * @desc    Add/update parts used
 * @access  Private (Admin, Salesperson, Mechanic)
 */
router.put(
  '/:id/parts',
  authorize('admin', 'salesperson', 'mechanic'),
  partsValidation,
  validationHandler,
  serviceController.updatePartsUsed
);

/**
 * @route   PUT /api/services/:id/payment
 * @desc    Update payment
 * @access  Private (Admin, Salesperson)
 */
router.put(
  '/:id/payment',
  authorize('admin', 'salesperson'),
  paymentValidation,
  validationHandler,
  serviceController.updatePayment
);

/**
 * @route   DELETE /api/services/:id
 * @desc    Cancel service order
 * @access  Private (Admin only)
 */
router.delete(
  '/:id',
  authorize('admin'),
  serviceIdValidation,
  validationHandler,
  serviceController.cancelServiceOrder
);

export default router;
