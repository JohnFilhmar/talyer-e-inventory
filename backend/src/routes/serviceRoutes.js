import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import * as serviceController from '../controllers/serviceController.js';
import { protect, authorize } from '../middleware/auth.js';
import validationHandler from '../middleware/validationHandler.js';
import { isValidPhoneNumber, normalizePhoneNumber } from '../utils/phoneValidation.js';

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

// Validation rules for creating service order
const createServiceValidation = [
  body('branch').notEmpty().withMessage('Branch is required').isMongoId().withMessage('Invalid branch ID'),
  body('customer.name').trim().notEmpty().withMessage('Customer name is required').isLength({ max: 100 }).withMessage('Customer name cannot exceed 100 characters'),
  phoneValidator,
  body('customer.email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email address'),
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
  serviceController.cancelServiceOrder
);

export default router;
