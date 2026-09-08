/**
 * Environments in which it is safe to expose internal detail to a caller:
 * password-reset tokens, 5xx messages, stack traces.
 *
 * The list is explicit and affirmative on purpose. The previous shape was
 * `NODE_ENV === 'production'` guarding the *safe* branch, which fails open:
 * unset, `PRODUCTION`, `prod`, `staging` and a typo all fell through to the
 * disclosing branch. On the forgot-password route that turned an unset variable
 * into an unauthenticated account-takeover primitive for any account, admins
 * included, bounded only by a 10-per-15-minutes rate limit.
 *
 * Anything not named here, including nothing at all, is treated as production.
 */
const DEBUG_ENVIRONMENTS = new Set(['development', 'test']);

/**
 * True only when NODE_ENV is explicitly one of the known debug environments.
 *
 * @returns {boolean}
 */
export const isDebugEnvironment = () => DEBUG_ENVIRONMENTS.has(process.env.NODE_ENV);

export default isDebugEnvironment;
