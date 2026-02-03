import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateToken, generateRefreshToken } from '../utils/jwt.js';
import ApiResponse from '../utils/apiResponse.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Cookie options for refresh token
const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // Only HTTPS in production
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
});

/**
 * Set refresh token as httpOnly cookie
 */
const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());
};

/**
 * Clear refresh token cookie
 */
const clearRefreshTokenCookie = (res) => {
  res.cookie('refreshToken', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  // Validation
  if (!name || !email || !password) {
    return ApiResponse.error(res, 400, 'Please provide name, email and password');
  }

  // Check if user exists
  const userExists = await User.findOne({ email });

  if (userExists) {
    return ApiResponse.error(res, 400, 'User already exists');
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    role: role || 'customer',
  });

  if (user) {
    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    return ApiResponse.success(res, 201, 'User registered successfully', {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      accessToken,
    });
  } else {
    return ApiResponse.error(res, 400, 'Invalid user data');
  }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return ApiResponse.error(res, 400, 'Please provide email and password');
  }

  // Check for user (include password for comparison)
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return ApiResponse.error(res, 401, 'Invalid credentials');
  }

  // Check if user is active
  if (!user.isActive) {
    return ApiResponse.error(res, 401, 'Account is deactivated');
  }

  // Check password
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return ApiResponse.error(res, 401, 'Invalid credentials');
  }

  // Generate tokens
  const accessToken = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Save refresh token to user
  user.refreshToken = refreshToken;
  await user.save();

  // Set refresh token as httpOnly cookie
  setRefreshTokenCookie(res, refreshToken);

  return ApiResponse.success(res, 200, 'Login successful', {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
    },
    accessToken,
  });
});

// @desc    Refresh access token
// @route   POST /api/auth/refresh-token
// @access  Public
const refreshToken = asyncHandler(async (req, res) => {
  // Get refresh token from httpOnly cookie or request body (fallback)
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!token) {
    return ApiResponse.error(res, 401, 'No refresh token provided');
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    // Find user and check if refresh token matches
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== token) {
      clearRefreshTokenCookie(res);
      return ApiResponse.error(res, 401, 'Invalid refresh token');
    }

    if (!user.isActive) {
      clearRefreshTokenCookie(res);
      return ApiResponse.error(res, 401, 'Account is deactivated');
    }

    // Generate new access token
    const newAccessToken = generateToken(user._id);

    return ApiResponse.success(res, 200, 'Token refreshed successfully', {
      accessToken: newAccessToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        branch: user.branch,
      },
    });
  } catch (error) {
    clearRefreshTokenCookie(res);
    return ApiResponse.error(res, 401, 'Invalid or expired refresh token');
  }
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  // Clear refresh token from database
  const user = await User.findById(req.user._id);
  
  if (user) {
    user.refreshToken = undefined;
    await user.save();
  }

  // Clear the httpOnly cookie
  clearRefreshTokenCookie(res);

  return ApiResponse.success(res, 200, 'Logout successful');
});

// @desc    Get reset password token
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return ApiResponse.error(res, 400, 'Please provide an email');
  }

  const user = await User.findOne({ email });

  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  // Generate reset token
  const resetToken = user.getResetPasswordToken();
  await user.save();

  // In production, you would send this token via email
  // For now, we'll return it in the response (NOT RECOMMENDED FOR PRODUCTION)
  return ApiResponse.success(res, 200, 'Password reset token generated', {
    resetToken, // In production, send this via email instead
  });
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return ApiResponse.error(res, 400, 'Please provide reset token and new password');
  }

  if (newPassword.length < 6) {
    return ApiResponse.error(res, 400, 'Password must be at least 6 characters');
  }

  // Hash the reset token to compare with database
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Find user with valid reset token
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  }).select('+resetPasswordToken +resetPasswordExpire');

  if (!user) {
    return ApiResponse.error(res, 400, 'Invalid or expired reset token');
  }

  // Set new password
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  return ApiResponse.success(res, 200, 'Password reset successful');
});

// @desc    Register new customer (public registration)
// @route   POST /api/auth/register-customer
// @access  Public
const registerCustomer = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  // Validation
  if (!name || !email || !password) {
    return ApiResponse.error(res, 400, 'Please provide name, email and password');
  }

  // Check if user exists
  const userExists = await User.findOne({ email });

  if (userExists) {
    return ApiResponse.error(res, 400, 'An account with this email already exists');
  }

  // Create customer user (role is always 'customer', no branch required)
  const user = await User.create({
    name,
    email,
    password,
    phone,
    role: 'customer', // Always customer for public registration
    // No branch for customers - they can shop from any branch
  });

  if (user) {
    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    return ApiResponse.success(res, 201, 'Account created successfully', {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken,
    });
  } else {
    return ApiResponse.error(res, 400, 'Invalid user data');
  }
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('branch', 'name code');

  return ApiResponse.success(res, 200, 'User retrieved successfully', user);
});

export {
  register,
  registerCustomer,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getMe
};
