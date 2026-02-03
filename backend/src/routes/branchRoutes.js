const express = require('express');
const { body, param } = require('express-validator');
const {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  getBranchStats
} = require('../controllers/branchController');
const { protect, authorize } = require('../middleware/auth');
const { checkBranchAccess } = require('../middleware/branchAccess');
const validate = require('../middleware/validate');
const cacheMiddleware = require('../middleware/cache');
const { USER_ROLES, CACHE_TTL } = require('../config/constants');

const router = express.Router();

// Validation chains
const branchIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid branch ID format'),
  validate
];

const createBranchValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Branch name is required')
    .isLength({ max: 100 }).withMessage('Branch name cannot exceed 100 characters'),
  body('code')
    .trim()
    .notEmpty().withMessage('Branch code is required')
    .isLength({ max: 20 }).withMessage('Branch code cannot exceed 20 characters')
    .matches(/^[A-Z0-9-]+$/).withMessage('Branch code must be uppercase alphanumeric with hyphens only'),
  body('address.street')
    .trim()
    .notEmpty().withMessage('Street address is required'),
  body('address.city')
    .trim()
    .notEmpty().withMessage('City is required'),
  body('address.province')
    .trim()
    .notEmpty().withMessage('Province is required'),
  body('contact.phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone number format'),
  body('contact.email')
    .optional()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('manager')
    .optional()
    .isMongoId().withMessage('Invalid manager ID'),
  body('settings.taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
  validate
];

const updateBranchValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid branch ID format'),
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Branch name cannot exceed 100 characters'),
  body('code')
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage('Branch code cannot exceed 20 characters')
    .matches(/^[A-Z0-9-]+$/).withMessage('Branch code must be uppercase alphanumeric with hyphens only'),
  body('contact.email')
    .optional()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('manager')
    .optional()
    .isMongoId().withMessage('Invalid manager ID'),
  validate
];

// Public routes (require authentication only)
router.get(
  '/',
  protect,
  cacheMiddleware('branches', CACHE_TTL.LONG),
  getBranches
);

router.get(
  '/:id',
  protect,
  branchIdValidation,
  cacheMiddleware('branch', CACHE_TTL.MEDIUM),
  getBranch
);

router.get(
  '/:id/stats',
  protect,
  branchIdValidation,
  checkBranchAccess,
  getBranchStats
);

// Admin-only routes
router.post(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN),
  createBranchValidation,
  createBranch
);

router.put(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  updateBranchValidation,
  updateBranch
);

router.delete(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  branchIdValidation,
  deleteBranch
);

module.exports = router;
