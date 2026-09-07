/**
 * Escape every regex metacharacter in a value so it matches literally.
 *
 * Anything reaching a Mongo `$regex` from a request has to go through this.
 * Without it a search box is a pattern box: `(a+)+(a+)+$` backtracks
 * catastrophically and pins the single Node event loop for the whole process,
 * so one request from any authenticated account stalls the API for everyone.
 *
 * `String(value)` first, because the caller may hand us a number or an array
 * and `.replace` only exists on strings.
 */
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default escapeRegex;
