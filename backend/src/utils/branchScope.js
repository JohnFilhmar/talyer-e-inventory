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
/**
 * A branch id must look like a Mongo ObjectId before it is allowed into a
 * query.
 *
 * The route chains already reject a malformed one, but this function is the
 * boundary the controllers actually trust: it took whatever it was handed and,
 * for an admin, put it straight into a filter. Anything reaching it from a
 * caller that forgets its chain, or from a route added later, went through
 * unchecked. Coercing to a string first means an array or an object cannot slip
 * past on shape.
 */
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const isValidBranchId = (value) => OBJECT_ID.test(String(value));

export const resolveBranchScope = (user, requestedBranchId) => {
  if (user.role === USER_ROLES.ADMIN) {
    if (requestedBranchId === undefined || requestedBranchId === null || requestedBranchId === '') {
      return { ok: true, branchId: null };
    }
    if (!isValidBranchId(requestedBranchId)) {
      return { ok: false, status: 400, message: 'Invalid branch id' };
    }
    // Normalised to the matched string, so what reaches the query is a plain
    // 24-character hex id and never the original object or array.
    return { ok: true, branchId: String(requestedBranchId) };
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
