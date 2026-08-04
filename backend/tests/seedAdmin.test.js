import * as dbHandler from './setup/dbHandler.js';
import User from '../src/models/User.js';
import { USER_ROLES } from '../src/config/constants.js';
import { seedAdminUser } from '../src/utils/seedAdmin.js';

/**
 * Connect to a new in-memory database before running any tests
 */
beforeAll(async () => {
  await dbHandler.connect();
});

/**
 * Clear all test data after every test
 */
afterEach(async () => {
  await dbHandler.clearDatabase();
});

/**
 * Remove and close the db and server
 */
afterAll(async () => {
  await dbHandler.closeDatabase();
});

describe('seedAdminUser', () => {
  const ENV_KEYS = ['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'SEED_ADMIN_NAME'];
  let originalEnv;

  beforeEach(() => {
    originalEnv = {};
    ENV_KEYS.forEach((key) => {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  it('creates the admin when the variables are set and no admin exists', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@talyer.test';
    process.env.SEED_ADMIN_PASSWORD = 'supersecret';

    const result = await seedAdminUser();

    expect(result.status).toBe('created');

    const created = await User.findOne({ email: 'admin@talyer.test' });
    expect(created).not.toBeNull();
    expect(created.role).toBe(USER_ROLES.ADMIN);
    expect(created.isActive).toBe(true);
    expect(created.branch).toBeUndefined();
  });

  it('defaults the name to "Administrator" when SEED_ADMIN_NAME is unset', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@talyer.test';
    process.env.SEED_ADMIN_PASSWORD = 'supersecret';

    await seedAdminUser();

    const created = await User.findOne({ email: 'admin@talyer.test' });
    expect(created.name).toBe('Administrator');
  });

  it('uses SEED_ADMIN_NAME when provided', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@talyer.test';
    process.env.SEED_ADMIN_PASSWORD = 'supersecret';
    process.env.SEED_ADMIN_NAME = 'Root Admin';

    await seedAdminUser();

    const created = await User.findOne({ email: 'admin@talyer.test' });
    expect(created.name).toBe('Root Admin');
  });

  it('hashes the password so it is never stored in plaintext, and it verifies with comparePassword', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@talyer.test';
    process.env.SEED_ADMIN_PASSWORD = 'supersecret';

    await seedAdminUser();

    const created = await User.findOne({ email: 'admin@talyer.test' }).select('+password');
    expect(created.password).not.toBe('supersecret');

    const matches = await created.comparePassword('supersecret');
    expect(matches).toBe(true);

    const mismatches = await created.comparePassword('wrong-password');
    expect(mismatches).toBe(false);
  });

  it('skips when an admin already exists, and leaves the existing admin untouched', async () => {
    const existingAdmin = await User.create({
      name: 'Existing Admin',
      email: 'existing-admin@talyer.test',
      password: 'originalpassword',
      role: USER_ROLES.ADMIN,
      isActive: true,
    });
    const existingAdminWithHash = await User.findById(existingAdmin._id).select('+password');
    const originalHash = existingAdminWithHash.password;

    process.env.SEED_ADMIN_EMAIL = 'new-admin@talyer.test';
    process.env.SEED_ADMIN_PASSWORD = 'brandnewpassword';

    const result = await seedAdminUser();

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('admin-exists');

    // No second admin was created from the env vars.
    const newAdmin = await User.findOne({ email: 'new-admin@talyer.test' });
    expect(newAdmin).toBeNull();

    // The existing admin's password hash is untouched.
    const stillExisting = await User.findById(existingAdmin._id).select('+password');
    expect(stillExisting.password).toBe(originalHash);
  });

  it('skips when SEED_ADMIN_EMAIL is missing', async () => {
    process.env.SEED_ADMIN_PASSWORD = 'supersecret';

    const result = await seedAdminUser();

    expect(result.status).toBe('skipped');
    const count = await User.countDocuments({});
    expect(count).toBe(0);
  });

  it('skips when SEED_ADMIN_PASSWORD is missing', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@talyer.test';

    const result = await seedAdminUser();

    expect(result.status).toBe('skipped');
    const count = await User.countDocuments({});
    expect(count).toBe(0);
  });

  it('skips without throwing when the password is too short', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@talyer.test';
    process.env.SEED_ADMIN_PASSWORD = '123';

    await expect(seedAdminUser()).resolves.toMatchObject({ status: 'skipped' });

    const count = await User.countDocuments({});
    expect(count).toBe(0);
  });

  it('skips without throwing when the email is malformed', async () => {
    process.env.SEED_ADMIN_EMAIL = 'not-an-email';
    process.env.SEED_ADMIN_PASSWORD = 'supersecret';

    await expect(seedAdminUser()).resolves.toMatchObject({ status: 'skipped' });

    const count = await User.countDocuments({});
    expect(count).toBe(0);
  });

  it('is a no-op the second time it runs after a successful seed (idempotent across restarts)', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@talyer.test';
    process.env.SEED_ADMIN_PASSWORD = 'supersecret';

    const first = await seedAdminUser();
    expect(first.status).toBe('created');

    const second = await seedAdminUser();
    expect(second.status).toBe('skipped');
    expect(second.reason).toBe('admin-exists');

    const count = await User.countDocuments({ role: USER_ROLES.ADMIN });
    expect(count).toBe(1);
  });

  it('treats a duplicate-key error on create as another instance winning the race, without throwing', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@talyer.test';
    process.env.SEED_ADMIN_PASSWORD = 'supersecret';

    // Simulate two replicas both passing the "no admin exists" check, then
    // racing to insert — the second insert hits User's unique email index.
    // The handler re-queries for an admin after catching the duplicate-key
    // error (to tell a real race apart from SEED_ADMIN_EMAIL colliding with
    // a non-admin account), so the second findOne call must reflect the
    // race winner's now-committed admin document.
    const findOneSpy = jest
      .spyOn(User, 'findOne')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'race-winner-id', role: USER_ROLES.ADMIN });
    const createSpy = jest.spyOn(User, 'create').mockImplementationOnce(() => {
      const duplicateKeyError = new Error('E11000 duplicate key error collection: test.users index: email_1');
      duplicateKeyError.code = 11000;
      return Promise.reject(duplicateKeyError);
    });

    await expect(seedAdminUser()).resolves.toMatchObject({
      status: 'skipped',
      reason: 'admin-exists',
    });

    findOneSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('returns "email-taken", not "admin-exists", when SEED_ADMIN_EMAIL already belongs to a non-admin account', async () => {
    // Reproduces the reviewer-reported bug: User.email is unique across every
    // role, so a customer sitting on the seed address collides on create()
    // exactly like a racing admin replica would -- but no admin exists at
    // all, so reporting "admin-exists" here would be false and would point
    // the operator at the wrong conclusion.
    await User.init(); // ensure the unique email index is actually built

    await User.create({
      name: 'Existing Customer',
      email: 'admin@shop.test',
      password: 'customer-password',
      role: USER_ROLES.CUSTOMER,
    });

    process.env.SEED_ADMIN_EMAIL = 'admin@shop.test';
    process.env.SEED_ADMIN_PASSWORD = 'supersecret';

    const result = await seedAdminUser();

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('email-taken');

    const adminCount = await User.countDocuments({ role: USER_ROLES.ADMIN });
    expect(adminCount).toBe(0);
  });

  it('enforces the create race against a real unique index, not a mock (regression guard for a not-yet-built index)', async () => {
    // The mocked race test above only proves the *handler* maps a code-11000
    // error to the right reason -- it cannot catch the failure mode where the
    // unique index itself doesn't exist yet on a brand-new database, which
    // would let two "admin" creates with the same email both silently
    // succeed. Explicitly wait for index creation, then let a real insert
    // collide with a real unique-index violation.
    await User.init();

    await User.create({
      name: 'Existing Customer',
      email: 'admin@shop.test',
      password: 'customer-password',
      role: USER_ROLES.CUSTOMER,
    });

    process.env.SEED_ADMIN_EMAIL = 'admin@shop.test';
    process.env.SEED_ADMIN_PASSWORD = 'supersecret';

    await expect(seedAdminUser()).resolves.toMatchObject({ status: 'skipped' });

    const adminCount = await User.countDocuments({ role: USER_ROLES.ADMIN });
    expect(adminCount).toBe(0);

    // Nothing extra was created either -- still exactly the one seeded user.
    const totalUsers = await User.countDocuments({});
    expect(totalUsers).toBe(1);
  });
});
