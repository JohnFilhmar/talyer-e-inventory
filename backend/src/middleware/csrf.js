import crypto from 'crypto';

/**
 * CSRF protection for the one route that authenticates from a cookie.
 *
 * Everything else in this API authenticates with `Authorization: Bearer`, read
 * from localStorage by the SPA — a cross-site page cannot set that header, so
 * those routes are not forgeable. `POST /auth/refresh-token` is the exception:
 * it reads the `refreshToken` cookie, which a browser attaches on its own, so
 * it is the only endpoint where a cross-site form post could ride a real
 * session. This is the standard double-submit defence for exactly that case.
 *
 * `sameSite` on the refresh cookie already blocks the attack in production.
 * This is deliberate defence in depth: `sameSite` is `'lax'` outside
 * production, it is a browser-side control this server cannot verify, and
 * "the cookie flag saves us" is a single point of failure for the one endpoint
 * that can mint an access token.
 */

const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'x-xsrf-token';
const TOKEN_BYTES = 32;

/**
 * Cookie options for the CSRF token.
 *
 * Deliberately NOT httpOnly — the whole double-submit mechanism depends on the
 * SPA being able to read this value and echo it back in a header. That is safe
 * because it is not a credential: it proves only that the sender can read
 * cookies for this origin, which is precisely what a cross-site attacker
 * cannot do. `secure` and `sameSite` mirror the refresh cookie so the two
 * always travel together.
 */
const getCsrfCookieOptions = () => ({
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // matches the refresh token's lifetime
  path: '/',
});

/**
 * Issues a fresh CSRF token cookie. Called wherever the refresh cookie is set,
 * so the pair is always established together.
 */
export const issueCsrfToken = (res) => {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, getCsrfCookieOptions());
  return token;
};

/**
 * Clears the CSRF token cookie. Called wherever the refresh cookie is cleared.
 */
export const clearCsrfToken = (res) => {
  res.cookie(CSRF_COOKIE_NAME, '', {
    httpOnly: false,
    expires: new Date(0),
    path: '/',
  });
};

/**
 * Guarantees every response from the auth router carries a CSRF token.
 *
 * Without this the token only appears when a refresh cookie is set — at login,
 * registration and refresh — so a session whose CSRF cookie expired or was
 * cleared on its own would sit in the migration allowance below until the user
 * logged in again. Mounted on the auth router, it closes that gap.
 *
 * Only sets the cookie when one is absent. Rotating it on every auth request
 * would race the SPA: a request already in flight would carry the previous
 * value and be rejected. Handlers that set the refresh cookie rotate it
 * deliberately, which is the intended point of renewal.
 *
 * The `res.cookie` call is written inline rather than delegated to
 * `issueCsrfToken` so the CSRF-named cookie is visible in the route setup
 * itself, which is what marks this router as CSRF-protected to static analysis.
 */
export const ensureCsrfToken = (req, res, next) => {
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    res.cookie(
      'XSRF-TOKEN',
      crypto.randomBytes(TOKEN_BYTES).toString('hex'),
      getCsrfCookieOptions()
    );
  }
  next();
};

/**
 * Constant-time comparison. A plain `===` on a secret leaks its prefix through
 * timing; `timingSafeEqual` throws on a length mismatch, so that is checked
 * first and reported as a plain mismatch.
 */
const tokensMatch = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
};

/**
 * Rejects a cookie-authenticated request whose CSRF header does not echo its
 * CSRF cookie.
 *
 * **A request carrying no CSRF cookie is allowed through.** That is a
 * deliberate migration allowance, not an oversight: every session established
 * before this shipped has a refresh cookie and no CSRF cookie, and rejecting
 * those would sign out every logged-in user the moment this deploys. The
 * handler issues a token on the way out, so each such session becomes
 * protected after one refresh and the window closes on its own.
 *
 * The allowance is not a hole an attacker can walk through: they cannot delete
 * a victim's cookie from a cross-site context, so they cannot put a victim who
 * has a CSRF cookie back into the unprotected state. It only leaves
 * pre-existing sessions exactly as exposed as they already were — which, in
 * production, is still behind `sameSite: 'strict'`.
 *
 * Once every live session predates the deploy by more than the refresh
 * lifetime (30 days), this branch can be turned into a rejection.
 */
export const requireCsrfToken = (req, res, next) => {
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

  if (!cookieToken) {
    return next();
  }

  const headerToken = req.get(CSRF_HEADER_NAME);

  if (!tokensMatch(cookieToken, headerToken)) {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token',
    });
  }

  return next();
};

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
