import { isDebugEnvironment } from '../utils/environment.js';
import logger from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode;

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose/MongoDB duplicate key error.
  //
  // Keyed on code 11000 alone. The previous condition also matched any
  // `err.name === 'MongoServerError'`, which is the name the driver gives
  // *every* server-side failure: a failover, a stepdown, a write concern
  // timeout, an exhausted connection pool. All of those were answered 400 with
  // the message "Field already exists".
  //
  // That is not merely a wrong message. The offline outbox classifies a 4xx as
  // permanent and marks the entry `rejected`, while a 5xx leaves it `pending`
  // to retry (see frontend/src/lib/offline/sync.ts). So a Mongo failover during
  // replay silently discarded real sales that would have succeeded a second
  // later. A transient server error must reach the client as 5xx.
  if (err.code === 11000) {
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

  // Log after the status is resolved, not before.
  //
  // This used to be `console.error('Error:', err)` at the top of the handler,
  // which meant every ordinary 400 and 404 was written at error level with the
  // whole error object attached. An alert on error-level lines would have fired
  // on a customer mistyping an email. A 4xx is the caller's problem and a 5xx is
  // ours, so the level follows the status the client actually receives.
  //
  // Only `name`, `message` and the request id go to the log. The whole object
  // carries driver internals and, on a Mongo error, the failing document, which
  // is how a password hash or a customer's details end up in a log line. The
  // stack is attached for 5xx only, where it is the thing you actually need.
  logger[statusCode >= 500 ? 'error' : 'warn'](
    {
      reqId: req.id,
      statusCode,
      err: { name: err.name, message: err.message },
      ...(statusCode >= 500 && { stack: err.stack }),
    },
    'request failed'
  );

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
