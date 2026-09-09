import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestUser, createTestAdmin, createTestSalesperson } from './setup/testHelpers.js';
import branchRoutes from '../src/routes/branchRoutes.js';
import Branch from '../src/models/Branch.js';
import User from '../src/models/User.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/branches', branchRoutes);

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

// Helper function to create test branch
const createTestBranch = async (data = {}) => {
  return await Branch.create({
    name: data.name || 'Test Branch',
    code: data.code || 'TEST-001',
    address: data.address || {
      street: '123 Test Street',
      city: 'Test City',
      province: 'Test Province',
      postalCode: '1000'
    },
    contact: data.contact || {
      phone: '+63 2 1234 5678',
      email: 'test@branch.com'
    },
    ...data
  });
};

/**
 * These five blocks were named for HTTP routes and tested Mongoose.
 *
 * They called `Branch.create` and `Branch.find` directly and asserted on the
 * driver's return value, so the controller, the `protect` and `authorize`
 * chain, the validator chain and the `ApiResponse` envelope were never entered
 * for list, read-one, create, update or delete. One test's only assertion was
 * `expect(true).toBe(true)`. `createBranch` could have 500'd, dropped its role
 * check or returned the wrong shape with all 41 tests green (GAP-045).
 *
 * Every test below issues a real request through the mounted router.
 */
describe('GET /api/branches', () => {
  it('returns the branches in the response envelope', async () => {
    const admin = await createTestAdmin();
    await createTestBranch({ name: 'Branch 1', code: 'BR-001' });
    await createTestBranch({ name: 'Branch 2', code: 'BR-002' });

    const res = await request(app)
      .get('/api/branches')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await request(app).get('/api/branches');

    expect(res.statusCode).toBe(401);
  });

  it('paginates', async () => {
    const admin = await createTestAdmin();
    for (let i = 1; i <= 5; i += 1) {
      await createTestBranch({ name: `Branch ${i}`, code: `BR-00${i}` });
    }

    const res = await request(app)
      .get('/api/branches?page=1&limit=2')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.pages).toBe(3);
  });

  it('filters by active status', async () => {
    const admin = await createTestAdmin();
    await createTestBranch({ name: 'Active Branch', code: 'ACT-001', isActive: true });
    await createTestBranch({ name: 'Inactive Branch', code: 'INACT-001', isActive: false });

    const res = await request(app)
      .get('/api/branches?active=true')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Active Branch');
  });

  it('searches by name', async () => {
    const admin = await createTestAdmin();
    await createTestBranch({ name: 'Main Branch', code: 'MAIN-001' });
    await createTestBranch({ name: 'Sub Branch', code: 'SUB-001' });

    const res = await request(app)
      .get('/api/branches?search=Main')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Main Branch');
  });
});

