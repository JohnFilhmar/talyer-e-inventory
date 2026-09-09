import { validationResult } from 'express-validator';
import ApiResponse from '../utils/apiResponse.js';

/**
 * Middleware to validate request data
 * Use after validation chains from express-validator
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // The submitted value is deliberately not returned. Three auth chains apply
    // isLength({ min: 6 }) to a password field, so echoing the rejected value
    // put the submitted password in the 400 body, and from there into anything
    // that captures response bodies: an access log, an error tracker, a proxy
    // buffer, a support screenshot. Nothing ever consumed the field.
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param || 'unknown',
      message: err.msg
    }));

    return ApiResponse.error(
      res,
      400,
      'Validation failed',
      formattedErrors
    );
  }

  next();
};

export default validate;
