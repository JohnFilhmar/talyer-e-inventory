import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import User from '../models/User.js';
import { passwordGeneration } from '../utils/jwt.js';

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found',
        });
      }

      if (!req.user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated',
        });
      }

      // A password change ends every session, including ones already holding a
      // signed access token.
      //
      // Clearing the stored refresh token (GAP-001) stops an attacker minting
      // NEW tokens, but an access token already in their hands stays valid for
      // its full 7 days, and the reset flow exists precisely to remediate a
      // compromise.
      //
      // A token with no `pwd` claim decodes to 0, which matches a user who has
      // never changed their password. That is deliberate: sessions established
      // before this shipped keep working until their owner changes their
      // password, rather than every logged-in user being signed out on deploy.
      if ((decoded.pwd ?? 0) !== passwordGeneration(req.user)) {
        return res.status(401).json({
          success: false,
          message: 'Password was changed. Please log in again.',
        });
      }

      next();
    } catch (error) {
      // Name and message only. A JsonWebTokenError's message is safe, but the
      // object can carry the token that failed to verify.
      logger.warn(
        { reqId: req.id, err: { name: error.name, message: error.message } },
        'token rejected'
      );
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed',
      });
    }
  } else {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token',
    });
  }
};

// Optional: Admin role check
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`,
      });
    }
    next();
  };
};

export { protect, authorize };
