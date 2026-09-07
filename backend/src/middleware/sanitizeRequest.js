import ApiResponse from '../utils/apiResponse.js';

/**
 * Reject request payloads that carry MongoDB operator syntax in their keys.
 *
 * Why this exists. The documented pipeline is
 * `protect -> authorize -> express-validator -> handleValidationErrors -> controller`,
 * and where a route declares a rule it already holds: `isMongoId`, `isEmail`,
 * `isIn`, `isInt` and `isString` all reject the string `"[object Object]"` that
 * express-validator produces when it stringifies an object, so the request 400s
 * before the controller runs. The hole is the routes that declare no rule for a
 * field. There, `{"mechanicId": {"$ne": null}}` from a JSON body survives into
 * `User.findById()`, and Mongoose executes it as a filter rather than rejecting
 * it. `PUT /api/services/:id/parts` was the worst case: a `$ne` there made the
 * stock deduction land on an arbitrary product while the ledger recorded it as
 * correct.
 *
 * Note what is NOT the vector. Express 5's default `query parser` is `simple`,
 * so `?x[$ne]=1` arrives as the literal key `"x[$ne]"` and never nests. The
 * reachable sources are `express.json()` and
 * `express.urlencoded({ extended: true })`, both mounted in `server.js`. The
 * query string is still walked here so the guard keeps holding if that setting
 * ever changes.
 *
 * Reject rather than strip. Stripping turns an attack into a silently different
 * query, which is harder to notice than a 400 and can still return the wrong
 * rows. Nothing legitimate sends these keys: no payload under
 * `frontend/src/lib/services/` and no backend test contains one.
 *
 * This does not replace per-route validation. It is the floor that holds for
 * routes whose chains are not written yet, and for routes nobody has added yet.
 */

// A key that begins with `$` is an operator. A key containing `.` is a path
// expression, which in an update document writes into a nested field.
const FORBIDDEN_KEY = /^\$|\./;

// Bounds so the walk itself cannot be turned into the denial of service it is
// meant to prevent. `express.json({ limit: '1mb' })` already caps the payload,
// but a 1mb body can still be very deeply nested or very wide. MAX_ENTRIES
// counts every key and array element actually inspected, not the number of
// containers: a flat object with 20000 keys is one container and 20000 entries,
// and it is the entries that cost. No real payload comes near either bound.
const MAX_DEPTH = 20;
const MAX_ENTRIES = 10000;

/**
 * Walk a parsed request container and return the first offending key, or null.
 * Iterative rather than recursive: a hand-built body can nest deeply enough to
 * blow the call stack, and a RangeError here would surface as a 500.
 */
const findForbiddenKey = (root) => {
  if (root === null || typeof root !== 'object') return null;

  const stack = [{ node: root, depth: 0 }];
  let entries = 0;

  while (stack.length > 0) {
    const { node, depth } = stack.pop();

    if (node === null || typeof node !== 'object') continue;
    if (depth > MAX_DEPTH) return '(payload nested too deeply to inspect)';

    if (Array.isArray(node)) {
      for (const value of node) {
        if (++entries > MAX_ENTRIES) return '(payload too large to inspect)';
        if (value !== null && typeof value === 'object') {
          stack.push({ node: value, depth: depth + 1 });
        }
      }
      continue;
    }

    // Own keys only. A prototype-sourced key is not something the client sent.
    for (const key of Object.keys(node)) {
      if (++entries > MAX_ENTRIES) return '(payload too large to inspect)';
      if (FORBIDDEN_KEY.test(key)) return key;
      const value = node[key];
      if (value !== null && typeof value === 'object') {
        stack.push({ node: value, depth: depth + 1 });
      }
    }
  }

  return null;
};

const sanitizeRequest = (req, res, next) => {
  // req.query is a getter in Express 5 and assigning to it silently does
  // nothing, which is one more reason this guard inspects and rejects rather
  // than rewriting anything.
  for (const container of [req.body, req.query, req.params]) {
    const offending = findForbiddenKey(container);
    if (offending) {
      return ApiResponse.error(
        res,
        400,
        `Request contains a disallowed field name: ${offending}`
      );
    }
  }

  return next();
};

export default sanitizeRequest;
