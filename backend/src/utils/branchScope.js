import { USER_ROLES } from '../config/constants.js';

/**
 * Resolve the branch a request is allowed to act on.
 *
 * Admins may target any branch (or none, meaning "all branches"). Everyone
 * else is pinned to their assigned branch regardless of what they asked for.
 *
 * @param {Object} user - req.user
 * @param {String} [requestedBranchId] - branch id taken from body or query
 * @returns {{ ok: true, branchId: String|null } | { ok: false, status: Number, message: String }}
 */
export const resolveBranchScope = (user, requestedBranchId) => {
  if (user.role === USER_ROLES.ADMIN) {
    return { ok: true, branchId: requestedBranchId || null };
  }

  if (!user.branch) {
    return { ok: false, status: 403, message: 'User not assigned to any branch' };
  }

  const ownBranchId = user.branch.toString();

  if (requestedBranchId && requestedBranchId.toString() !== ownBranchId) {
    return { ok: false, status: 403, message: 'Access denied to this branch' };
  }

  return { ok: true, branchId: ownBranchId };
};

/**
 * True when the user may act on a document that belongs to the given branch.
 */
export const canAccessBranch = (user, branchId) => {
  if (user.role === USER_ROLES.ADMIN) return true;
  if (!user.branch || !branchId) return false;
  return user.branch.toString() === branchId.toString();
};
