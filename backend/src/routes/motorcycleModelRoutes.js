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

// A range that runs backwards is always a mistake, but it can only be checked
// once both ends are known — so it lives on `yearTo` and reaches across to
// `yearFrom` rather than in either field's own chain.
//
// The model carries the same rule as a schema validator, but that fires during
// save and surfaces as a Mongoose ValidationError, which only becomes a 400 if
// the app-level errorHandler is mounted. Enforcing it here means the rejection
// travels the same validated-request path as every other field error, with the
// same payload shape.
const yearRangeValidation = body('yearTo').custom((value, { req }) => {
  const from = req.body?.yearFrom;
  if (value === undefined || value === null || value === '') return true;
  if (from === undefined || from === null || from === '') return true;
  if (Number(value) < Number(from)) {
    throw new Error('Year to must be greater than or equal to year from');
  }
  return true;
});

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
  yearRangeValidation,

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
  yearRangeValidation,

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
