const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const {
  getProducts,
  getProduct,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  addProductImage,
  addProductImageUrl,
  deleteProductImage
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadSingleImage, processImage, handleUploadError } = require('../middleware/imageUpload');
const { USER_ROLES } = require('../config/constants');

// Validation chains
const productIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid product ID')
];

const createProductValidation = [
  body('sku')
    .optional()
    .trim()
    .matches(/^[A-Z0-9-]+$/)
    .withMessage('SKU must contain only uppercase letters, numbers, and hyphens'),
  
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ max: 200 })
    .withMessage('Product name cannot exceed 200 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isMongoId()
    .withMessage('Invalid category ID'),
  
  body('brand')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Brand cannot exceed 100 characters'),
  
  body('model')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Model cannot exceed 100 characters'),
  
  body('costPrice')
    .notEmpty()
    .withMessage('Cost price is required')
    .isFloat({ min: 0 })
    .withMessage('Cost price must be a non-negative number'),
  
  body('sellingPrice')
    .notEmpty()
    .withMessage('Selling price is required')
    .isFloat({ min: 0 })
    .withMessage('Selling price must be a non-negative number'),
  
  body('barcode')
    .optional()
    .trim()
    .isLength({ min: 8, max: 20 })
    .withMessage('Barcode must be between 8 and 20 characters'),
  
  body('images')
    .optional()
    .isArray()
    .withMessage('Images must be an array'),
  
  body('images.*.url')
    .trim()
    .isURL()
    .withMessage('Image URL must be valid'),
  
  body('images.*.isPrimary')
    .optional()
    .isBoolean()
    .withMessage('isPrimary must be a boolean'),
  
  body('specifications')
    .optional()
    .isObject()
    .withMessage('Specifications must be an object'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

const updateProductValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid product ID'),
  
  body('sku')
    .optional()
    .trim()
    .matches(/^[A-Z0-9-]+$/)
    .withMessage('SKU must contain only uppercase letters, numbers, and hyphens'),
  
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Product name cannot be empty')
    .isLength({ max: 200 })
    .withMessage('Product name cannot exceed 200 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  
  body('category')
    .optional()
    .isMongoId()
    .withMessage('Invalid category ID'),
  
  body('brand')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Brand cannot exceed 100 characters'),
  
  body('model')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Model cannot exceed 100 characters'),
  
  body('costPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Cost price must be a non-negative number'),
  
  body('sellingPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Selling price must be a non-negative number'),
  
  body('barcode')
    .optional()
    .trim()
    .isLength({ min: 8, max: 20 })
    .withMessage('Barcode must be between 8 and 20 characters'),
  
  body('images')
    .optional()
    .isArray()
    .withMessage('Images must be an array'),
  
  body('specifications')
    .optional()
    .isObject()
    .withMessage('Specifications must be an object'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  
  body('isDiscontinued')
    .optional()
    .isBoolean()
    .withMessage('isDiscontinued must be a boolean')
];

const addImageValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid product ID'),
  
  body('url')
    .trim()
    .notEmpty()
    .withMessage('Image URL is required')
    .isURL()
    .withMessage('Image URL must be valid'),
  
  body('isPrimary')
    .optional()
    .isBoolean()
    .withMessage('isPrimary must be a boolean')
];

const deleteImageValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid product ID'),
  
  param('imageId')
    .isMongoId()
    .withMessage('Invalid image ID')
];

const searchValidation = [
  query('q')
    .trim()
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 1 })
    .withMessage('Search query cannot be empty')
];

// Routes
// Search route must come before /:id to avoid conflicts
router
  .route('/search')
  .get(
    protect,
    searchValidation,
    validate,
    searchProducts
  );

router
  .route('/')
  .get(
    protect,
    getProducts
  )
  .post(
    protect,
    authorize(USER_ROLES.ADMIN),
    createProductValidation,
    validate,
    createProduct
  );

router
  .route('/:id')
  .get(
    protect,
    productIdValidation,
    validate,
    getProduct
  )
  .put(
    protect,
    authorize(USER_ROLES.ADMIN),
    updateProductValidation,
    validate,
    updateProduct
  )
  .delete(
    protect,
    authorize(USER_ROLES.ADMIN),
    productIdValidation,
    validate,
    deleteProduct
  );

// Image upload route (FormData with file)
router
  .route('/:id/images')
  .post(
    protect,
    authorize(USER_ROLES.ADMIN),
    uploadSingleImage,
    handleUploadError,
    processImage,
    addProductImage
  );

// Image URL route (legacy support for URL-based images)
router
  .route('/:id/images/url')
  .post(
    protect,
    authorize(USER_ROLES.ADMIN),
    addImageValidation,
    validate,
    addProductImageUrl
  );

router
  .route('/:id/images/:imageId')
  .delete(
    protect,
    authorize(USER_ROLES.ADMIN),
    deleteImageValidation,
    validate,
    deleteProductImage
  );

module.exports = router;
