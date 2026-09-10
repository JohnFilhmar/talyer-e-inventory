/**
 * Makes a user-controlled value safe to put in a log line.
 *
 * This lived privately in `utils/cache.js`, where it was written for cache
 * keys. It is here because it was never only about cache keys: the request
 * logger in `server.js` writes `req.url`, and `middleware/cache.js` writes a
 * key built from `req.originalUrl`, and all three are the same problem. A
 * private copy in one module left the other two open.
 *
 * Newlines go first, because that is the whole of the log-injection trick: a
 * request for "/x\n2026-01-01 INFO admin deleted nothing" would otherwise write
 * a second, entirely fabricated log line. The remaining control characters go
 * too, since a terminal reading the log will happily interpret escape
 * sequences.
 *
 * Two details are load-bearing and easy to undo:
 *
 * - CR and LF are removed **one constant pattern at a time, replaced with the
 *   empty string**. A combined `[\r\n]` class, or replacing with ' ', is
 *   equally safe at runtime but is not the shape static analysis recognises as
 *   a log-injection barrier, and the alert stays open. The trailing sweep
 *   would catch both anyway; keeping them explicit is what makes the intent
 *   legible to a reader and a scanner alike.
 * - **The result is passed as a `%s` argument against a literal format
 *   string**, never interpolated into the template. Interpolating it makes the
 *   message itself externally controlled, so a value containing `%s` or `%d`
 *   reshuffles everything after it.
 */

/**
 * Longest fragment worth putting in a log line. A value can be arbitrarily long
 * (a 2000-character search term is a valid request), and a single hiccup should
 * not write a screenful.
 */
export const MAX_LOGGED_LENGTH = 200;

/**
 * @param {unknown} value
 * @returns {string}
 */
export const forLog = (value) =>
  String(value)
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, MAX_LOGGED_LENGTH);
