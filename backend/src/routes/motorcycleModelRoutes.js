import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import {
  getMotorcycleModels,
  getMotorcycleMakes,
  getMotorcycleModel,
  createMotorcycleModel,
  updateMotorcycleModel,
  deleteMotorcycleModel
} from '../controllers/motorcycleModelController.js';
import { protect, authorize } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { USER_ROLES } from '../config/constants.js';

// Validation chains
const motorcycleModelIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid motorcycle model ID')
];

// Both ends of the range are optional, but a value that is present must be a
// plausible model year — a typo like 20222 would otherwise sort ahead of every
// real entry in the picker.
//
// `values: 'falsy'` skips null and '' as well as undefined: the edit form sends
// an explicitly cleared year as null (JSON.stringify drops undefined keys, so
// undefined would never reach the server and the old value would survive the
// save), and the controller reads that null as "unset this".
const yearValidation = (field, label) =>
  body(field)
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: 2200 })
    .withMessage(`${label} must be a year between 1900 and 2200`)
    .toInt();

const createMotorcycleModelValidation = [
  body('make')
    .trim()
    .notEmpty()
    .withMessage('Make is required')
    .isLength({ max: 100 })
    .withMessage('Make cannot exceed 100 characters'),

  body('model')
    .trim()
    .notEmpty()
    .withMessage('Model is required')
    .isLength({ max: 100 })
    .withMessage('Model cannot exceed 100 characters'),

  yearValidation('yearFrom', 'Year from'),
  yearValidation('yearTo', 'Year to'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
];

const updateMotorcycleModelValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid motorcycle model ID'),

  body('make')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Make cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Make cannot exceed 100 characters'),

  body('model')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Model cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Model cannot exceed 100 characters'),

  yearValidation('yearFrom', 'Year from'),
  yearValidation('yearTo', 'Year to'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean value')
];

// Routes
// The makes route must come before /:id, or "makes" is parsed as an id.
router
  .route('/makes')
  .get(
    protect,
    getMotorcycleMakes
  );

router
  .route('/')
  .get(
    protect,
    getMotorcycleModels
  )
  .post(
    protect,
    authorize(USER_ROLES.ADMIN),
    createMotorcycleModelValidation,
    validate,
    createMotorcycleModel
  );

router
  .route('/:id')
  .get(
    protect,
    motorcycleModelIdValidation,
    validate,
    getMotorcycleModel
  )
  .put(
    protect,
    authorize(USER_ROLES.ADMIN),
    updateMotorcycleModelValidation,
    validate,
    updateMotorcycleModel
  )
  .delete(
    protect,
    authorize(USER_ROLES.ADMIN),
    motorcycleModelIdValidation,
    validate,
    deleteMotorcycleModel
  );

export default router;
