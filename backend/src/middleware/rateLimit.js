import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';

/**
 * Rate-limit key: the authenticated user when there is one, the client IP
 * otherwise.
 *
 * Keying purely by IP punishes the wrong thing. A shop runs behind one NAT, so
 * every device in the building shares a single public address — one admin doing
 * a run of product edits would exhaust the budget for the whole counter. Worse,
 * a single page action is not a single request: saving a product also
 * invalidates and refetches the detail and the list, so real work costs the
 * limiter roughly ten hits per edit.
 *
 * The token has to be *verified*, not merely decoded. An unverified token as a
 * key lets anyone mint arbitrary strings and get a fresh bucket per request,
 * which removes rate limiting altogether rather than scoping it.
 *
 * Falls back to `ipKeyGenerator` rather than raw `req.ip`, which is what
 * normalises IPv6 — an untruncated v6 address gives every request from one
 * client its own bucket, since the client can vary the low bits at will.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export const userOrIpKey = (req) => {
  const header = req.headers.authorization;

  if (header?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (decoded?.id) return `user:${decoded.id}`;
    } catch {
      // Expired or forged token: fall through to the IP bucket. Not an auth
      // decision — `protect` still runs and still rejects it.
    }
  }

  return `ip:${ipKeyGenerator(req.ip)}`;
};

/**
 * Aggressive limiter for credential and token endpoints. Blocks the
 * brute-force and enumeration loops that these routes otherwise invite.
 *
 * Deliberately keyed by IP alone: these are the routes you reach *without* a
 * token, so there is no user to key by, and the whole point is to bound
 * guessing from one source.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many attempts, please try again later',
  },
});

/**
 * Broad limiter for the rest of the API.
 *
 * The ceiling is per authenticated user (see `userOrIpKey`) and sized for staff
 * doing sustained bulk work — editing a catalogue, receiving a delivery — not
 * for an anonymous public API. At roughly ten requests per product edited, the
 * old shared 300 ran out after about thirty edits and then locked the user out
 * for the remainder of a fixed fifteen-minute window.
 *
 * This is a backstop against runaway clients and scraping, not the app's
 * authorisation boundary; `protect` and `authorize` are that.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
});
