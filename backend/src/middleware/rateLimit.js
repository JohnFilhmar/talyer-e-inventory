import rateLimit from 'express-rate-limit';

/**
 * Aggressive limiter for credential and token endpoints. Blocks the
 * brute-force and enumeration loops that these routes otherwise invite.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many attempts, please try again later',
  },
});

/**
 * Broad limiter for the rest of the API.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
});
