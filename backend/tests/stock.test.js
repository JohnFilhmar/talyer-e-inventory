import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestUser, createTestAdmin, createTestMechanic } from './setup/testHelpers.js';
import stockRoutes from '../src/routes/stockRoutes.js';
import Stock from '../src/models/Stock.js';
import StockTransfer from '../src/models/StockTransfer.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Branch from '../src/models/Branch.js';
import { USER_ROLES } from '../src/config/constants.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/stock', stockRoutes);

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

// Helper functions
const createTestCategory = async (data = {}) => {
  return await Category.create({
    name: data.name || 'Test Category',
    code: data.code || 'TEST-CAT',
    ...data
  });
};

const createTestProduct = async (data = {}) => {
  return await Product.create({
    name: data.name || 'Test Product',
    costPrice: data.costPrice || 100,
    sellingPrice: data.sellingPrice || 150,
    category: data.category,
    ...data
  });
};

const createTestBranch = async (data = {}) => {
  return await Branch.create({
    name: data.name || 'Test Branch',
    code: data.code || 'TEST-BRANCH',
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
    },
    ...data
  });
};

const createTestStock = async (data = {}) => {
  return await Stock.create({
    product: data.product,
    branch: data.branch,
    quantity: data.quantity || 100,
    costPrice: data.costPrice || 100,
    sellingPrice: data.sellingPrice || 150,
    ...data
  });
};

