import express from 'express';
const router = express.Router();
import { body, param, query } from 'express-validator';
import {
  getProducts,
  getProduct,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  addProductImage,
  addProductImageUrl,
  deleteProductImage
} from '../controllers/productController.js';
import { protect, authorize } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { uploadSingleImage, processImage, handleUploadError } from '../middleware/imageUpload.js';
import { USER_ROLES } from '../config/constants.js';

// Barcodes are alphanumeric, not digits-only: EAN-13 and UPC-A are numeric, but
// Code 39 and Code 128 — which the scanner reads and which manufacturers print
// on parts — encode letters. The punctuation allowed is the subset of Code 39's
// symbol set that appears in real part numbers; spaces are excluded because a
// barcode is trimmed before storage and matched against a unique index, so an
// interior space would create two codes that read alike but store differently.
//
// Enforced here as well as in the frontend schema: the client can be bypassed,
// and the model itself carries no charset rule.
const BARCODE_PATTERN = /^[A-Za-z0-9._\/+-]+$/;

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
  
  body('productModel')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Product model cannot exceed 100 characters'),
  
  body('motorcycleModels')
    .optional()
    .isArray({ max: 50 })
    .withMessage('Motorcycle models must be an array of at most 50 entries'),
  
  body('motorcycleModels.*')
    .isMongoId()
    .withMessage('Invalid motorcycle model ID'),
  
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
    // A cleared barcode arrives as '' from the edit form and means "no barcode".
    // Plain .optional() only skips undefined, so '' fell through to the length
    // check and 400'd, making a barcode impossible to remove once set. Blanks are
    // normalised to absent in the model so they never collide in the unique index.
    .optional({ values: 'falsy' })
    .trim()
    .custom((value) => value === '' || BARCODE_PATTERN.test(value))
    .withMessage('Barcode may contain only letters, numbers and - . _ / +')
    .custom((value) => value === '' || (value.length >= 8 && value.length <= 20))
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
  
  body('productModel')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Product model cannot exceed 100 characters'),
  
  body('motorcycleModels')
    .optional()
    .isArray({ max: 50 })
    .withMessage('Motorcycle models must be an array of at most 50 entries'),
  
  body('motorcycleModels.*')
    .isMongoId()
    .withMessage('Invalid motorcycle model ID'),
  
  body('costPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Cost price must be a non-negative number'),
  
  body('sellingPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Selling price must be a non-negative number'),
  
  body('barcode')
    // A cleared barcode arrives as '' from the edit form and means "no barcode".
    // Plain .optional() only skips undefined, so '' fell through to the length
    // check and 400'd, making a barcode impossible to remove once set. Blanks are
    // normalised to absent in the model so they never collide in the unique index.
    .optional({ values: 'falsy' })
    .trim()
    .custom((value) => value === '' || BARCODE_PATTERN.test(value))
    .withMessage('Barcode may contain only letters, numbers and - . _ / +')
    .custom((value) => value === '' || (value.length >= 8 && value.length <= 20))
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

// `q` is optional here rather than required, because a motorcycle-model filter
// is a complete search on its own ("everything that fits a Click 125i"). The
// controller rejects the case where neither was supplied — the rule cannot live
// in a per-field chain, since it depends on two fields at once.
const searchValidation = [
  query('q')
    // `values: 'falsy'` so a cleared search box arriving as `?q=` is treated as
    // "no text" rather than failing the length check — otherwise a
    // motorcycle-only search sent from a form with an empty text input 400s.
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 1 })
    .withMessage('Search query cannot be empty'),

  query('motorcycleModel')
    .optional()
    .trim()
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

export default router;
