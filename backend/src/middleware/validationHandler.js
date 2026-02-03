const { validationResult } = require('express-validator');

/**
 * Middleware to handle express-validator errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg).join(', ');
    return res.status(400).json({
      success: false,
      message: errorMessages,
      errors: errors.array()
    });
  }
  
  next();
};

module.exports = handleValidationErrors;
