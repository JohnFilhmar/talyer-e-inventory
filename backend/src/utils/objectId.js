/**
 * ObjectId shape check, written the way CodeQL recognises as a barrier.
 *
 * `utils/branchScope.js` already carries this pattern for branch ids, and the
 * NoSQL-injection triage in `GAP_ANALYSIS.md` section 13 records why the shape
 * matters: an express-validator `isMongoId()` chain does stop the value, but
 * CodeQL does not model validator chains, so an id that reaches a query object
 * only through a chain stays flagged. A regex test in the data path is what the
 * analysis follows, and it is real defence in depth rather than a silencer,
 * since it holds for any future caller that forgets the chain.
 *
 * Returns a string, never the caller's value, so an object or array cannot pass
 * through even if the regex somehow matched its stringification.
 */
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * @param {unknown} value
 * @returns {string|null} the id as a plain string, or null when it is not one
 */
export const asObjectId = (value) => {
  const candidate = String(value);
  return OBJECT_ID.test(candidate) ? candidate : null;
};
