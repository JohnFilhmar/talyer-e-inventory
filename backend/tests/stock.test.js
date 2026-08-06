import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestUser, createTestAdmin, createTestMechanic, createTestSalesperson } from './setup/testHelpers.js';
import stockRoutes from '../src/routes/stockRoutes.js';
import Stock from '../src/models/Stock.js';
import StockTransfer from '../src/models/StockTransfer.js';
import StockMovement from '../src/models/StockMovement.js';
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
    it('inherits catalog pricing when a branch stocks a product for the first time', async () => {
      // Product prices are the reference (supplier/market) price; a branch that
      // has no opinion yet starts from them rather than being forced to retype
      // them or, worse, being blocked from stocking the item at all.
      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 10,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.costPrice).toBe(product.costPrice);
      expect(res.body.data.sellingPrice).toBe(product.sellingPrice);
    });

    it('lets a branch override either price at creation', async () => {
      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 10,
          sellingPrice: 999,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.sellingPrice).toBe(999);
      // The price that was not supplied still comes from the catalog.
      expect(res.body.data.costPrice).toBe(product.costPrice);
    });

    it('never overwrites an existing branch price on a later restock', async () => {
      await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 10,
          costPrice: 300,
          sellingPrice: 400,
        });

      // Restocking without prices is a quantity top-up. A branch manager's
      // deliberate price must survive it — and must survive a later catalog
      // edit too, which is why inheritance happens only at creation.
      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 5,
        });

      // The endpoint answers 201 for a top-up as well as a first stocking.
      expect(res.statusCode).toBe(201);
      expect(res.body.data.quantity).toBe(15);
      expect(res.body.data.costPrice).toBe(300);
      expect(res.body.data.sellingPrice).toBe(400);
    });

    it('keeps branches independent: the same product can cost different amounts', async () => {
      await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 10,
          sellingPrice: 500,
        });

      const branchBRes = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchB._id.toString(),
          quantity: 10,
        });

      expect(branchBRes.statusCode).toBe(201);
      // Branch B inherits the catalog price, unaffected by what A charges.
      expect(branchBRes.body.data.sellingPrice).toBe(product.sellingPrice);
      expect(branchBRes.body.data.sellingPrice).not.toBe(500);
    });

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
  describe('Archived products cannot be stocked up', () => {
    // Deleting a product is a soft delete: isActive false, isDiscontinued true.
    // It vanishes from the catalog, so units bought after that point are
    // invisible until someone audits stock.
    const archive = async () => {
      await Product.findByIdAndUpdate(product._id, {
        isActive: false,
        isDiscontinued: true,
      });
    };

    it('refuses a restock of an archived product', async () => {
      await archive();

      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 10,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/archived|discontinued/i);
    });

    it('refuses a restock by stock id too, not just by product', async () => {
      const stock = await createTestStock({ product: product._id, branch: branchA._id, quantity: 20 });
      await archive();

      const res = await request(app)
        .put(`/api/stock/${stock._id}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 5 });

      expect(res.statusCode).toBe(400);

      const unchanged = await Stock.findById(stock._id);
      expect(unchanged.quantity).toBe(20);
    });

    it('refuses an upward adjustment on an archived product', async () => {
      await createTestStock({ product: product._id, branch: branchA._id, quantity: 20 });
      await archive();

      const res = await request(app)
        .post('/api/stock/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          adjustment: 5,
          reason: 'Found more in the back',
        });

      expect(res.statusCode).toBe(400);
    });

    it('still allows writing archived stock DOWN, or dead units would be trapped', async () => {
      const stock = await createTestStock({ product: product._id, branch: branchA._id, quantity: 20 });
      await archive();

      const res = await request(app)
        .post('/api/stock/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          adjustment: -20,
          reason: 'Written off',
        });

      expect(res.statusCode).toBe(200);

      const cleared = await Stock.findById(stock._id);
      expect(cleared.quantity).toBe(0);
    });

    it('allows restocking again once the product is restored', async () => {
      await archive();

      const blocked = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 10,
        });
      expect(blocked.statusCode).toBe(400);

      await Product.findByIdAndUpdate(product._id, {
        isActive: true,
        isDiscontinued: false,
      });

      const allowed = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 10,
        });

      expect(allowed.statusCode).toBe(201);
      expect(allowed.body.data.quantity).toBe(10);
    });

    it('refuses a product that is discontinued but still marked active', async () => {
      // The two flags are set together by the delete path, but they are
      // independent fields and either one on its own means "stop buying this".
      await Product.findByIdAndUpdate(product._id, { isDiscontinued: true });

      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          quantity: 10,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/discontinued/i);
    });
  });

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
      expect(res.body.data.status).toBe('in-transit');
      expect(res.body.data).toHaveProperty('shippedAt');
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
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data).toHaveProperty('receivedAt');

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
      expect(res.body.data.status).toBe('cancelled');

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

  describe('stock branch scoping', () => {
    it('restricts GET /api/stock to the salespersons own branch', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'SC-OWN' });
      const other = await createTestBranch({ name: 'Other', code: 'SC-OTH' });
      const category = await createTestCategory({ name: 'Scope Category', code: 'SC-CAT' });
      const product = await createTestProduct({ category: category._id });
      await Stock.create({ product: product._id, branch: own._id, quantity: 5, costPrice: 1, sellingPrice: 2 });
      await Stock.create({ product: product._id, branch: other._id, quantity: 7, costPrice: 1, sellingPrice: 2 });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get('/api/stock')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].branch._id.toString()).toBe(own._id.toString());
    });

    it('ignores a branch query that points at another branch', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'SC-OWN2' });
      const other = await createTestBranch({ name: 'Other', code: 'SC-OTH2' });
      const category = await createTestCategory({ name: 'Scope Category', code: 'SC-CAT' });
      const product = await createTestProduct({ category: category._id });
      await Stock.create({ product: product._id, branch: other._id, quantity: 7, costPrice: 1, sellingPrice: 2 });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get(`/api/stock?branch=${other._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('rejects a restock aimed at another branch', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'SC-OWN3' });
      const other = await createTestBranch({ name: 'Other', code: 'SC-OTH3' });
      const category = await createTestCategory({ name: 'Scope Category', code: 'SC-CAT' });
      const product = await createTestProduct({ category: category._id });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${token}`)
        .send({ product: product._id, branch: other._id, quantity: 5, costPrice: 10, sellingPrice: 20 });

      expect(res.status).toBe(403);
    });

    it('rejects restock-by-id against another branch stock record', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'SC-OWN4' });
      const other = await createTestBranch({ name: 'Other', code: 'SC-OTH4' });
      const category = await createTestCategory({ name: 'Scope Category', code: 'SC-CAT' });
      const product = await createTestProduct({ category: category._id });
      const foreign = await Stock.create({ product: product._id, branch: other._id, quantity: 1, costPrice: 1, sellingPrice: 2 });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .put(`/api/stock/${foreign._id}/restock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 9999 });

      expect(res.status).toBe(403);

      const reread = await Stock.findById(foreign._id);
      expect(reread.quantity).toBe(1);
    });

    it('denies a customer access to per-branch cost prices', async () => {
      const category = await createTestCategory({ name: 'Scope Category', code: 'SC-CAT' });
      const product = await createTestProduct({ category: category._id });
      const { token } = await createTestUser({ email: 'cust@example.com', role: 'customer' });

      const res = await request(app)
        .get(`/api/stock/product/${product._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('clamps a salesperson to their own branch on GET /api/stock/product/:productId', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'SC-OWN5' });
      const other = await createTestBranch({ name: 'Other', code: 'SC-OTH5' });
      const category = await createTestCategory({ name: 'Scope Category', code: 'SC-CAT' });
      const product = await createTestProduct({ category: category._id });
      await Stock.create({
        product: product._id, branch: own._id,
        quantity: 10, reservedQuantity: 2, costPrice: 100, sellingPrice: 150
      });
      await Stock.create({
        product: product._id, branch: other._id,
        quantity: 40, reservedQuantity: 5, costPrice: 300, sellingPrice: 500
      });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get(`/api/stock/product/${product._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      // Only the caller's own branch is visible - branch B's cost/selling
      // price and quantity (and therefore its margin) must not leak.
      expect(res.body.data.branches).toHaveLength(1);
      expect(res.body.data.branches[0].branch._id).toBe(own._id.toString());
      expect(res.body.data.branches[0].costPrice).toBe(100);
      expect(res.body.data.branches[0].sellingPrice).toBe(150);

      // Totals must be recomputed from the filtered set, not the full one,
      // so they can't be diffed against a second call to infer branch B.
      expect(res.body.data.totalQuantity).toBe(10);
      expect(res.body.data.totalReserved).toBe(2);
      expect(res.body.data.totalAvailable).toBe(8);
    });

    it('still shows every branch to an admin on GET /api/stock/product/:productId', async () => {
      const branchA2 = await createTestBranch({ name: 'AdminView A', code: 'SC-ADM-A' });
      const branchB2 = await createTestBranch({ name: 'AdminView B', code: 'SC-ADM-B' });
      const category = await createTestCategory({ name: 'Scope Category', code: 'SC-CAT' });
      const product = await createTestProduct({ category: category._id });
      await Stock.create({ product: product._id, branch: branchA2._id, quantity: 10, costPrice: 100, sellingPrice: 150 });
      await Stock.create({ product: product._id, branch: branchB2._id, quantity: 40, costPrice: 300, sellingPrice: 500 });

      const res = await request(app)
        .get(`/api/stock/product/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.branches).toHaveLength(2);
      expect(res.body.data.totalQuantity).toBe(50);
    });
  });

  describe('numeric coercion', () => {
    it('treats a string quantity as a number on restock', async () => {
      const branch = await createTestBranch({ name: 'Coerce', code: 'CO-1' });
      const category = await createTestCategory({ name: 'Coerce Category', code: 'CO-CAT' });
      const product = await createTestProduct({ category: category._id });
      const stock = await Stock.create({
        product: product._id, branch: branch._id, quantity: 100, costPrice: 1, sellingPrice: 2,
      });

      const res = await request(app)
        .put(`/api/stock/${stock._id}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: '5' });

      expect(res.status).toBe(200);

      const reread = await Stock.findById(stock._id);
      expect(reread.quantity).toBe(105);
    });

    it('rejects a non-numeric quantity with 400 instead of coercing to NaN', async () => {
      const branch = await createTestBranch({ name: 'CoerceBad', code: 'CO-2' });
      const category = await createTestCategory({ name: 'Coerce Bad Category', code: 'CO-BAD-CAT' });
      const product = await createTestProduct({ category: category._id });
      const stock = await Stock.create({
        product: product._id, branch: branch._id, quantity: 100, costPrice: 1, sellingPrice: 2,
      });

      const res = await request(app)
        .put(`/api/stock/${stock._id}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 'abc' });

      expect(res.status).toBe(400);

      const reread = await Stock.findById(stock._id);
      expect(reread.quantity).toBe(100);
    });
  });

  // ===================
  // TRANSFER HISTORY AUTHORIZATION (Hole 1)
  // ===================
  describe('transfer history authorization', () => {
    it('rejects a customer from GET /api/stock/transfers', async () => {
      const { token } = await createTestUser({ email: 'cust-transfers@example.com', role: 'customer' });

      const res = await request(app)
        .get('/api/stock/transfers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('rejects a customer from GET /api/stock/transfers/:id', async () => {
      const { token } = await createTestUser({ email: 'cust-transfer-detail@example.com', role: 'customer' });
      const transfer = await StockTransfer.create({
        product: product._id,
        fromBranch: branchA._id,
        toBranch: branchB._id,
        quantity: 10,
        initiatedBy: adminUser._id
      });

      const res = await request(app)
        .get(`/api/stock/transfers/${transfer._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('scopes the transfer list to the salesperson own branch on either side', async () => {
      const own = await createTestBranch({ name: 'Trans Own', code: 'TR-OWN' });
      const otherX = await createTestBranch({ name: 'Trans Other X', code: 'TR-OTH-X' });
      const otherY = await createTestBranch({ name: 'Trans Other Y', code: 'TR-OTH-Y' });

      const ownTransfer = await StockTransfer.create({
        product: product._id,
        fromBranch: otherX._id,
        toBranch: own._id,
        quantity: 5,
        initiatedBy: adminUser._id
      });

      const otherTransfer = await StockTransfer.create({
        product: product._id,
        fromBranch: otherX._id,
        toBranch: otherY._id,
        quantity: 5,
        initiatedBy: adminUser._id
      });

      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get('/api/stock/transfers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((t) => t._id);
      expect(ids).toContain(ownTransfer._id.toString());
      expect(ids).not.toContain(otherTransfer._id.toString());
    });

    it('rejects a salesperson reading a transfer between two other branches', async () => {
      const own = await createTestBranch({ name: 'Detail Own', code: 'DT-OWN' });
      const otherX = await createTestBranch({ name: 'Detail Other X', code: 'DT-OTH-X' });
      const otherY = await createTestBranch({ name: 'Detail Other Y', code: 'DT-OTH-Y' });

      const transfer = await StockTransfer.create({
        product: product._id,
        fromBranch: otherX._id,
        toBranch: otherY._id,
        quantity: 5,
        initiatedBy: adminUser._id
      });

      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get(`/api/stock/transfers/${transfer._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('allows a salesperson to read a transfer where their branch is the destination', async () => {
      const own = await createTestBranch({ name: 'Detail Own2', code: 'DT-OWN2' });
      const otherX = await createTestBranch({ name: 'Detail Other X2', code: 'DT-OTH-X2' });

      const transfer = await StockTransfer.create({
        product: product._id,
        fromBranch: otherX._id,
        toBranch: own._id,
        quantity: 5,
        initiatedBy: adminUser._id
      });

      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get(`/api/stock/transfers/${transfer._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(transfer._id.toString());
    });
  });

  // ===================
  // MOVEMENT LEDGER AUTHORIZATION (Hole 2)
  // ===================
  describe('movement ledger authorization', () => {
    it('rejects a salesperson reading movements for another branch stock record', async () => {
      const own = await createTestBranch({ name: 'Mv Own', code: 'MV-OWN' });
      const other = await createTestBranch({ name: 'Mv Other', code: 'MV-OTH' });

      const foreignStock = await createTestStock({ product: product._id, branch: other._id });

      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get(`/api/stock/movements/stock/${foreignStock._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('scopes product movements to the salesperson own branch', async () => {
      const own = await createTestBranch({ name: 'Mv Prod Own', code: 'MV-PR-OWN' });
      const other = await createTestBranch({ name: 'Mv Prod Other', code: 'MV-PR-OTH' });

      const ownStock = await createTestStock({ product: product._id, branch: own._id });
      const otherStock = await createTestStock({ product: product._id, branch: other._id });

      await StockMovement.create({
        stock: ownStock._id,
        product: product._id,
        branch: own._id,
        type: 'initial',
        quantity: 100,
        quantityBefore: 0,
        quantityAfter: 100,
        performedBy: adminUser._id
      });

      await StockMovement.create({
        stock: otherStock._id,
        product: product._id,
        branch: other._id,
        type: 'initial',
        quantity: 100,
        quantityBefore: 0,
        quantityAfter: 100,
        performedBy: adminUser._id
      });

      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get(`/api/stock/movements/product/${product._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].branch._id).toBe(own._id.toString());
    });
  });

  // ===================
  // BRANCH STOCK ROLE RESTRICTION (Hole 3)
  // ===================
  describe('branch stock role restriction', () => {
    it('rejects a mechanic from GET /api/stock/branch/:branchId for their own branch', async () => {
      // regularUser/userToken (from the top-level beforeEach) is a mechanic
      // assigned to branchA - checkBranchAccess alone would allow this.
      const res = await request(app)
        .get(`/api/stock/branch/${branchA._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });
});
