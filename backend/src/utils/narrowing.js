/**
 * Narrow a request value where it is used, not only where it arrives.
 *
 * Every route that reaches a Mongo filter already has an express-validator
 * chain in front of it. That is correct about exploitability and insufficient as
 * a design: the constraint lives in a different module from the query, so the
 * controller itself trusts whatever it is handed, and it stays correct only for
 * as long as every route in front of it keeps its chain. That assumption has
 * failed three times in this codebase already, in `resolveBranchScope`, in the
 * four service routes GAP-017 covers, and in the twelve read routes of
 * GAP-015d.
 *
 * It is also what CodeQL reports. The analysis does not model validator chains,
 * so a value guarded only by one still reads as user input reaching a query
 * object. Section 13.4 of `GAP_ANALYSIS.md` records the taxonomy: changing the
 * dataflow closes an alert, adding a validator does not.
 *
 * Each helper below returns a value the caller constructed, never the caller's
 * own object: a checked string, a member of a fixed list, or a `Date`. That is
 * what makes them barriers rather than assertions, and it is why `asEnum`
 * returns the matching entry from `allowed` rather than the input that matched.
 *
 * They also require a string rather than coercing one. `String(x)` is not a
 * type check: a one-element array stringifies to its element, so
 * `String(['507f1f77bcf86cd799439011'])` is that id exactly and would pass a
 * regex test. `utils/branchScope.js` carried that shape, with a comment
 * claiming an array could not slip past it. A two-element array is rejected by
 * any of these tests, since it stringifies with a comma, so this closed a
 * narrow case rather than a wide one, but the comment was wrong and the check
 * now matches what it says.
 */

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * A 24-character hex id.
 *
 * Requires a string. A caller holding a real ObjectId converts it itself, which
 * keeps "this came from a request" and "this came from a document" distinct at
 * every call site.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export const asObjectId = (value) =>
  typeof value === 'string' && OBJECT_ID.test(value) ? value : null;

/**
 * One of a fixed set, returned from that set.
 *
 * @template T
 * @param {unknown} value
 * @param {readonly T[]} allowed
 * @returns {T|null}
 */
export const asEnum = (value, allowed) => {
  if (typeof value !== 'string') return null;
  const match = allowed.find((entry) => entry === value);
  return match === undefined ? null : match;
};

/**
 * A real date, or null.
 *
 * `new Date(undefined)` and `new Date({})` are both `Invalid Date`, which
 * Mongoose casts into a filter as `null` rather than rejecting, so an
 * unparseable date silently changes what a range query means.
 *
 * @param {unknown} value
 * @returns {Date|null}
 */
export const asDate = (value) => {
  if (typeof value !== 'string') return null;
  const candidate = new Date(value);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

/**
 * A non-negative integer, such as a page or a limit.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
export const asCount = (value, fallback) => {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const candidate = Number.parseInt(String(value), 10);
  return Number.isFinite(candidate) && candidate >= 0 ? candidate : fallback;
};
