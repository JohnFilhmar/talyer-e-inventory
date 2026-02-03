// Async handler wrapper to eliminate try-catch blocks
// Wraps async route handlers and passes errors to error middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
