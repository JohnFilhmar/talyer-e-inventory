import ApiResponse from '../utils/apiResponse.js';
import { USER_ROLES } from '../config/constants.js';

/**
 * Middleware to check if user has access to a specific branch
 * Admin can access all branches
 * Other users can only access their assigned branch
 */
const checkBranchAccess = (req, res, next) => {
  const { branchId } = req.params;
  const user = req.user;

  // Admin can access all branches
  if (user.role === USER_ROLES.ADMIN) {
    return next();
  }

  // Check if user's branch matches requested branch
  if (!user.branch) {
    return ApiResponse.error(res, 403, 'User not assigned to any branch');
  }

  if (user.branch.toString() !== branchId) {
    return ApiResponse.error(res, 403, 'Access denied to this branch');
  }

  next();
};

/**
 * Middleware to allow access only to user's own branch
 * Automatically uses user's branch from token
 */
const ownBranchOnly = (req, res, next) => {
  const user = req.user;

  if (!user.branch && user.role !== USER_ROLES.ADMIN) {
    return ApiResponse.error(res, 403, 'User not assigned to any branch');
  }

  // Attach branch to request for easy access
  req.userBranch = user.branch;
  next();
};

export { checkBranchAccess, ownBranchOnly };
