import { query } from 'express-validator';
import { PAGINATION } from '../config/constants.js';

/**
 * Reusable express-validator rules for read-route query parameters.
 *
 * Twelve read routes had no validation chain at all, so their query values went
 * straight into a Mongo filter (GAP-015d). `getUsersValidation` in
 * `routes/userRoutes.js` is the shape this follows; these factories exist so
 * the same five or six parameters are not respelled twelve times and cannot
 * drift apart between files.
 *
 * Every rule begins with `.not().isArray()`, and that is the load-bearing part.
 * Express parses `?x=1&x=2` into `["1","2"]`, and Mongoose silently rewrites
 * `{field: ["1","2"]}` into `{field: {$in: [...]}}` rather than raising a cast
 * error, so a repeated parameter widens a filter. Neither `isMongoId()` nor
 * `isInt()` nor `isISO8601()` stops it: all three validate the array's first
 * element and leave the array in place. Verified against express-validator
 * 7.3.2. Only `isString()` and an explicit array check reject it.
 *
 * Rejecting a repeated parameter is safe here because no client sends one: the
 * one filter that takes several values, `?motorcycleModel=a,b` on
 * `GET /products`, is deliberately comma-joined precisely because axios
 * serialises an array as `key[]=`.
 *
 * `.bail()` after the array check keeps the 400 message about the real problem
 * rather than reporting a format failure on an array.
 */

/** Optional, present at most once. The base every rule below builds on. */
const scalar = (name) =>
  query(name)
    .optional()
    .not()
    .isArray()
    .withMessage(`${name} must be a single value`)
    .bail();

/** A Mongo ObjectId, such as a branch or product filter. */
export const idRule = (name) =>
  scalar(name).isMongoId().withMessage(`Invalid ${name} ID`);

/** One of a fixed set, such as a status or a movement type. */
export const enumRule = (name, values) =>
  scalar(name).isIn(values).withMessage(`Invalid ${name} filter`);

/**
 * A boolean flag. These arrive as the strings 'true'/'false' and the
 * controllers compare them as strings (`active === 'true'`), so this checks the
 * string form rather than coercing, which would break that comparison.
 */
export const boolRule = (name) =>
  scalar(name).isIn(['true', 'false']).withMessage(`${name} must be true or false`);

/** Free text. Trimmed and capped; several of these reach an escaped $regex. */
export const textRule = (name, max = 100) =>
  scalar(name)
    .isString()
    .withMessage(`${name} must be a string`)
    .trim()
    .isLength({ max })
    .withMessage(`${name} cannot exceed ${max} characters`);

/**
 * A numeric bound, such as a price filter. Left as a string rather than
 * `.toFloat()`: the controllers wrap these in `parseFloat` themselves.
 */
export const numberRule = (name) =>
  scalar(name).isFloat().withMessage(`${name} must be a number`);

/**
 * An ISO-8601 date bound. Left as a string rather than `.toDate()`: the
 * controllers all wrap it in `new Date(...)` themselves, and a Date instance
 * flowing into that is a needless second conversion.
 */
export const dateRule = (name) =>
  scalar(name).isISO8601().withMessage(`${name} must be an ISO-8601 date`);

/** Page number. Coerced, so the controller's parseInt sees a number. */
export const pageRule = () =>
  scalar('page').isInt({ min: 1 }).withMessage('Page must be a positive integer').toInt();

/**
 * Page size, bounded by the same ceiling the controllers clamp to. Clients send
 * at most 100 today, which is PAGINATION.MAX_LIMIT, so this rejects nothing
 * that is currently sent.
 */
export const limitRule = () =>
  scalar('limit')
    .isInt({ min: 1, max: PAGINATION.MAX_LIMIT })
    .withMessage(`Limit must be between 1 and ${PAGINATION.MAX_LIMIT}`)
    .toInt();

/** The pair every paginated read accepts. */
export const paginationRules = () => [pageRule(), limitRule()];

/** The pair every date-filtered read accepts. */
export const dateRangeRules = () => [dateRule('startDate'), dateRule('endDate')];
