const { validationResult } = require('express-validator');
const ApiResponse = require('../utils/apiResponse');

/**
 * Middleware to validate request data
 * Use after validation chains from express-validator
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param || 'unknown',
      message: err.msg,
      value: err.value
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

module.exports = validate;
