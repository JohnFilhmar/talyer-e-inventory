import User from '../models/User.js';
import { USER_ROLES } from '../config/constants.js';

const DEFAULT_ADMIN_NAME = 'Administrator';

// Mirrors the User model's own email format check (models/User.js) so an
// obviously malformed SEED_ADMIN_EMAIL is rejected before it ever reaches
// Mongoose validation.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the User model's password minlength (models/User.js).
const MIN_PASSWORD_LENGTH = 6;

const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Bootstraps the first admin account from environment variables, exactly
 * once. Intended to be called from `startServer()` after `connectDB()` on
 * every boot of every instance — it is safe to call unconditionally:
 *
 * - If `SEED_ADMIN_EMAIL` or `SEED_ADMIN_PASSWORD` is unset, this is a no-op.
 *   That is the normal case for local development and for the test suite.
 * - If any admin already exists, this is a no-op. Restarting the container,
 *   redeploying, or scaling to several replicas must never create a second
 *   admin, reset a password, or otherwise touch an existing account.
 * - If two replicas boot concurrently and both observe "no admin exists",
 *   `User.email`'s unique index lets exactly one insert succeed; the loser's
 *   duplicate-key error is treated as "another instance won the race" and
 *   swallowed quietly.
 * - Any other unexpected error is logged and swallowed. Seeding must never
 *   prevent the server from starting.
 *
 * The admin password is never logged, including on error paths.
 *
 * @returns {Promise<{status: 'created' | 'skipped', reason?: string}>}
 *   `reason` is present whenever `status` is `'skipped'`: one of
 *   `'not-configured'`, `'invalid-email'`, `'weak-password'`,
 *   `'admin-exists'`, or `'error'`.
 */
const seedAdminUser = async () => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || DEFAULT_ADMIN_NAME;

  if (!email || !password) {
    return { status: 'skipped', reason: 'not-configured' };
  }

  if (!EMAIL_REGEX.test(email)) {
    console.error(
      'seedAdminUser: SEED_ADMIN_EMAIL is not a valid email address. Skipping admin seed.'
    );
    return { status: 'skipped', reason: 'invalid-email' };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `seedAdminUser: SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters. Skipping admin seed.`
    );
    return { status: 'skipped', reason: 'weak-password' };
  }

  try {
    const existingAdmin = await User.findOne({ role: USER_ROLES.ADMIN });
    if (existingAdmin) {
      return { status: 'skipped', reason: 'admin-exists' };
    }

    await User.create({
      name,
      email,
      password,
      role: USER_ROLES.ADMIN,
      isActive: true,
    });

    return { status: 'created' };
  } catch (error) {
    if (error && error.code === MONGO_DUPLICATE_KEY_ERROR_CODE) {
      // Another instance won the create race concurrently.
      return { status: 'skipped', reason: 'admin-exists' };
    }

    // Log only the message, never the full error object — a Mongoose
    // ValidationError can echo back the offending field's raw value, and we
    // must never risk the plaintext password reaching the logs.
    console.error(
      'seedAdminUser: unexpected error while seeding admin user:',
      error instanceof Error ? error.message : error
    );
    return { status: 'skipped', reason: 'error' };
  }
};

export { seedAdminUser };
export default seedAdminUser;
