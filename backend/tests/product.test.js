import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestUser, createTestAdmin } from './setup/testHelpers.js';
import productRoutes from '../src/routes/productRoutes.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Branch from '../src/models/Branch.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/products', productRoutes);

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

// Helper function to create test product
const createTestProduct = async (data = {}) => {
  return await Product.create({
    name: data.name || 'Test Product',
    costPrice: data.costPrice || 100,
    sellingPrice: data.sellingPrice || 150,
    category: data.category,
    ...data
  });
};

describe('Product API Tests', () => {
  let adminToken;
  let userToken;
  let adminUser;
  let regularUser;
  let testCategory;
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

    // Create a test category
    testCategory = await Category.create({
      name: 'Test Category',
      code: 'TEST-CAT'
    });
  });

  describe('GET /api/products', () => {
    it('should get all products with pagination', async () => {
      // Create test products
      for (let i = 1; i <= 5; i++) {
        await createTestProduct({
          name: `Product ${i}`,
          sku: `PROD-${i}`,
          category: testCategory._id
        });
      }

      const res = await request(app)
        .get('/api/products?page=1&limit=3')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.pagination.total).toBe(5);
      expect(res.body.pagination.pages).toBe(2);
    });

    it('should filter products by category', async () => {
      const category2 = await Category.create({
        name: 'Category 2',
        code: 'CAT2'
      });

      await createTestProduct({ name: 'Product 1', category: testCategory._id });
      await createTestProduct({ name: 'Product 2', category: category2._id });

      const res = await request(app)
        .get(`/api/products?category=${testCategory._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Product 1');
    });

    it('should filter products by brand', async () => {
      await createTestProduct({ name: 'Product 1', brand: 'Samsung', category: testCategory._id });
      await createTestProduct({ name: 'Product 2', brand: 'Apple', category: testCategory._id });

      const res = await request(app)
        .get('/api/products?brand=Samsung')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].brand).toBe('Samsung');
    });

    it('should filter by active status', async () => {
      await createTestProduct({ name: 'Active', isActive: true, category: testCategory._id });
      await createTestProduct({ name: 'Inactive', isActive: false, category: testCategory._id });

      const res = await request(app)
        .get('/api/products?active=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Active');
    });

    it('should filter by discontinued status', async () => {
      await createTestProduct({ name: 'Active Product', isDiscontinued: false, category: testCategory._id });
      await createTestProduct({ name: 'Discontinued', isDiscontinued: true, category: testCategory._id });

      const res = await request(app)
        .get('/api/products?discontinued=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Discontinued');
    });

    it('should filter by price range', async () => {
      await createTestProduct({ name: 'Cheap', sellingPrice: 50, category: testCategory._id });
      await createTestProduct({ name: 'Medium', sellingPrice: 150, category: testCategory._id });
      await createTestProduct({ name: 'Expensive', sellingPrice: 500, category: testCategory._id });

      const res = await request(app)
        .get('/api/products?minPrice=100&maxPrice=200')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Medium');
    });

    it('should sort products', async () => {
      await createTestProduct({ name: 'Z Product', category: testCategory._id });
      await createTestProduct({ name: 'A Product', category: testCategory._id });

      const res = await request(app)
        .get('/api/products?sortBy=name&sortOrder=asc')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].name).toBe('A Product');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/products');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/products/search', () => {
    it('should search products by name', async () => {
      await createTestProduct({ name: 'Samsung Galaxy S21', category: testCategory._id });
      await createTestProduct({ name: 'iPhone 13', category: testCategory._id });

      const res = await request(app)
        .get('/api/products/search?q=Samsung')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toContain('Samsung');
    });

    it('should search products by SKU', async () => {
      await createTestProduct({ name: 'Product 1', sku: 'ABC-123', category: testCategory._id });
      await createTestProduct({ name: 'Product 2', sku: 'XYZ-789', category: testCategory._id });

      const res = await request(app)
        .get('/api/products/search?q=ABC')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].sku).toContain('ABC');
    });

    it('should search by barcode', async () => {
      await createTestProduct({ 
        name: 'Product 1', 
        barcode: '1234567890123', 
        category: testCategory._id 
      });

      const res = await request(app)
        .get('/api/products/search?q=1234567890123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should limit search results', async () => {
      for (let i = 1; i <= 15; i++) {
        await createTestProduct({ 
          name: `Test Product ${i}`, 
          category: testCategory._id 
        });
      }

      const res = await request(app)
        .get('/api/products/search?q=Test&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });

    it('should fail without search query', async () => {
      const res = await request(app)
        .get('/api/products/search')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should get single product', async () => {
      const product = await createTestProduct({
        name: 'Test Product',
        brand: 'Test Brand',
        category: testCategory._id
      });

      const res = await request(app)
        .get(`/api/products/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Test Product');
      expect(res.body.data.brand).toBe('Test Brand');
      expect(res.body.data.category).toBeDefined();
      expect(res.body.data.category.name).toBe('Test Category');
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .get('/api/products/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid product ID', async () => {
      const res = await request(app)
        .get('/api/products/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/products', () => {
    it('should create product with auto-generated SKU', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Product',
          category: testCategory._id,
          costPrice: 100,
          sellingPrice: 150
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('New Product');
      expect(res.body.data.sku).toMatch(/^PROD-\d{6}$/);
    });

    it('should create product with custom SKU', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Custom SKU Product',
          sku: 'CUSTOM-123',
          category: testCategory._id,
          costPrice: 100,
          sellingPrice: 150
        });

      expect(res.status).toBe(201);
      expect(res.body.data.sku).toBe('CUSTOM-123');
    });

    it('should create product with all fields', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Complete Product',
          sku: 'COMPLETE-001',
          description: 'Full product description',
          category: testCategory._id,
          brand: 'Test Brand',
          model: 'Model X',
          costPrice: 100,
          sellingPrice: 150,
          barcode: '1234567890123',
          images: [
            { url: 'http://example.com/image1.jpg', isPrimary: true },
            { url: 'http://example.com/image2.jpg', isPrimary: false }
          ],
          specifications: {
            weight: 1.5,
            dimensions: { length: 10, width: 5, height: 2 },
            color: 'Black',
            material: 'Plastic',
            warranty: '1 year',
            origin: 'Philippines'
          },
          tags: ['electronics', 'gadget']
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Complete Product');
      expect(res.body.data.brand).toBe('Test Brand');
      expect(res.body.data.specifications.color).toBe('Black');
      expect(res.body.data.tags).toContain('electronics');
    });

    it('should fail if category does not exist', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Category',
          category: '507f1f77bcf86cd799439011',
          costPrice: 100,
          sellingPrice: 150
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Category not found');
    });

    it('should fail with missing required fields', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Incomplete Product'
        });

      expect(res.status).toBe(400);
    });

    it('should fail with negative prices', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Negative Price',
          category: testCategory._id,
          costPrice: -100,
          sellingPrice: 150
        });

      expect(res.status).toBe(400);
    });

    it('should fail with duplicate SKU', async () => {
      await createTestProduct({ sku: 'DUPLICATE-SKU', category: testCategory._id });

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate SKU',
          sku: 'DUPLICATE-SKU',
          category: testCategory._id,
          costPrice: 100,
          sellingPrice: 150
        });

      expect(res.status).toBe(400);
    });

    it('should require admin role', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Unauthorized',
          category: testCategory._id,
          costPrice: 100,
          sellingPrice: 150
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('should update product', async () => {
      const product = await createTestProduct({
        name: 'Old Name',
        category: testCategory._id
      });

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Name',
          brand: 'New Brand'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('New Name');
      expect(res.body.data.brand).toBe('New Brand');
    });

    it('should update product category', async () => {
      const product = await createTestProduct({ category: testCategory._id });
      const newCategory = await Category.create({
        name: 'New Category',
        code: 'NEW-CAT'
      });

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category: newCategory._id
        });

      expect(res.status).toBe(200);
      expect(res.body.data.category._id.toString()).toBe(newCategory._id.toString());
    });

    it('should fail if new category does not exist', async () => {
      const product = await createTestProduct({ category: testCategory._id });

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category: '507f1f77bcf86cd799439011'
        });

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .put('/api/products/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test' });

      expect(res.status).toBe(404);
    });

    it('should require admin role', async () => {
      const product = await createTestProduct({ category: testCategory._id });

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('should soft delete product', async () => {
      const product = await createTestProduct({ category: testCategory._id });

      const res = await request(app)
        .delete(`/api/products/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
      expect(res.body.data.isDiscontinued).toBe(true);

      // Verify it's soft deleted
      const deletedProduct = await Product.findById(product._id);
      expect(deletedProduct.isActive).toBe(false);
      expect(deletedProduct.isDiscontinued).toBe(true);
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .delete('/api/products/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should require admin role', async () => {
      const product = await createTestProduct({ category: testCategory._id });

      const res = await request(app)
        .delete(`/api/products/${product._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/products/:id/images/url', () => {
    it('should add image to product', async () => {
      const product = await createTestProduct({ category: testCategory._id });

      const res = await request(app)
        .post(`/api/products/${product._id}/images/url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'http://example.com/newimage.jpg',
          isPrimary: false
        });

      expect(res.status).toBe(201);
      expect(res.body.data.images).toHaveLength(1);
      expect(res.body.data.images[0].url).toBe('http://example.com/newimage.jpg');
    });

    it('should set image as primary and unset others', async () => {
      const product = await createTestProduct({
        category: testCategory._id,
        images: [
          { url: 'http://example.com/image1.jpg', isPrimary: true }
        ]
      });

      const res = await request(app)
        .post(`/api/products/${product._id}/images/url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'http://example.com/image2.jpg',
          isPrimary: true
        });

      expect(res.status).toBe(201);
      expect(res.body.data.images).toHaveLength(2);
      
      const primaryImages = res.body.data.images.filter(img => img.isPrimary);
      expect(primaryImages).toHaveLength(1);
      expect(primaryImages[0].url).toBe('http://example.com/image2.jpg');
    });

    it('should fail without URL', async () => {
      const product = await createTestProduct({ category: testCategory._id });

      const res = await request(app)
        .post(`/api/products/${product._id}/images/url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .post('/api/products/507f1f77bcf86cd799439011/images/url')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: 'http://example.com/image.jpg' });

      expect(res.status).toBe(404);
    });

    it('should require admin role', async () => {
      const product = await createTestProduct({ category: testCategory._id });

      const res = await request(app)
        .post(`/api/products/${product._id}/images/url`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ url: 'http://example.com/image.jpg' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/products/:id/images/:imageId', () => {
    it('should delete product image', async () => {
      const product = await createTestProduct({
        category: testCategory._id,
        images: [
          { url: 'http://example.com/image1.jpg', isPrimary: true },
          { url: 'http://example.com/image2.jpg', isPrimary: false }
        ]
      });

      const imageId = product.images[1]._id;

      const res = await request(app)
        .delete(`/api/products/${product._id}/images/${imageId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.images).toHaveLength(1);
      expect(res.body.data.images[0].url).toBe('http://example.com/image1.jpg');
    });

    it('should return 404 for non-existent image', async () => {
      const product = await createTestProduct({
        category: testCategory._id,
        images: [{ url: 'http://example.com/image1.jpg' }]
      });

      const res = await request(app)
        .delete(`/api/products/${product._id}/images/507f1f77bcf86cd799439011`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Image not found');
    });

    it('should require admin role', async () => {
      const product = await createTestProduct({
        category: testCategory._id,
        images: [{ url: 'http://example.com/image1.jpg' }]
      });

      const imageId = product.images[0]._id;

      const res = await request(app)
        .delete(`/api/products/${product._id}/images/${imageId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Product Virtuals', () => {
    it('should calculate profit margin', async () => {
      const product = await createTestProduct({
        category: testCategory._id,
        costPrice: 100,
        sellingPrice: 150
      });

      const res = await request(app)
        .get(`/api/products/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.profitMargin).toBe(50); // (150-100)/100 * 100 = 50%
    });

    it('should get primary image', async () => {
      const product = await createTestProduct({
        category: testCategory._id,
        images: [
          { url: 'http://example.com/image1.jpg', isPrimary: false },
          { url: 'http://example.com/image2.jpg', isPrimary: true }
        ]
      });

      const res = await request(app)
        .get(`/api/products/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.primaryImage).toBe('http://example.com/image2.jpg');
    });
  });

  describe('SKU Auto-generation', () => {
    it('should auto-generate sequential SKUs', async () => {
      const product1 = await createTestProduct({ category: testCategory._id });
      const product2 = await createTestProduct({ category: testCategory._id });

      expect(product1.sku).toMatch(/^PROD-\d{6}$/);
      expect(product2.sku).toMatch(/^PROD-\d{6}$/);
      expect(product1.sku).not.toBe(product2.sku);
    });

    it('should handle custom SKU format', async () => {
      const product = await createTestProduct({
        sku: 'CUSTOM-ABC-123',
        category: testCategory._id
      });

      expect(product.sku).toBe('CUSTOM-ABC-123');
    });
  });
});