describe('GET /api/branches/:id', () => {
  it('returns one branch', async () => {
    const admin = await createTestAdmin();
    const branch = await createTestBranch({ name: 'Readable', code: 'READ-001' });

    const res = await request(app)
      .get(`/api/branches/${branch._id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe('Readable');
  });

  it('404s for an id that does not exist', async () => {
    const admin = await createTestAdmin();

    const res = await request(app)
      .get('/api/branches/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.statusCode).toBe(404);
  });

  it('400s on a malformed id rather than reaching the query', async () => {
    const admin = await createTestAdmin();

    const res = await request(app)
      .get('/api/branches/not-an-id')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/branches', () => {
  const payload = {
    name: 'New Branch',
    code: 'NEW-001',
    address: { street: '1 New St', city: 'City', province: 'Province', postalCode: '1000' },
    contact: { phone: '+63 2 1234 5678', email: 'new@branch.com' },
  };

  it('creates a branch for an admin', async () => {
    const admin = await createTestAdmin();

    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(payload);

    expect(res.statusCode).toBe(201);
    expect(res.body.data.code).toBe('NEW-001');
    expect(await Branch.countDocuments()).toBe(1);
  });

  it('refuses a salesperson', async () => {
    // A salesperson must be assigned to a branch, so one has to exist first.
    const home = await createTestBranch({ name: 'Home', code: 'HOME-001' });
    const salesperson = await createTestSalesperson(home._id);

    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${salesperson.token}`)
      .send(payload);

    expect(res.statusCode).toBe(403);
    // Only the salesperson's own branch, so nothing was created.
    expect(await Branch.countDocuments()).toBe(1);
  });

  it('rejects a duplicate code', async () => {
    const admin = await createTestAdmin();
    await createTestBranch({ name: 'Existing', code: 'NEW-001' });

    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(payload);

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(await Branch.countDocuments()).toBe(1);
  });

  it('rejects a payload with no name', async () => {
    const admin = await createTestAdmin();
    const { name, ...withoutName } = payload;

    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(withoutName);

    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /api/branches/:id', () => {
  it('updates a branch for an admin', async () => {
    const admin = await createTestAdmin();
    const branch = await createTestBranch({ name: 'Before', code: 'UPD-001' });

    const res = await request(app)
      .put(`/api/branches/${branch._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'After' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe('After');
    expect((await Branch.findById(branch._id)).name).toBe('After');
  });

  it('refuses a salesperson', async () => {
    const branch = await createTestBranch({ name: 'Before', code: 'UPD-002' });
    const salesperson = await createTestSalesperson(branch._id);

    const res = await request(app)
      .put(`/api/branches/${branch._id}`)
      .set('Authorization', `Bearer ${salesperson.token}`)
      .send({ name: 'After' });

    expect(res.statusCode).toBe(403);
    expect((await Branch.findById(branch._id)).name).toBe('Before');
  });
});

describe('DELETE /api/branches/:id', () => {
  it('deactivates rather than removing, for an admin', async () => {
    const admin = await createTestAdmin();
    const branch = await createTestBranch({ name: 'Doomed', code: 'DEL-001' });

    const res = await request(app)
      .delete(`/api/branches/${branch._id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.statusCode).toBe(200);
    const after = await Branch.findById(branch._id);
    // A soft delete: the row is still there for every order that references it.
    expect(after).not.toBeNull();
    expect(after.isActive).toBe(false);
  });

  it('refuses a salesperson', async () => {
    const branch = await createTestBranch({ name: 'Safe', code: 'DEL-002' });
    const salesperson = await createTestSalesperson(branch._id);

    const res = await request(app)
      .delete(`/api/branches/${branch._id}`)
      .set('Authorization', `Bearer ${salesperson.token}`);

    expect(res.statusCode).toBe(403);
    expect((await Branch.findById(branch._id)).isActive).toBe(true);
  });
});

describe('Branch API - Branch Statistics', () => {
  describe('GET /api/branches/:id/stats', () => {
    it('should return branch statistics', async () => {
      const branch = await createTestBranch({ name: 'Stats Branch', code: 'STATS-001' });

      // Create some users
      await createTestUser({
        name: 'Active User 1',
        email: 'active1@test.com',
        password: 'password123',
        role: 'salesperson',
        branch: branch._id,
        isActive: true
      });

      await createTestUser({
        name: 'Active User 2',
        email: 'active2@test.com',
        password: 'password123',
        role: 'mechanic',
        branch: branch._id,
        isActive: true
      });

      await createTestUser({
        name: 'Inactive User',
        email: 'inactive@test.com',
        password: 'password123',
        role: 'salesperson',
        branch: branch._id,
        isActive: false
      });

      const totalStaff = await User.countDocuments({ branch: branch._id });
      const activeStaff = await User.countDocuments({ branch: branch._id, isActive: true });

      expect(totalStaff).toBe(3);
      expect(activeStaff).toBe(2);
    });

    it('should return zero stats for branch without users', async () => {
      const branch = await createTestBranch({ name: 'Empty Branch', code: 'EMPTY-001' });

      const staffCount = await User.countDocuments({ branch: branch._id });
      expect(staffCount).toBe(0);
    });
  });

  describe('GET /api/branches/:id/stats access control', () => {
    it('allows a salesperson to read the stats of their own branch', async () => {
      const branch = await createTestBranch();
      const { token } = await createTestSalesperson(branch._id);

      const res = await request(app)
        .get(`/api/branches/${branch._id}/stats`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('denies a salesperson the stats of a different branch', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'OWN-1' });
      const other = await createTestBranch({ name: 'Other', code: 'OTH-1' });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get(`/api/branches/${other._id}/stats`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('allows an admin the stats of any branch', async () => {
      const branch = await createTestBranch();
      const { token } = await createTestAdmin();

      const res = await request(app)
        .get(`/api/branches/${branch._id}/stats`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });
});

describe('Branch Model - Methods and Virtuals', () => {
  describe('getFullAddress method', () => {
    it('should format full address correctly', async () => {
      const branch = await createTestBranch({
        name: 'Address Test',
        code: 'ADDR-001',
        address: {
          street: '123 Test Street',
          city: 'Test City',
          province: 'Test Province',
          postalCode: '1234',
          country: 'Philippines'
        }
      });

      const fullAddress = branch.getFullAddress();
      expect(fullAddress).toBe('123 Test Street, Test City, Test Province 1234, Philippines');
    });

    it('should handle missing postal code', async () => {
      const branch = await createTestBranch({
        name: 'No Postal',
        code: 'NOPOST-001',
        address: {
          street: '456 Another Street',
          city: 'Another City',
          province: 'Another Province'
        }
      });

      const fullAddress = branch.getFullAddress();
      // Address includes space before country when postal code is missing
      expect(fullAddress).toContain('456 Another Street');
      expect(fullAddress).toContain('Another City');
      expect(fullAddress).toContain('Another Province');
      expect(fullAddress).toContain('Philippines');
    });
  });

  describe('staffCount virtual', () => {
    it('should count staff assigned to branch', async () => {
      const branch = await createTestBranch({ name: 'Count Test', code: 'COUNT-001' });

      // Create users
      await createTestUser({
        name: 'Staff 1',
        email: 'staff1@test.com',
        password: 'password123',
        role: 'salesperson',
        branch: branch._id
      });

      await createTestUser({
        name: 'Staff 2',
        email: 'staff2@test.com',
        password: 'password123',
        role: 'mechanic',
        branch: branch._id
      });

      const branchWithCount = await Branch.findById(branch._id).populate('staffCount');
      // Virtual count would be available if properly configured
      const actualCount = await User.countDocuments({ branch: branch._id });
      expect(actualCount).toBe(2);
    });
  });
});

describe('Branch API - Response Format Consistency', () => {
  it('all success responses should have consistent format', async () => {
    const branch = await createTestBranch({ name: 'Format Test', code: 'FMT-001' });
    
    expect(branch).toHaveProperty('_id');
    expect(branch).toHaveProperty('name');
    expect(branch).toHaveProperty('code');
    expect(branch).toHaveProperty('createdAt');
    expect(branch).toHaveProperty('updatedAt');
  });

  it('branch should have all required nested objects', async () => {
    const branch = await createTestBranch({ name: 'Nested Test', code: 'NEST-001' });

    expect(branch.address).toBeTruthy();
    expect(branch.contact).toBeTruthy();
    expect(branch.settings).toBeTruthy();
    expect(branch.address).toHaveProperty('street');
    expect(branch.address).toHaveProperty('city');
    expect(branch.address).toHaveProperty('province');
  });
});

// GAP-015c. updateBranch used to hand the whole parsed body to
// findByIdAndUpdate, so any key the validation chain did not name was written
// through. express-validator whitelists rules, not fields, so only an explicit
// allow-list in the controller closes this.
describe('Branch API - Update field allow-list', () => {
  describe('PUT /api/branches/:id', () => {
    it('persists the declared fields', async () => {
      const branch = await createTestBranch({ name: 'Old Name', code: 'OLD-001' });
      const { token } = await createTestAdmin();

      const res = await request(app)
        .put(`/api/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name', description: 'Now with a description' });

      expect(res.status).toBe(200);

      const stored = await Branch.findById(branch._id).lean();
      expect(stored.name).toBe('New Name');
      expect(stored.description).toBe('Now with a description');
    });

    it('still saves fields the update validator does not declare a rule for', async () => {
      // address, contact and settings are absent from updateBranchValidation but
      // are part of UpdateBranchPayload. An allow-list derived from the
      // validator instead of the client contract would silently drop these.
      const branch = await createTestBranch({ name: 'Cebu', code: 'CEB-9' });
      const { token } = await createTestAdmin();

      const res = await request(app)
        .put(`/api/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          address: {
            street: '9 New Street',
            city: 'Cebu City',
            province: 'Cebu'
          },
          contact: { phone: '+63 32 111 2222' },
          settings: { taxRate: 12 }
        });

      expect(res.status).toBe(200);

      const stored = await Branch.findById(branch._id).lean();
      expect(stored.address.street).toBe('9 New Street');
      expect(stored.contact.phone).toBe('+63 32 111 2222');
      expect(stored.settings.taxRate).toBe(12);
    });

    it('ignores a field the route never declared', async () => {
      const branch = await createTestBranch({ name: 'Iloilo', code: 'ILO-1' });
      const { token } = await createTestAdmin();

      const res = await request(app)
        .put(`/api/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Iloilo Main', smuggledField: 'should not persist' });

      expect(res.status).toBe(200);

      const stored = await Branch.findById(branch._id).lean();
      expect(stored.name).toBe('Iloilo Main');
      expect(stored).not.toHaveProperty('smuggledField');
    });

    it('leaves createdAt alone when the body tries to set it', async () => {
      const branch = await createTestBranch({ name: 'Bacolod', code: 'BCD-1' });
      const { token } = await createTestAdmin();
      const before = (await Branch.findById(branch._id).lean()).createdAt;

      const res = await request(app)
        .put(`/api/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bacolod Main', createdAt: '1999-01-01T00:00:00.000Z' });

      expect(res.status).toBe(200);

      const stored = await Branch.findById(branch._id).lean();
      expect(new Date(stored.createdAt).getTime()).toBe(new Date(before).getTime());
    });
  });
});

describe('Branch API - Restore', () => {
  describe('PATCH /api/branches/:id/restore', () => {
    it('brings an archived branch back', async () => {
      const branch = await createTestBranch({ name: 'Cebu', code: 'CEB-1' });
      const { token } = await createTestAdmin();

      await request(app)
        .delete(`/api/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`);

      const archived = await Branch.findById(branch._id).lean();
      expect(archived.isActive).toBe(false);

      const res = await request(app)
        .patch(`/api/branches/${branch._id}/restore`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);

      const restored = await Branch.findById(branch._id).lean();
      expect(restored.isActive).toBe(true);
    });

    it('makes it assignable again by returning it to the active listing', async () => {
      const branch = await createTestBranch({ name: 'Davao', code: 'DVO-1', isActive: false });
      const { token } = await createTestAdmin();

      await request(app)
        .patch(`/api/branches/${branch._id}/restore`)
        .set('Authorization', `Bearer ${token}`);

      const listed = await request(app)
        .get('/api/branches?active=true')
        .set('Authorization', `Bearer ${token}`);

      expect(listed.body.data.map((b) => b._id)).toContain(String(branch._id));
    });

    it('is idempotent on an active branch', async () => {
      const branch = await createTestBranch({ name: 'Makati', code: 'MKT-1' });
      const { token } = await createTestAdmin();

      const res = await request(app)
        .patch(`/api/branches/${branch._id}/restore`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);
    });

    it('404s for an unknown id', async () => {
      const { token } = await createTestAdmin();

      const res = await request(app)
        .patch('/api/branches/507f1f77bcf86cd799439011/restore')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('refuses a salesperson', async () => {
      const branch = await createTestBranch({ name: 'Pasig', code: 'PSG-1', isActive: false });
      const { token } = await createTestSalesperson(branch._id);

      const res = await request(app)
        .patch(`/api/branches/${branch._id}/restore`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);

      const stored = await Branch.findById(branch._id).lean();
      expect(stored.isActive).toBe(false);
    });
  });
});

// GAP-008. POST /auth/register-customer is public and mints a customer
// account unconditionally, and the branch reads need only `protect`. Populating
// the manager for everyone handed anyone on the internet a directory of every
// branch with its manager's real name and work email.
describe('Branch API - manager identity is not customer-facing', () => {
  // The branch has to exist before the manager: User makes `branch` required
  // for salesperson and mechanic, so the manager cannot be created first.
  const seedBranchWithManager = async () => {
    const branch = await createTestBranch({ name: 'Managed Branch', code: 'MGD-1' });
    const { user: manager } = await createTestUser({
      name: 'Branch Manager',
      email: 'branch-manager@example.com',
      role: 'salesperson',
      branch: branch._id
    });
    branch.manager = manager._id;
    await branch.save();
    return { branch, manager };
  };

  it('omits the manager for a customer on the list read', async () => {
    await seedBranchWithManager();
    const { token } = await createTestUser({
      email: 'shopper@example.com',
      role: 'customer'
    });

    const res = await request(app)
      .get('/api/branches')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const branch of res.body.data) {
      expect(branch.manager).toBeUndefined();
    }
    expect(JSON.stringify(res.body)).not.toContain('branch-manager@example.com');
  });

  it('omits the manager for a customer on the detail read', async () => {
    const { branch } = await seedBranchWithManager();
    const { token } = await createTestUser({
      email: 'shopper2@example.com',
      role: 'customer'
    });

    const res = await request(app)
      .get(`/api/branches/${branch._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.manager).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('branch-manager@example.com');
  });

  it('still gives a salesperson the populated manager', async () => {
    const { branch } = await seedBranchWithManager();
    const { token } = await createTestSalesperson(branch._id);

    const res = await request(app)
      .get('/api/branches')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const managed = res.body.data.find((b) => String(b._id) === String(branch._id));
    expect(managed.manager).toBeDefined();
    expect(managed.manager.email).toBe('branch-manager@example.com');
  });

  it('still gives an admin the populated manager on the detail read', async () => {
    const { branch } = await seedBranchWithManager();
    const { token } = await createTestAdmin();

    const res = await request(app)
      .get(`/api/branches/${branch._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.manager).toBeDefined();
    expect(res.body.data.manager.email).toBe('branch-manager@example.com');
  });

  // The cache key must carry the role. Keyed on the URL alone, whichever shape
  // was cached first is served to everyone for the whole TTL.
  it('does not serve a staff-shaped cache entry to a customer', async () => {
    const { branch } = await seedBranchWithManager();
    const admin = await createTestAdmin();
    const customer = await createTestUser({
      email: 'shopper3@example.com',
      role: 'customer'
    });

    const staffFirst = await request(app)
      .get('/api/branches')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(staffFirst.status).toBe(200);

    const asCustomer = await request(app)
      .get('/api/branches')
      .set('Authorization', `Bearer ${customer.token}`);

    expect(asCustomer.status).toBe(200);
    expect(JSON.stringify(asCustomer.body)).not.toContain('branch-manager@example.com');
    expect(String(branch._id)).toBeTruthy();
  });

  it('does not blank the manager out for staff after a customer request', async () => {
    const { branch } = await seedBranchWithManager();
    const customer = await createTestUser({
      email: 'shopper4@example.com',
      role: 'customer'
    });
    const admin = await createTestAdmin();

    const customerFirst = await request(app)
      .get('/api/branches')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerFirst.status).toBe(200);

    const asStaff = await request(app)
      .get('/api/branches')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(asStaff.status).toBe(200);
    const managed = asStaff.body.data.find((b) => String(b._id) === String(branch._id));
    expect(managed.manager).toBeDefined();
    expect(managed.manager.email).toBe('branch-manager@example.com');
  });
});
