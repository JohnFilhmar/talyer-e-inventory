import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestUser, createTestAdmin } from './setup/testHelpers.js';
import categoryRoutes from '../src/routes/categoryRoutes.js';
import Category from '../src/models/Category.js';
import Product from '../src/models/Product.js';
import Branch from '../src/models/Branch.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/categories', categoryRoutes);

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

// Helper function to create test category
const createTestCategory = async (data = {}) => {
  return await Category.create({
    name: data.name || 'Test Category',
    description: data.description || 'Test category description',
    ...data
  });
};

describe('Category API Tests', () => {
  let adminToken;
  let userToken;
  let adminUser;
  let regularUser;
  let branch;

  beforeEach(async () => {
    // Create branch first for non-admin users
    branch = await Branch.create({
      name: 'Test Branch',
      code: 'TEST-001',
      address: { street: '123 St', city: 'Test City', province: 'Province' },
      contact: { phone: '+63 2 1234 5678', email: 'test@branch.com' }
    });

    const admin = await createTestAdmin();
    adminToken = admin.token;
    adminUser = admin.user;

    const user = await createTestUser({
      name: 'Regular User',
      email: 'user@example.com',
      role: 'salesperson',
      branch: branch._id
    });
    userToken = user.token;
    regularUser = user.user;
  });

  describe('GET /api/categories', () => {
    it('should get all categories', async () => {
      // Create test categories
      await createTestCategory({ name: 'Electronics', sortOrder: 1 });
      await createTestCategory({ name: 'Furniture', sortOrder: 2 });
      await createTestCategory({ name: 'Clothing', sortOrder: 3 });

      const res = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].name).toBe('Electronics');
    });

    it('should filter categories by active status', async () => {
      await createTestCategory({ name: 'Active Category', isActive: true });
      await createTestCategory({ name: 'Inactive Category', isActive: false });

      const res = await request(app)
        .get('/api/categories?active=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Active Category');
    });

    it('should filter root categories (no parent)', async () => {
      const parent = await createTestCategory({ name: 'Parent Category' });
      await createTestCategory({ name: 'Child Category', parent: parent._id });
      await createTestCategory({ name: 'Another Root' });

      const res = await request(app)
        .get('/api/categories?parent=null')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every(cat => !cat.parent)).toBe(true);
    });

    it('should include children when requested', async () => {
      const parent = await createTestCategory({ name: 'Parent' });
      await createTestCategory({ name: 'Child 1', parent: parent._id });
      await createTestCategory({ name: 'Child 2', parent: parent._id });

      const res = await request(app)
        .get('/api/categories?includeChildren=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const parentCategory = res.body.data.find(c => c.name === 'Parent');
      expect(parentCategory.children).toBeDefined();
      expect(parentCategory.children).toHaveLength(2);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/categories');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/categories/:id', () => {
    it('should get single category with full path', async () => {
      const grandparent = await createTestCategory({ name: 'Electronics' });
      const parent = await createTestCategory({ 
        name: 'Computers', 
        parent: grandparent._id 
      });
      const child = await createTestCategory({ 
        name: 'Laptops', 
        parent: parent._id 
      });

      const res = await request(app)
        .get(`/api/categories/${child._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Laptops');
      expect(res.body.data.fullPath).toBe('Electronics > Computers > Laptops');
      expect(res.body.data.parent).toBeDefined();
      expect(res.body.data.parent.name).toBe('Computers');
    });

    it('should return 404 for non-existent category', async () => {
      const res = await request(app)
        .get('/api/categories/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid category ID', async () => {
      const res = await request(app)
        .get('/api/categories/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/categories/:id/children', () => {
    it('should get all children of a category', async () => {
      const parent = await createTestCategory({ name: 'Parent' });
      await createTestCategory({ name: 'Child 1', parent: parent._id, sortOrder: 2 });
      await createTestCategory({ name: 'Child 2', parent: parent._id, sortOrder: 1 });
      await createTestCategory({ name: 'Child 3', parent: parent._id, isActive: false });

      const res = await request(app)
        .get(`/api/categories/${parent._id}/children`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2); // Only active children
      expect(res.body.data[0].name).toBe('Child 2'); // Sorted by sortOrder
    });

    it('should return empty array for category with no children', async () => {
      const category = await createTestCategory({ name: 'No Children' });

      const res = await request(app)
        .get(`/api/categories/${category._id}/children`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('POST /api/categories', () => {
    it('should create a new category', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Category',
          description: 'Test description',
          color: '#FF5733',
          sortOrder: 1
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('New Category');
      expect(res.body.data.code).toBe('NEW-CATEGORY'); // Auto-generated
      expect(res.body.data.color).toBe('#FF5733');
    });

    it('should create category with parent', async () => {
      const parent = await createTestCategory({ name: 'Parent' });

      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Child Category',
          parent: parent._id
        });

      expect(res.status).toBe(201);
      expect(res.body.data.parent.toString()).toBe(parent._id.toString());
    });

    it('should create category with custom code', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Custom Code Category',
          code: 'CUSTOM-123'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('CUSTOM-123');
    });

    it('should fail if parent category does not exist', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Parent',
          parent: '507f1f77bcf86cd799439011'
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Parent category not found');
    });

    it('should fail with missing required fields', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should fail with invalid color format', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Color',
          color: 'red'
        });

      expect(res.status).toBe(400);
    });

    it('should fail with duplicate name', async () => {
      await createTestCategory({ name: 'Duplicate' });

      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate'
        });

      expect(res.status).toBe(400);
    });

    it('should require admin role', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Test Category'
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('should update category', async () => {
      const category = await createTestCategory({ name: 'Old Name' });

      const res = await request(app)
        .put(`/api/categories/${category._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Name',
          description: 'Updated description',
          color: '#00FF00'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('New Name');
      expect(res.body.data.description).toBe('Updated description');
      expect(res.body.data.color).toBe('#00FF00');
    });

    it('should update parent category', async () => {
      const oldParent = await createTestCategory({ name: 'Old Parent' });
      const newParent = await createTestCategory({ name: 'New Parent' });
      const category = await createTestCategory({ 
        name: 'Child', 
        parent: oldParent._id 
      });

      const res = await request(app)
        .put(`/api/categories/${category._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          parent: newParent._id
        });

      expect(res.status).toBe(200);
      expect(res.body.data.parent._id.toString()).toBe(newParent._id.toString());
    });

    it('should fail if setting self as parent', async () => {
      const category = await createTestCategory({ name: 'Self Parent' });

      const res = await request(app)
        .put(`/api/categories/${category._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          parent: category._id
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('cannot be its own parent');
    });

    it('should fail if new parent does not exist', async () => {
      const category = await createTestCategory({ name: 'Test' });

      const res = await request(app)
        .put(`/api/categories/${category._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          parent: '507f1f77bcf86cd799439011'
        });

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent category', async () => {
      const res = await request(app)
        .put('/api/categories/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test' });

      expect(res.status).toBe(404);
    });

    it('should require admin role', async () => {
      const category = await createTestCategory();

      const res = await request(app)
        .put(`/api/categories/${category._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('should soft delete category', async () => {
      const category = await createTestCategory({ name: 'To Delete' });

      const res = await request(app)
        .delete(`/api/categories/${category._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);

      // Verify it's soft deleted
      const deletedCategory = await Category.findById(category._id);
      expect(deletedCategory.isActive).toBe(false);
    });

    it('should fail if category has products', async () => {
      const category = await createTestCategory({ name: 'With Products' });
      
      // Create a product in this category
      await Product.create({
        name: 'Test Product',
        sku: 'TEST-001',
        category: category._id,
        costPrice: 100,
        sellingPrice: 150
      });

      const res = await request(app)
        .delete(`/api/categories/${category._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('product(s) are assigned');
    });

    it('should fail if category has children', async () => {
      const parent = await createTestCategory({ name: 'Parent' });
      await createTestCategory({ name: 'Child', parent: parent._id });

      const res = await request(app)
        .delete(`/api/categories/${parent._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('subcategories');
    });

    it('should return 404 for non-existent category', async () => {
      const res = await request(app)
        .delete('/api/categories/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should require admin role', async () => {
      const category = await createTestCategory();

      const res = await request(app)
        .delete(`/api/categories/${category._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Category Code Auto-generation', () => {
    it('should auto-generate code from name', async () => {
      const category = await createTestCategory({ name: 'Test Auto Code' });
      
      expect(category.code).toBe('TEST-AUTO-CODE');
    });

    it('should handle special characters in name', async () => {
      const category = await createTestCategory({ 
        name: 'Test & Special @#$ Characters!' 
      });
      
      expect(category.code).toMatch(/^[A-Z0-9-]+$/);
    });
  });

  describe('Category Virtuals', () => {
    it('should populate productCount virtual', async () => {
      const category = await createTestCategory({ name: 'With Products' });
      
      // Create products
      await Product.create({
        name: 'Product 1',
        sku: 'P1',
        category: category._id,
        costPrice: 100,
        sellingPrice: 150
      });
      await Product.create({
        name: 'Product 2',
        sku: 'P2',
        category: category._id,
        costPrice: 200,
        sellingPrice: 250
      });

      const res = await request(app)
        .get(`/api/categories/${category._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.productCount).toBe(2);
    });
  });
});
