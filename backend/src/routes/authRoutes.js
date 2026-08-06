import express from 'express';
import { body } from 'express-validator';
import {
  register,
  registerCustomer,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { requireCsrfToken, ensureCsrfToken } from '../middleware/csrf.js';
import validate from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Validation chains
const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
];

// Customer registration validation (simplified - no role or branch)
const customerRegisterValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone')
    .optional()
    .trim()
    .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone number format'),
  validate
];

const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail({ allow_utf8_local_part: false }).withMessage('Please provide a valid email'),
  body('password')
    .notEmpty().withMessage('Password is required'),
  validate
];

const refreshTokenValidation = [
  // refreshToken is optional in body - can come from httpOnly cookie
  body('refreshToken')
    .optional(),
  validate
];

const forgotPasswordValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail({ allow_utf8_local_part: false }).withMessage('Please provide a valid email'),
  validate
];

const resetPasswordValidation = [
  body('resetToken')
    .notEmpty().withMessage('Reset token is required'),
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
];

// Every auth response carries a CSRF token, so the SPA always has one to echo
// on the refresh call. Mounted router-wide rather than per-route because a
// token that only exists after login leaves a session unprotected the moment
// its cookie lapses.
router.use(ensureCsrfToken);

// Public routes
// authLimiter (10 req/15 min) guards only the credential-and-token-issuing
// endpoints below. /refresh-token, /logout, and /me are deliberately left to
// the router-level apiLimiter (300 req/15 min) — they are called
// automatically by the SPA on every protected-page mount / 401, so a strict
// limiter there locks out normal users, not attackers.
router.post('/register', authLimiter, registerValidation, register);
router.post('/register-customer', authLimiter, customerRegisterValidation, registerCustomer);
router.post('/login', authLimiter, loginValidation, login);
// requireCsrfToken guards this route and no other: it is the only endpoint
// that authenticates from a cookie, so it is the only one a cross-site page
// could ride. Everything else needs an Authorization header that such a
// page cannot set.
router.post('/refresh-token', requireCsrfToken, refreshTokenValidation, refreshToken);
router.post('/forgot-password', authLimiter, forgotPasswordValidation, forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidation, resetPassword);

// Protected routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

export default router;
