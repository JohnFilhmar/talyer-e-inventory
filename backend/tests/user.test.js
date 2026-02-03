import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/server.js';
import User from '../src/models/User.js';
import Branch from '../src/models/Branch.js';

describe('User Management API', () => {
  let adminToken;
  let adminUser;
  let testBranch;
  let salespersonToken;
  let salespersonUser;

  beforeAll(async () => {
    // Create test branch with all required fields
    testBranch = await Branch.create({
      name: 'Test Branch',
      code: 'TB001',
      address: {
        street: '123 Test St',
        city: 'Test City',
        province: 'Test Province',
        postalCode: '12345',
      },
      contact: {
        phone: '555-0100',
        email: 'testbranch@test.com',
      },
      isActive: true,
    });

    // Create admin user
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'admin123',
      role: 'admin',
      isActive: true,
    });

    // Create salesperson user
    salespersonUser = await User.create({
      name: 'Sales Person',
      email: 'sales@test.com',
      password: 'sales123',
      role: 'salesperson',
      branch: testBranch._id,
      isActive: true,
    });

    // Get admin token
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'admin123' });
    adminToken = adminLogin.body.data.accessToken;

    // Get salesperson token
    const salesLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sales@test.com', password: 'sales123' });
    salespersonToken = salesLogin.body.data.accessToken;
  });

  afterAll(async () => {
    // Cleanup test data
    await User.deleteMany({
      email: {
        $in: [
          'admin@test.com',
          'sales@test.com',
          'newuser@test.com',
          'mechanic@test.com',
          'updatetest@test.com',
          'toggletest@test.com',
          'passwordtest@test.com',
          'deactivated@test.com',
          'newadmin@test.com',
          'nobranch@test.com',
        ],
      },
    });
    await Branch.findByIdAndDelete(testBranch._id);
    await mongoose.connection.close();
  });

  // ==========================================
  // GET /api/users - List Users
  // ==========================================
  describe('GET /api/users', () => {
    it('should return paginated users for admin', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBeDefined();
      expect(res.body.pagination.total).toBeDefined();
      expect(res.body.pagination.pages).toBeDefined();
    });

    it('should filter users by role', async () => {
      const res = await request(app)
        .get('/api/users?role=salesperson')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((user) => {
        expect(user.role).toBe('salesperson');
      });
    });

    it('should search users by name', async () => {
      const res = await request(app)
        .get('/api/users?search=Admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.some((u) => u.name.includes('Admin'))).toBe(true);
    });

    it('should search users by email', async () => {
      const res = await request(app)
        .get('/api/users?search=sales@test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should filter users by active status', async () => {
      const res = await request(app)
        .get('/api/users?isActive=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((user) => {
        expect(user.isActive).toBe(true);
      });
    });

    it('should filter users by branch', async () => {
      const res = await request(app)
        .get(`/api/users?branch=${testBranch._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((user) => {
        expect(user.branch._id).toBe(testBranch._id.toString());
      });
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get('/api/users?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
      expect(res.body.pagination.limit).toBe(1);
    });

    it('should sort users by name ascending', async () => {
      const res = await request(app)
        .get('/api/users?sortBy=name&sortOrder=asc')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const names = res.body.data.map((u) => u.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    it('should reject non-admin access', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${salespersonToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app).get('/api/users');

      expect(res.status).toBe(401);
    });

    it('should reject invalid role filter', async () => {
      const res = await request(app)
        .get('/api/users?role=invalidrole')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should reject invalid branch ID filter', async () => {
      const res = await request(app)
        .get('/api/users?branch=invalidid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // GET /api/users/:id - Get Single User
  // ==========================================
  describe('GET /api/users/:id', () => {
    it('should return user with populated branch', async () => {
      const res = await request(app)
        .get(`/api/users/${salespersonUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(salespersonUser._id.toString());
      expect(res.body.data.branch).toBeDefined();
      expect(res.body.data.branch.name).toBe('Test Branch');
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.refreshToken).toBeUndefined();
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should reject invalid user ID format', async () => {
      const res = await request(app)
        .get('/api/users/invalidid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // POST /api/users - Create User
  // ==========================================
  describe('POST /api/users', () => {
    it('should create user with valid data', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New User',
          email: 'newuser@test.com',
          password: 'password123',
          role: 'salesperson',
          branch: testBranch._id,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New User');
      expect(res.body.data.role).toBe('salesperson');
      expect(res.body.data.branch._id).toBe(testBranch._id.toString());
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.password).toBeUndefined();
    });

    it('should reject creation without required fields', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test',
          // missing email and password
        });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate',
          email: 'admin@test.com', // already exists
          password: 'password123',
          role: 'admin',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });

    it('should require branch for salesperson', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'No Branch Sales',
          email: 'nobranch@test.com',
          password: 'password123',
          role: 'salesperson',
          // missing branch
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Branch is required');
    });

    it('should require branch for mechanic', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'No Branch Mechanic',
          email: 'mechanic@test.com',
          password: 'password123',
          role: 'mechanic',
          // missing branch
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Branch is required');
    });

    it('should create admin without branch', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Admin',
          email: 'newadmin@test.com',
          password: 'password123',
          role: 'admin',
          // no branch needed for admin
        });

      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('admin');

      // Cleanup
      await User.findByIdAndDelete(res.body.data._id);
    });

    it('should reject invalid branch ID', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Bad Branch',
          email: 'badbranch@test.com',
          password: 'password123',
          role: 'salesperson',
          branch: fakeId,
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Branch not found');
    });

    it('should reject invalid role', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Bad Role',
          email: 'badrole@test.com',
          password: 'password123',
          role: 'customer', // not allowed via admin panel
        });

      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Short Pass',
          email: 'shortpass@test.com',
          password: '123', // too short
          role: 'admin',
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Bad Email',
          email: 'notanemail',
          password: 'password123',
          role: 'admin',
        });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // PUT /api/users/:id - Update User
  // ==========================================
  describe('PUT /api/users/:id', () => {
    let updateTestUser;

    beforeAll(async () => {
      updateTestUser = await User.create({
        name: 'Update Test',
        email: 'updatetest@test.com',
        password: 'password123',
        role: 'salesperson',
        branch: testBranch._id,
        isActive: true,
      });
    });

    afterAll(async () => {
      await User.findByIdAndDelete(updateTestUser._id);
    });

    it('should update user name', async () => {
      const res = await request(app)
        .put(`/api/users/${updateTestUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Name');
    });

    it('should update user email', async () => {
      const res = await request(app)
        .put(`/api/users/${updateTestUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'updated@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('updated@test.com');

      // Restore original email
      await User.findByIdAndUpdate(updateTestUser._id, { email: 'updatetest@test.com' });
    });

    it('should update user role with branch', async () => {
      const res = await request(app)
        .put(`/api/users/${updateTestUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'mechanic', branch: testBranch._id });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('mechanic');

      // Restore original role
      await User.findByIdAndUpdate(updateTestUser._id, { role: 'salesperson' });
    });

    it('should prevent admin from changing own role', async () => {
      const res = await request(app)
        .put(`/api/users/${adminUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'salesperson' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot change your own role');
    });

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .put(`/api/users/${updateTestUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'admin@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Email already in use');
    });

    it('should require branch when changing to salesperson role', async () => {
      // First change to admin (no branch needed) - use $unset to properly remove branch
      await User.findByIdAndUpdate(updateTestUser._id, { 
        role: 'admin', 
        $unset: { branch: 1 } 
      });

      const res = await request(app)
        .put(`/api/users/${updateTestUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'salesperson' }); // no branch provided

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Branch is required');

      // Restore
      await User.findByIdAndUpdate(updateTestUser._id, { role: 'salesperson', branch: testBranch._id });
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test' });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // PATCH /api/users/:id/deactivate - Deactivate User
  // ==========================================
  describe('PATCH /api/users/:id/deactivate', () => {
    let deactivateTestUser;

    beforeAll(async () => {
      deactivateTestUser = await User.create({
        name: 'Deactivate Test',
        email: 'toggletest@test.com',
        password: 'password123',
        role: 'mechanic',
        branch: testBranch._id,
        isActive: true,
      });
    });

    afterAll(async () => {
      await User.findByIdAndDelete(deactivateTestUser._id);
    });

    it('should deactivate an active user', async () => {
      const res = await request(app)
        .patch(`/api/users/${deactivateTestUser._id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
      expect(res.body.message).toContain('deactivated');

      // Verify refresh token is cleared
      const updatedUser = await User.findById(deactivateTestUser._id);
      expect(updatedUser.refreshToken).toBeUndefined();
    });

    it('should reject deactivating already deactivated user', async () => {
      const res = await request(app)
        .patch(`/api/users/${deactivateTestUser._id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already deactivated');
    });

    it('should prevent admin from deactivating self', async () => {
      const res = await request(app)
        .patch(`/api/users/${adminUser._id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot deactivate your own account');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/users/${fakeId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // PATCH /api/users/:id/activate - Activate User
  // ==========================================
  describe('PATCH /api/users/:id/activate', () => {
    let activateTestUser;

    beforeAll(async () => {
      activateTestUser = await User.create({
        name: 'Activate Test',
        email: 'activatetest@test.com',
        password: 'password123',
        role: 'mechanic',
        branch: testBranch._id,
        isActive: false, // Start deactivated
      });
    });

    afterAll(async () => {
      await User.findByIdAndDelete(activateTestUser._id);
    });

    it('should activate an inactive user', async () => {
      const res = await request(app)
        .patch(`/api/users/${activateTestUser._id}/activate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.message).toContain('activated');
    });

    it('should reject activating already active user', async () => {
      const res = await request(app)
        .patch(`/api/users/${activateTestUser._id}/activate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already active');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/users/${fakeId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // PATCH /api/users/:id/password - Change Password
  // ==========================================
  describe('PATCH /api/users/:id/password', () => {
    let passwordTestUser;

    beforeAll(async () => {
      passwordTestUser = await User.create({
        name: 'Password Test',
        email: 'passwordtest@test.com',
        password: 'oldpassword123',
        role: 'salesperson',
        branch: testBranch._id,
        isActive: true,
        refreshToken: 'some-refresh-token',
      });
    });

    afterAll(async () => {
      await User.findByIdAndDelete(passwordTestUser._id);
    });

    it('should change user password', async () => {
      const res = await request(app)
        .patch(`/api/users/${passwordTestUser._id}/password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'newpassword123' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Password changed');

      // Verify refresh token is cleared
      const updatedUser = await User.findById(passwordTestUser._id);
      expect(updatedUser.refreshToken).toBeUndefined();
    });

    it('should allow login with new password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'passwordtest@test.com',
          password: 'newpassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .patch(`/api/users/${passwordTestUser._id}/password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: '123' });

      expect(res.status).toBe(400);
    });

    it('should reject missing password', async () => {
      const res = await request(app)
        .patch(`/api/users/${passwordTestUser._id}/password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/users/${fakeId}/password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'newpassword123' });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // Deactivated User Access Denial
  // ==========================================
  describe('Deactivated User Access', () => {
    let deactivatedUser;
    let deactivatedToken;

    beforeAll(async () => {
      deactivatedUser = await User.create({
        name: 'Deactivated User',
        email: 'deactivated@test.com',
        password: 'password123',
        role: 'salesperson',
        branch: testBranch._id,
        isActive: true,
      });

      // Get token while active
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'deactivated@test.com', password: 'password123' });
      deactivatedToken = loginRes.body.data.accessToken;

      // Deactivate the user
      await User.findByIdAndUpdate(deactivatedUser._id, {
        isActive: false,
        refreshToken: undefined,
      });
    });

    afterAll(async () => {
      await User.findByIdAndDelete(deactivatedUser._id);
    });

    it('should deny access with token after deactivation', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${deactivatedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('deactivated');
    });

    it('should deny login for deactivated user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'deactivated@test.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('deactivated');
    });
  });
});
