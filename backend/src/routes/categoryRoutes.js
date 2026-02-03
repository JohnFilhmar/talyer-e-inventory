const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const {
  getCategories,
  getCategory,
  getCategoryChildren,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { USER_ROLES } = require('../config/constants');

// Validation chains
const categoryIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid category ID')
];

const createCategoryValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Category name is required')
    .isLength({ max: 100 })
    .withMessage('Category name cannot exceed 100 characters'),
  
  body('code')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Category code cannot exceed 50 characters')
    .matches(/^[A-Z0-9-]+$/)
    .withMessage('Category code must contain only uppercase letters, numbers, and hyphens'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  body('parent')
    .optional({ nullable: true })
    .custom((value) => {
      // Allow null or empty string (will be treated as no parent)
      if (value === null || value === '' || value === undefined) {
        return true;
      }
      // If a value is provided, validate it's a valid MongoDB ObjectId
      if (!/^[0-9a-fA-F]{24}$/.test(value)) {
        throw new Error('Invalid parent category ID');
      }
      return true;
    }),
  
  body('image')
    .optional()
    .trim()
    .isURL()
    .withMessage('Image must be a valid URL'),
  
  body('color')
    .optional()
    .trim()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Color must be a valid hex color (e.g., #FF5733)'),
  
  body('sortOrder')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Sort order must be a non-negative integer')
];

const updateCategoryValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid category ID'),
  
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Category name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Category name cannot exceed 100 characters'),
  
  body('code')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Category code cannot exceed 50 characters')
    .matches(/^[A-Z0-9-]+$/)
    .withMessage('Category code must contain only uppercase letters, numbers, and hyphens'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  body('parent')
    .optional({ nullable: true })
    .custom((value) => {
      // Allow null or empty string (will be treated as no parent)
      if (value === null || value === '' || value === undefined) {
        return true;
      }
      // If a value is provided, validate it's a valid MongoDB ObjectId
      if (!/^[0-9a-fA-F]{24}$/.test(value)) {
        throw new Error('Invalid parent category ID');
      }
      return true;
    }),
  
  body('image')
    .optional()
    .trim()
    .isURL()
    .withMessage('Image must be a valid URL'),
  
  body('color')
    .optional()
    .trim()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Color must be a valid hex color (e.g., #FF5733)'),
  
  body('sortOrder')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Sort order must be a non-negative integer'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean value')
];

// Routes
router
  .route('/')
  .get(
    protect,
    getCategories
  )
  .post(
    protect,
    authorize(USER_ROLES.ADMIN),
    createCategoryValidation,
    validate,
    createCategory
  );

router
  .route('/:id')
  .get(
    protect,
    categoryIdValidation,
    validate,
    getCategory
  )
  .put(
    protect,
    authorize(USER_ROLES.ADMIN),
    updateCategoryValidation,
    validate,
    updateCategory
  )
  .delete(
    protect,
    authorize(USER_ROLES.ADMIN),
    categoryIdValidation,
    validate,
    deleteCategory
  );

router
  .route('/:id/children')
  .get(
    protect,
    categoryIdValidation,
    validate,
    getCategoryChildren
  );

module.exports = router;
