const request = require('supertest');
const express = require('express');
const dbHandler = require('./setup/dbHandler');
const { createTestUser, createTestAdmin, createTestMechanic } = require('./setup/testHelpers');
const supplierRoutes = require('../src/routes/supplierRoutes');
const Supplier = require('../src/models/Supplier');
const Branch = require('../src/models/Branch');

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/suppliers', supplierRoutes);

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

// Helper function to create test supplier
const createTestSupplier = async (data = {}) => {
  return await Supplier.create({
    name: data.name || 'Test Supplier',
    contact: {
      personName: 'John Doe',
      phone: '123-456-7890',
      email: 'test@supplier.com'
    },
    address: {
      city: 'Manila',
      country: 'Philippines'
    },
    ...data
  });
};

describe('Supplier API Tests', () => {
  let adminToken;
  let userToken;
  let adminUser;
  let regularUser;
  let testBranch;

  beforeEach(async () => {
    // Create a test branch for non-admin users
    testBranch = await Branch.create({
      name: 'Test Branch',
      code: 'TEST-BRANCH',
      address: {
        street: '123 Test St',
        city: 'Test City',
        province: 'Test Province',
        postalCode: '12345',
        country: 'Philippines'
      },
      contact: {
        phone: '123-456-7890',
        email: 'test@branch.com'
      }
    });

    // Create test users
    const admin = await createTestAdmin();
    const user = await createTestMechanic(testBranch._id); // Pass branch ID during creation
    
    adminToken = admin.token;
    userToken = user.token;
    adminUser = admin.user;
    regularUser = user.user;
  });

  // ===================
  // CREATE SUPPLIER TESTS
  // ===================
  describe('POST /api/suppliers - Create Supplier', () => {
    it('should create new supplier with auto-generated code', async () => {
      const supplierData = {
        name: 'ABC Supplies Co.',
        contact: {
          personName: 'John Doe',
          phone: '123-456-7890',
          email: 'john@abcsupplies.com',
          website: 'https://abcsupplies.com'
        },
        address: {
          street: '123 Main St',
          city: 'Manila',
          province: 'Metro Manila',
          postalCode: '1000',
          country: 'Philippines'
        },
        paymentTerms: 'Net 30',
        creditLimit: 100000,
        notes: 'Primary supplier for electronics'
      };

      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(supplierData);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.name).toBe('ABC Supplies Co.');
      expect(res.body.data).toHaveProperty('code');
      expect(res.body.data.code).toBe('ABC-SUPPLIES-CO');
      expect(res.body.data.contact.email).toBe('john@abcsupplies.com');
      expect(res.body.data.paymentTerms).toBe('Net 30');
      expect(res.body.data.isActive).toBe(true);
    });

    it('should create supplier with custom code', async () => {
      const supplierData = {
        name: 'XYZ Corporation',
        code: 'XYZ-CORP',
        contact: {
          personName: 'Jane Smith',
          email: 'jane@xyz.com'
        },
        address: {
          city: 'Cebu',
          country: 'Philippines'
        }
      };

      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(supplierData);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.code).toBe('XYZ-CORP');
    });

    it('should create supplier with minimal data', async () => {
      const supplierData = {
        name: 'Simple Supplier'
      };

      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(supplierData);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.name).toBe('Simple Supplier');
      expect(res.body.data).toHaveProperty('code');
      expect(res.body.data.paymentTerms).toBe('Net 30'); // Default
      expect(res.body.data.creditLimit).toBe(0); // Default
    });

    it('should require admin role', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Test Supplier' });

      expect(res.statusCode).toBe(403);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .send({ name: 'Test Supplier' });

      expect(res.statusCode).toBe(401);
    });

    it('should validate name is required', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contact: { email: 'test@test.com' }
        });

      expect(res.statusCode).toBe(400);
    });

    it('should validate name max length', async () => {
      const longName = 'A'.repeat(201);
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: longName });

      expect(res.statusCode).toBe(400);
    });

    it('should validate email format', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Supplier',
          contact: { email: 'invalid-email' }
        });

      expect(res.statusCode).toBe(400);
    });

    it('should validate payment terms', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Supplier',
          paymentTerms: 'Invalid Terms'
        });

      expect(res.statusCode).toBe(400);
    });

    it('should prevent duplicate supplier code', async () => {
      // Create first supplier
      await createTestSupplier({ name: 'Supplier One', code: 'SUP-001' });

      // Try to create second with same code
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Supplier Two',
          code: 'SUP-001'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('already exists');
    });
  });

  // ===================
  // GET SUPPLIERS TESTS
  // ===================
  describe('GET /api/suppliers - Get All Suppliers', () => {
    beforeEach(async () => {
      // Create test suppliers
      await createTestSupplier({ name: 'Supplier A', isActive: true });
      await createTestSupplier({ name: 'Supplier B', isActive: true });
      await createTestSupplier({ name: 'Inactive Supplier', isActive: false });
    });

    it('should get all suppliers', async () => {
      const res = await request(app)
        .get('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(3);
      expect(res.body.pagination.total).toBe(3);
    });

    it('should filter active suppliers', async () => {
      const res = await request(app)
        .get('/api/suppliers?active=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data.every(s => s.isActive === true)).toBe(true);
    });

    it('should filter inactive suppliers', async () => {
      const res = await request(app)
        .get('/api/suppliers?active=false')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Inactive Supplier');
    });

    it('should search suppliers by name', async () => {
      const res = await request(app)
        .get('/api/suppliers?search=Supplier A')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Supplier A');
    });

    it('should search suppliers by code', async () => {
      await createTestSupplier({ name: 'XYZ Corp', code: 'XYZ-123' });

      const res = await request(app)
        .get('/api/suppliers?search=XYZ')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const found = res.body.data.some(s => s.code === 'XYZ-123');
      expect(found).toBe(true);
    });

    it('should support pagination', async () => {
      // Create more suppliers
      for (let i = 0; i < 15; i++) {
        await createTestSupplier({ name: `Supplier ${i}` });
      }

      const res = await request(app)
        .get('/api/suppliers?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(10);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.total).toBeGreaterThan(10);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/suppliers');
      expect(res.statusCode).toBe(401);
    });
  });

  // ===================
  // GET SINGLE SUPPLIER TESTS
  // ===================
  describe('GET /api/suppliers/:id - Get Single Supplier', () => {
    let supplier;

    beforeEach(async () => {
      supplier = await createTestSupplier({
        name: 'Test Supplier',
        contact: {
          personName: 'John Doe',
          phone: '123-456-7890',
          email: 'john@test.com'
        }
      });
    });

    it('should get supplier by ID', async () => {
      const res = await request(app)
        .get(`/api/suppliers/${supplier._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(supplier._id.toString());
      expect(res.body.data.name).toBe('Test Supplier');
      expect(res.body.data.contact.personName).toBe('John Doe');
    });

    it('should return 404 for non-existent supplier', async () => {
      const res = await request(app)
        .get('/api/suppliers/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should validate MongoDB ID format', async () => {
      const res = await request(app)
        .get('/api/suppliers/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app).get(`/api/suppliers/${supplier._id}`);
      expect(res.statusCode).toBe(401);
    });
  });

  // ===================
  // UPDATE SUPPLIER TESTS
  // ===================
  describe('PUT /api/suppliers/:id - Update Supplier', () => {
    let supplier;

    beforeEach(async () => {
      supplier = await createTestSupplier({
        name: 'Original Supplier',
        paymentTerms: 'Net 30',
        creditLimit: 50000
      });
    });

    it('should update supplier', async () => {
      const updateData = {
        name: 'Updated Supplier',
        paymentTerms: 'Net 60',
        creditLimit: 75000,
        notes: 'Updated notes'
      };

      const res = await request(app)
        .put(`/api/suppliers/${supplier._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Supplier');
      expect(res.body.data.paymentTerms).toBe('Net 60');
      expect(res.body.data.creditLimit).toBe(75000);
      expect(res.body.data.notes).toBe('Updated notes');
    });

    it('should update contact information', async () => {
      const res = await request(app)
        .put(`/api/suppliers/${supplier._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contact: {
            personName: 'Jane Smith',
            email: 'jane@supplier.com',
            phone: '987-654-3210'
          }
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.contact.personName).toBe('Jane Smith');
      expect(res.body.data.contact.email).toBe('jane@supplier.com');
    });

    it('should update address', async () => {
      const res = await request(app)
        .put(`/api/suppliers/${supplier._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          address: {
            street: '456 New St',
            city: 'Davao',
            province: 'Davao del Sur',
            postalCode: '8000'
          }
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.address.city).toBe('Davao');
      expect(res.body.data.address.street).toBe('456 New St');
    });

    it('should require admin role', async () => {
      const res = await request(app)
        .put(`/api/suppliers/${supplier._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Updated Name' });

      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for non-existent supplier', async () => {
      const res = await request(app)
        .put('/api/suppliers/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Name' });

      expect(res.statusCode).toBe(404);
    });

    it('should validate updated data', async () => {
      const res = await request(app)
        .put(`/api/suppliers/${supplier._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contact: { email: 'invalid-email' }
        });

      expect(res.statusCode).toBe(400);
    });
  });

  // ===================
  // DELETE SUPPLIER TESTS
  // ===================
  describe('DELETE /api/suppliers/:id - Delete (Deactivate) Supplier', () => {
    let supplier;

    beforeEach(async () => {
      supplier = await createTestSupplier({
        name: 'Supplier to Delete',
        isActive: true
      });
    });

    it('should soft delete supplier (deactivate)', async () => {
      const res = await request(app)
        .delete(`/api/suppliers/${supplier._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);

      // Verify supplier still exists but is inactive
      const supplierInDB = await Supplier.findById(supplier._id);
      expect(supplierInDB).not.toBeNull();
      expect(supplierInDB.isActive).toBe(false);
    });

    it('should require admin role', async () => {
      const res = await request(app)
        .delete(`/api/suppliers/${supplier._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for non-existent supplier', async () => {
      const res = await request(app)
        .delete('/api/suppliers/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app).delete(`/api/suppliers/${supplier._id}`);
      expect(res.statusCode).toBe(401);
    });
  });

  // ===================
  // SUPPLIER MODEL TESTS
  // ===================
  describe('Supplier Model', () => {
    it('should auto-generate code from name', async () => {
      const supplier = await Supplier.create({
        name: 'ABC Supplies Corporation'
      });

      expect(supplier.code).toBe('ABC-SUPPLIES-CORPORATION');
    });

    it('should handle special characters in code generation', async () => {
      const supplier = await Supplier.create({
        name: 'XYZ & Co. (Philippines)'
      });

      // Should remove special chars and convert to uppercase with hyphens
      expect(supplier.code).toMatch(/^XYZ-/);
    });

    it('should use custom code if provided', async () => {
      const supplier = await Supplier.create({
        name: 'Test Supplier',
        code: 'CUSTOM-CODE'
      });

      expect(supplier.code).toBe('CUSTOM-CODE');
    });

    it('should validate creditLimit is non-negative', async () => {
      await expect(
        Supplier.create({
          name: 'Test Supplier',
          creditLimit: -1000
        })
      ).rejects.toThrow();
    });

    it('should validate payment terms enum', async () => {
      await expect(
        Supplier.create({
          name: 'Test Supplier',
          paymentTerms: 'Invalid Terms'
        })
      ).rejects.toThrow();
    });

    it('should set default values', async () => {
      const supplier = await Supplier.create({
        name: 'Simple Supplier'
      });

      expect(supplier.paymentTerms).toBe('Net 30');
      expect(supplier.creditLimit).toBe(0);
      expect(supplier.isActive).toBe(true);
      expect(supplier.address.country).toBe('Philippines');
    });

    it('should trim and validate string lengths', async () => {
      const supplier = await Supplier.create({
        name: '  Test Supplier  ',
        notes: 'Some notes'
      });

      expect(supplier.name).toBe('Test Supplier');
    });

    it('should validate notes max length', async () => {
      const longNotes = 'A'.repeat(1001);
      await expect(
        Supplier.create({
          name: 'Test Supplier',
          notes: longNotes
        })
      ).rejects.toThrow();
    });
  });
});
