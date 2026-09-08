/**
 * Copy only the named fields out of a request body.
 *
 * Why this exists. `findByIdAndUpdate(id, req.body)` hands the whole parsed
 * body to Mongoose as an update document, and Mongoose does not filter it:
 * `$unset`, `$rename` and `$inc` pass through untouched even with
 * `runValidators: true`, and a field the route's validation chain never
 * mentions is written just the same. express-validator is a whitelist of
 * *rules*, not of *fields*, so a chain cannot close this on its own.
 *
 * `sanitizeRequest` already rejects `$`-prefixed and dotted keys before any
 * controller runs, which kills the operator half. This closes the other half,
 * mass assignment: an admin setting a field no form exposes.
 *
 * Only own, defined keys are copied. An explicitly `null` value IS copied,
 * because clearing a field is a legitimate edit: `manager: null` detaches a
 * branch manager, and `parent: null` promotes a category to a root.
 *
 * @param {Object} source Typically `req.body`.
 * @param {string[]} allowed Top-level field names this route accepts.
 * @returns {Object} A new object holding only the allowed fields present.
 */
export const pickFields = (source, allowed) => {
  const picked = {};

  if (source === null || typeof source !== 'object') return picked;

  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      picked[field] = source[field];
    }
  }

  return picked;
};

export default pickFields;
