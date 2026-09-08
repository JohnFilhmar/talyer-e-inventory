import express from 'express';
const router = express.Router();
import { body, param, query } from 'express-validator';
import {
  getCategories,
  getCategory,
  getCategoryChildren,
  createCategory,
  updateCategory,
  deleteCategory,
  restoreCategory
} from '../controllers/categoryController.js';
import { protect, authorize } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { USER_ROLES } from '../config/constants.js';
import { boolRule } from '../utils/queryRules.js';

// Query validation for GET /api/categories (GAP-015d): no chain existed, so
// `parent` reached a Mongo filter unconstrained.
//
// `parent` cannot use the shared idRule: `?parent=null` is the documented way
// to ask for root categories, and getCategories maps that literal string to a
// null parent. A plain isMongoId() rejects it. This mirrors the custom
// ObjectId test the body('parent') rules in this file already use. Note that
// `.if()` is not an option here: express-validator skips a chain when the
// condition *throws*, not when it returns false.
const listCategoriesValidation = [
  query('parent')
    .optional()
    .not().isArray().withMessage('parent must be a single value')
    .bail()
    .custom((value) => value === 'null' || /^[0-9a-fA-F]{24}$/.test(value))
    .withMessage('Invalid parent category ID'),
  boolRule('active'),
  boolRule('includeChildren')
];

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
    listCategoriesValidation,
    validate,
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

// Restore is a distinct verb, not a PUT with { isActive: true }: bringing a
// record back is a one-field state change and should not have to satisfy the
// full update validator or resend every field.
router
  .route('/:id/restore')
  .patch(
    protect,
    authorize(USER_ROLES.ADMIN),
    categoryIdValidation,
    validate,
    restoreCategory
  );

router
  .route('/:id/children')
  .get(
    protect,
    categoryIdValidation,
    validate,
    getCategoryChildren
  );

export default router;
