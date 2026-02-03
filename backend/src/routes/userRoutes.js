const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
  changeUserPassword,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// Validation chains
const getUsersValidation = [
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Search query too long'),
  query('role')
    .optional()
    .isIn(['admin', 'salesperson', 'mechanic', 'customer']).withMessage('Invalid role filter'),
  query('branch')
    .optional()
    .isMongoId().withMessage('Invalid branch ID'),
  query('isActive')
    .optional()
    .isIn(['true', 'false']).withMessage('isActive must be true or false'),
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['name', 'email', 'role', 'createdAt', 'updatedAt', 'isActive']).withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  validate
];

const getUserValidation = [
  param('id')
    .isMongoId().withMessage('Invalid user ID'),
  validate
];

const createUserValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['admin', 'salesperson', 'mechanic']).withMessage('Invalid role. Must be admin, salesperson, or mechanic'),
  body('branch')
    .optional()
    .isMongoId().withMessage('Invalid branch ID'),
  validate
];

const updateUserValidation = [
  param('id')
    .isMongoId().withMessage('Invalid user ID'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('role')
    .optional()
    .isIn(['admin', 'salesperson', 'mechanic']).withMessage('Invalid role. Must be admin, salesperson, or mechanic'),
  body('branch')
    .optional()
    .isMongoId().withMessage('Invalid branch ID'),
  validate
];

const userIdValidation = [
  param('id')
    .isMongoId().withMessage('Invalid user ID'),
  validate
];

const changePasswordValidation = [
  param('id')
    .isMongoId().withMessage('Invalid user ID'),
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
];

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

// User CRUD routes
router.route('/')
  .get(getUsersValidation, getUsers)
  .post(createUserValidation, createUser);

router.route('/:id')
  .get(getUserValidation, getUser)
  .put(updateUserValidation, updateUser);

// Activation/Deactivation routes
router.patch('/:id/deactivate', userIdValidation, deactivateUser);
router.patch('/:id/activate', userIdValidation, activateUser);

// Password change route
router.patch('/:id/password', changePasswordValidation, changeUserPassword);

module.exports = router;
