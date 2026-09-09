import jwt from 'jsonwebtoken';

/**
 * Mint an access token for a user.
 *
 * The token carries a `pwd` claim: the moment the user's password last changed,
 * in epoch milliseconds, or 0 for a user who has never changed it. `protect`
 * compares that claim against the stored value and rejects a mismatch, which is
 * what ends a session that is already holding a signed token.
 *
 * A claim rather than the token's own `iat` because `iat` has one-second
 * resolution: a password reset and the re-login that follows it land in the same
 * second, so no comparison against `iat` can both reject the old token and
 * accept the new one.
 *
 * Takes the user document, not an id, deliberately. A caller that passes a bare
 * id would mint a token claiming "never changed", which stays valid across a
 * password change for exactly the users this protects. Failing loudly is
 * better than that.
 *
 * @param {{ _id: unknown, passwordChangedAt?: Date }} user
 */
const generateToken = (user) => {
  if (!user || !user._id) {
    throw new Error('generateToken requires a user document, not an id');
  }

  return jwt.sign(
    { id: user._id, pwd: passwordGeneration(user) },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

/**
 * The password generation a token is bound to.
 *
 * 0 for a user who has never changed their password, which is also what a token
 * minted before this claim existed decodes to. That is the migration allowance:
 * sessions that predate the deploy keep working until their owner changes their
 * password, rather than every logged-in user being signed out on release.
 *
 * @param {{ passwordChangedAt?: Date }} user
 * @returns {number}
 */
const passwordGeneration = (user) =>
  user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;

// Generate Refresh Token
const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
  });
};

export { generateToken, generateRefreshToken, passwordGeneration };
