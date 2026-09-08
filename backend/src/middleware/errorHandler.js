import { isDebugEnvironment } from '../utils/environment.js';

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode;

  // Log error for dev
  console.error('Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose/MongoDB duplicate key error
  // Check both err.code (for MongoServerError) and err.name
  if (err.code === 11000 || err.name === 'MongoServerError') {
    const keyPattern = err.keyPattern || err.keyValue || {};
    const field = Object.keys(keyPattern)[0] || 'field';
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  const statusCode = error.statusCode || 500;

  // Affirmative test, not `!== 'production'`. Gating disclosure on production
  // fails open: NODE_ENV unset, or spelled `PRODUCTION`, `prod` or `staging`,
  // used to leak the raw 5xx message and a full stack trace. Anything not
  // explicitly development or test is now treated as production.
  const canDisclose = isDebugEnvironment();

  // 5xx messages come from internal failures and can carry connection
  // strings, driver internals, or file paths. Never send them to a client.
  const message =
    statusCode >= 500 && !canDisclose
      ? 'Server Error'
      : error.message || 'Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(canDisclose && { stack: err.stack }),
  });
};

export default errorHandler;