describe('Stock API Tests', () => {
  let adminToken;
  let userToken;
  let adminUser;
  let regularUser;
  let category;
  let product;
  let branchA;
  let branchB;

  beforeEach(async () => {
    // Create test branches first
    branchA = await createTestBranch({ name: 'Branch A', code: 'BRANCH-A' });
    branchB = await createTestBranch({ name: 'Branch B', code: 'BRANCH-B' });

    // Create test users
    const admin = await createTestAdmin();
    const user = await createTestMechanic(branchA._id); // Pass branch ID during creation
    
    adminToken = admin.token;
    userToken = user.token;
    adminUser = admin.user;
    regularUser = user.user;

    // Create test category
    category = await createTestCategory();

    // Create test product
    product = await createTestProduct({ category: category._id });
  });

  // ===================
  // RESTOCK PRODUCT TESTS
  // ===================
  describe('POST /api/stock/restock - Restock Product', () => {
    it('should create new stock record for branch', async () => {
      const stockData = {
        product: product._id.toString(),
        branch: branchA._id.toString(),
        quantity: 100,
        costPrice: 200,
        sellingPrice: 250,
        reorderPoint: 10,
        reorderQuantity: 50,
        location: 'A-01-15'
      };

      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(stockData);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.quantity).toBe(100);
      expect(res.body.data.costPrice).toBe(200);
      expect(res.body.data.sellingPrice).toBe(250);
      expect(res.body.data.availableQuantity).toBe(100);
    });

    it('should update existing stock record (add quantity)', async () => {
      // Create initial stock
      await createTestStock({
        product: product._id,
        branch: branchA._id,
        quantity: 50,
        costPrice: 200,
        sellingPrice: 250
      });

      const restockData = {
        product: product._id.toString(),
        branch: branchA._id.toString(),
        quantity: 30,
        costPrice: 200,
        sellingPrice: 250
      };

      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(restockData);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.quantity).toBe(80); // 50 + 30
    });

    it('should enforce branch-specific pricing (MVP CRITICAL)', async () => {
      // Create stock for Branch A with one price
      const stockA = await createTestStock({
        product: product._id,
        branch: branchA._id,
        quantity: 100,
        costPrice: 200,
        sellingPrice: 250
      });

      // Create stock for Branch B with different price (SAME PRODUCT)
      const stockB = await createTestStock({
        product: product._id,
        branch: branchB._id,
        quantity: 100,
        costPrice: 180,
        sellingPrice: 300
      });

      // Verify both records exist with different prices
      const stocksInDB = await Stock.find({ product: product._id }).sort({ 'branch': 1 });
      expect(stocksInDB.length).toBe(2);
      
      // Branch A pricing
      expect(stocksInDB[0].branch.toString()).toBe(branchA._id.toString());
      expect(stocksInDB[0].costPrice).toBe(200);
      expect(stocksInDB[0].sellingPrice).toBe(250);
      
      // Branch B pricing (different for same product)
      expect(stocksInDB[1].branch.toString()).toBe(branchB._id.toString());
      expect(stocksInDB[1].costPrice).toBe(180);
      expect(stocksInDB[1].sellingPrice).toBe(300);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/stock/restock')
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 100,
          costPrice: 200,
          sellingPrice: 250
        });

      expect(res.statusCode).toBe(401);
    });

    it('should require admin or salesperson role', async () => {
      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 100,
          costPrice: 200,
          sellingPrice: 250
        });

      expect(res.statusCode).toBe(403);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString()
          // Missing quantity, costPrice, sellingPrice
        });

      expect(res.statusCode).toBe(400);
    });

    it('should validate product exists', async () => {
      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: '507f1f77bcf86cd799439011', // Non-existent ID
          branch: branchA._id.toString(),
          quantity: 100,
          costPrice: 200,
          sellingPrice: 250
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Product not found');
    });

    it('should validate branch exists', async () => {
      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: '507f1f77bcf86cd799439011', // Non-existent ID
          quantity: 100,
          costPrice: 200,
          sellingPrice: 250
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Branch not found');
    });
  });

  // ===================
  // GET STOCK TESTS
  // ===================
  describe('GET /api/stock - Get All Stock', () => {
    beforeEach(async () => {
      // Create some stock records
      await createTestStock({
        product: product._id,
        branch: branchA._id,
        quantity: 100,
        costPrice: 200,
        sellingPrice: 250
      });

      await createTestStock({
        product: product._id,
        branch: branchB._id,
        quantity: 50,
        costPrice: 180,
        sellingPrice: 300
      });
    });

    it('should get all stock records', async () => {
      const res = await request(app)
        .get('/api/stock')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.total).toBe(2);
    });

    it('should filter by branch', async () => {
      const res = await request(app)
        .get(`/api/stock?branch=${branchA._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].branch._id).toBe(branchA._id.toString());
    });

    it('should filter by product', async () => {
      const res = await request(app)
        .get(`/api/stock?product=${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('should filter low stock items', async () => {
      // Update one stock to be low
      await Stock.findOneAndUpdate(
        { product: product._id, branch: branchA._id },
        { quantity: 5, reorderPoint: 10 }
      );

      const res = await request(app)
        .get('/api/stock?lowStock=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].branch._id).toBe(branchA._id.toString());
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/stock');
      expect(res.statusCode).toBe(401);
    });
  });

  // ===================
  // GET BRANCH STOCK TESTS
  // ===================
  describe('GET /api/stock/branch/:branchId - Get Branch Stock', () => {
    beforeEach(async () => {
      await createTestStock({
        product: product._id,
        branch: branchA._id,
        quantity: 100,
        costPrice: 200,
        sellingPrice: 250
      });
    });

    it('should get stock for specific branch', async () => {
      const res = await request(app)
        .get(`/api/stock/branch/${branchA._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].costPrice).toBe(200);
      expect(res.body.data[0].sellingPrice).toBe(250);
    });

    it('should return 404 for non-existent branch', async () => {
      const res = await request(app)
        .get('/api/stock/branch/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  // ===================
  // GET PRODUCT STOCK TESTS
  // ===================
  describe('GET /api/stock/product/:productId - Get Product Stock', () => {
    beforeEach(async () => {
      await createTestStock({
        product: product._id,
        branch: branchA._id,
        quantity: 100,
        costPrice: 200,
        sellingPrice: 250
      });

      await createTestStock({
        product: product._id,
        branch: branchB._id,
        quantity: 50,
        costPrice: 180,
        sellingPrice: 300
      });
    });

    it('should get stock summary across all branches', async () => {
      const res = await request(app)
        .get(`/api/stock/product/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalQuantity).toBe(150); // 100 + 50
      expect(res.body.data.branches.length).toBe(2);
      
      // Verify branch-specific pricing
      const branchAStock = res.body.data.branches.find(
        b => b.branch._id === branchA._id.toString()
      );
      const branchBStock = res.body.data.branches.find(
        b => b.branch._id === branchB._id.toString()
      );
      
      expect(branchAStock.sellingPrice).toBe(250);
      expect(branchBStock.sellingPrice).toBe(300); // Different price same product
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .get('/api/stock/product/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  // ===================
  // GET LOW STOCK TESTS
  // ===================
  describe('GET /api/stock/low-stock - Get Low Stock Items', () => {
    beforeEach(async () => {
      await createTestStock({
        product: product._id,
        branch: branchA._id,
        quantity: 5,
        reorderPoint: 10,
        costPrice: 200,
        sellingPrice: 250
      });

      await createTestStock({
        product: product._id,
        branch: branchB._id,
        quantity: 100,
        reorderPoint: 10,
        costPrice: 180,
        sellingPrice: 300
      });
    });

    it('should get low stock items', async () => {
      const res = await request(app)
        .get('/api/stock/low-stock')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].branch._id).toBe(branchA._id.toString());
    });

    it('should filter low stock by branch', async () => {
      const res = await request(app)
        .get(`/api/stock/low-stock?branch=${branchA._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  // ===================
  // ADJUST STOCK TESTS
  // ===================
  describe('POST /api/stock/adjust - Adjust Stock', () => {
    beforeEach(async () => {
      await createTestStock({
        product: product._id,
        branch: branchA._id,
        quantity: 100,
        costPrice: 200,
        sellingPrice: 250
      });
    });

    it('should adjust stock quantity (admin only)', async () => {
      const res = await request(app)
        .post('/api/stock/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          adjustment: -10,
          reason: 'Damaged items removed from inventory'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stock.quantity).toBe(90);
      expect(res.body.data.adjustment.oldQuantity).toBe(100);
      expect(res.body.data.adjustment.newQuantity).toBe(90);
    });

    it('should require admin role', async () => {
      const res = await request(app)
        .post('/api/stock/adjust')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          adjustment: -10,
          reason: 'Test reason'
        });

      expect(res.statusCode).toBe(403);
    });

    it('should require reason', async () => {
      const res = await request(app)
        .post('/api/stock/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          adjustment: -10
        });

      expect(res.statusCode).toBe(400);
    });

    it('should not allow negative quantities', async () => {
      const res = await request(app)
        .post('/api/stock/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          adjustment: -150, // Would result in -50
          reason: 'Test reason'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.stock.quantity).toBe(0); // Clamped to 0
    });
  });

  // ===================
  // STOCK TRANSFER TESTS
  // ===================
  describe('POST /api/stock/transfers - Create Stock Transfer', () => {
    beforeEach(async () => {
      await createTestStock({
        product: product._id,
        branch: branchA._id,
        quantity: 100,
        costPrice: 200,
        sellingPrice: 250
      });
    });

    it('should create stock transfer and reserve stock', async () => {
      const transferData = {
        product: product._id.toString(),
        fromBranch: branchA._id.toString(),
        toBranch: branchB._id.toString(),
        quantity: 30,
        notes: 'Transfer to Branch B'
      };

      const res = await request(app)
        .post('/api/stock/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(transferData);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('transferNumber');
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.quantity).toBe(30);

      // Verify stock was reserved
      const stock = await Stock.findOne({ product: product._id, branch: branchA._id });
      expect(stock.reservedQuantity).toBe(30);
      expect(stock.availableQuantity).toBe(70); // 100 - 30
    });

    it('should prevent transfer to same branch', async () => {
      const res = await request(app)
        .post('/api/stock/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          fromBranch: branchA._id.toString(),
          toBranch: branchA._id.toString(),
          quantity: 30
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('must be different');
    });

    it('should prevent transfer with insufficient stock', async () => {
      const res = await request(app)
        .post('/api/stock/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          fromBranch: branchA._id.toString(),
          toBranch: branchB._id.toString(),
          quantity: 150 // More than available
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Insufficient stock');
    });
  });

  describe('PUT /api/stock/transfers/:id - Update Transfer Status', () => {
    let transfer;

    beforeEach(async () => {
      // Create stock at source
      await createTestStock({
        product: product._id,
        branch: branchA._id,
        quantity: 100,
        reservedQuantity: 30,
        costPrice: 200,
        sellingPrice: 250
      });

      // Create pending transfer
      transfer = await StockTransfer.create({
        product: product._id,
        fromBranch: branchA._id,
        toBranch: branchB._id,
        quantity: 30,
        initiatedBy: adminUser._id
      });
    });

    it('should update status to in-transit', async () => {
      const res = await request(app)
        .put(`/api/stock/transfers/${transfer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'in-transit' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transfer.status).toBe('in-transit');
      expect(res.body.data.transfer).toHaveProperty('shippedAt');
    });

    it('should complete transfer and update stock', async () => {
      // First set to in-transit
      transfer.status = 'in-transit';
      await transfer.save();

      const res = await request(app)
        .put(`/api/stock/transfers/${transfer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transfer.status).toBe('completed');
      expect(res.body.data.transfer).toHaveProperty('receivedAt');

      // Verify stock was deducted from source
      const sourceStock = await Stock.findOne({ product: product._id, branch: branchA._id });
      expect(sourceStock.quantity).toBe(70); // 100 - 30
      expect(sourceStock.reservedQuantity).toBe(0); // Released

      // Verify stock was added to destination
      const destStock = await Stock.findOne({ product: product._id, branch: branchB._id });
      expect(destStock.quantity).toBe(30);
    });

    it('should cancel transfer and release reserved stock', async () => {
      const res = await request(app)
        .put(`/api/stock/transfers/${transfer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'cancelled' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transfer.status).toBe('cancelled');

      // Verify reserved stock was released
      const stock = await Stock.findOne({ product: product._id, branch: branchA._id });
      expect(stock.reservedQuantity).toBe(0);
    });

    it('should prevent invalid status transitions', async () => {
      // Try to go from pending directly to completed (must be in-transit first)
      const res = await request(app)
        .put(`/api/stock/transfers/${transfer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Cannot transition');
    });
  });

  describe('GET /api/stock/transfers - Get Stock Transfers', () => {
    beforeEach(async () => {
      await StockTransfer.create({
        product: product._id,
        fromBranch: branchA._id,
        toBranch: branchB._id,
        quantity: 30,
        initiatedBy: adminUser._id,
        status: 'pending'
      });

      await StockTransfer.create({
        product: product._id,
        fromBranch: branchB._id,
        toBranch: branchA._id,
        quantity: 20,
        initiatedBy: adminUser._id,
        status: 'completed'
      });
    });

    it('should get all transfers', async () => {
      const res = await request(app)
        .get('/api/stock/transfers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it('should filter by branch', async () => {
      const res = await request(app)
        .get(`/api/stock/transfers?branch=${branchA._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(2); // Both transfers involve Branch A
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/stock/transfers?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe('pending');
    });
  });

  describe('GET /api/stock/transfers/:id - Get Single Transfer', () => {
    let transfer;

    beforeEach(async () => {
      transfer = await StockTransfer.create({
        product: product._id,
        fromBranch: branchA._id,
        toBranch: branchB._id,
        quantity: 30,
        initiatedBy: adminUser._id
      });
    });

    it('should get single transfer details', async () => {
      const res = await request(app)
        .get(`/api/stock/transfers/${transfer._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(transfer._id.toString());
      expect(res.body.data).toHaveProperty('product');
      expect(res.body.data).toHaveProperty('fromBranch');
      expect(res.body.data).toHaveProperty('toBranch');
    });

    it('should return 404 for non-existent transfer', async () => {
      const res = await request(app)
        .get('/api/stock/transfers/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  // ===================
  // STOCK MODEL TESTS (Methods & Virtuals)
  // ===================
  describe('Stock Model Methods and Virtuals', () => {
    let stock;

    beforeEach(async () => {
      stock = await createTestStock({
        product: product._id,
        branch: branchA._id,
        quantity: 100,
        reservedQuantity: 20,
        reorderPoint: 10,
        costPrice: 200,
        sellingPrice: 250
      });
    });

    it('should calculate availableQuantity virtual', () => {
      expect(stock.availableQuantity).toBe(80); // 100 - 20
    });

    it('should calculate isLowStock virtual', async () => {
      expect(stock.isLowStock).toBe(false);

      stock.quantity = 8;
      await stock.save();

      const updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.isLowStock).toBe(true);
    });

    it('should calculate stockStatus virtual', async () => {
      expect(stock.stockStatus).toBe('in-stock');

      stock.quantity = 8;
      await stock.save();
      const lowStock = await Stock.findById(stock._id);
      expect(lowStock.stockStatus).toBe('low-stock');

      stock.quantity = 0;
      await stock.save();
      const outOfStock = await Stock.findById(stock._id);
      expect(outOfStock.stockStatus).toBe('out-of-stock');
    });

    it('should check sufficient stock', () => {
      expect(stock.hasSufficientStock(50)).toBe(true);
      expect(stock.hasSufficientStock(80)).toBe(true);
      expect(stock.hasSufficientStock(81)).toBe(false);
    });

    it('should reserve stock', async () => {
      await stock.reserveStock(30);
      expect(stock.reservedQuantity).toBe(50); // 20 + 30
      expect(stock.availableQuantity).toBe(50); // 100 - 50
    });

    it('should not reserve more than available', async () => {
      await expect(stock.reserveStock(85)).rejects.toThrow();
    });

    it('should release reserved stock', async () => {
      await stock.releaseReservedStock(10);
      expect(stock.reservedQuantity).toBe(10); // 20 - 10
      expect(stock.availableQuantity).toBe(90); // 100 - 10
    });

    it('should deduct stock', async () => {
      await stock.deductStock(20);
      expect(stock.quantity).toBe(80); // 100 - 20
      expect(stock.reservedQuantity).toBe(0); // 20 - 20
    });
  });
});
