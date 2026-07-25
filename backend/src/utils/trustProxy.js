/**
 * Resolve the number of proxy hops Express should trust for `req.ip` /
 * `X-Forwarded-For` purposes, from the raw `TRUST_PROXY` environment value.
 *
 * `express-rate-limit` keys each client's counter off `req.ip`. With Express's
 * `trust proxy` setting left at its default (disabled), `req.ip` is always the
 * immediate TCP peer. Deployed behind a reverse proxy or load balancer
 * (Render, Railway, Heroku, Nginx, an ALB, Cloudflare, ...) that peer is the
 * proxy itself, so every distinct client collapses into one shared rate-limit
 * bucket — a self-inflicted denial of service (e.g. `authLimiter`'s 10
 * requests / 15 minutes would apply across *all* users combined, not each
 * one).
 *
 * The naive fix is just as dangerous in the other direction: unconditionally
 * trusting `X-Forwarded-For` (e.g. `app.set('trust proxy', true)`) means that
 * when the app *is* exposed directly to the internet, any client can forge
 * that header to get a fresh IP — and therefore a fresh rate-limit bucket —
 * on every request, defeating the limiter entirely.
 *
 * The correct hop count depends on the deployment topology and cannot be
 * known statically, so it is read from `TRUST_PROXY` at startup. The default,
 * returned whenever the value is missing, blank, non-numeric, or negative, is
 * `0` — meaning `X-Forwarded-For` is ignored and `req.ip` is the direct
 * connection. That is the safe choice when the app is exposed directly, and
 * it is deliberately NOT `true`/unlimited: do not "helpfully" change this
 * default without re-reading the spoofing risk above.
 *
 * @param {unknown} rawValue - The raw `TRUST_PROXY` environment value (or any
 *   value to resolve), typically `process.env.TRUST_PROXY`.
 * @returns {number} A non-negative integer hop count for Express's
 *   `trust proxy` setting. `0` unless `rawValue` parses to a non-negative
 *   integer.
 */
function resolveTrustProxy(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 0;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

export { resolveTrustProxy };
