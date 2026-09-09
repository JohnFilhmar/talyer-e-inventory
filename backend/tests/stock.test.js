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

    // GAP-013. The reason floor was min 5, but the UI offers 'lost', which is
    // four characters, so writing off lost stock was impossible: the modal
    // reported a 5-to-500-character error for a value it had itself offered.
    // The enum values are persisted in the StockMovement ledger, so the floor
    // moved rather than the values.
    it.each(['damaged', 'lost', 'found', 'inventory_count', 'returned', 'expired', 'other'])(
      'accepts the reason %p that the adjust form offers',
      async (reason) => {
        const res = await request(app)
          .post('/api/stock/adjust')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            product: product._id.toString(),
            branch: branchA._id.toString(),
            adjustment: -1,
            reason
          });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
      }
    );

    it('still rejects a reason below the floor', async () => {
      const res = await request(app)
        .post('/api/stock/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product: product._id.toString(),
          branch: branchA._id.toString(),
          adjustment: -1,
          reason: 'x'
        });

      expect(res.statusCode).toBe(400);
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

    // The three sibling movement routes name their roles; this one carried only
    // protect + checkBranchAccess, which compares branch ids without consulting
    // the role. A mechanic therefore passed both gates for their own branch and
    // could read every restock, sale, transfer and adjustment for it, with the
    // performer's name and email populated.
    it('rejects a mechanic reading the branch movement ledger for their own branch', async () => {
      // regularUser/userToken from the top-level beforeEach is a mechanic
      // assigned to branchA, so checkBranchAccess alone would admit this.
      const res = await request(app)
        .get(`/api/stock/movements/branch/${branchA._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('allows a salesperson the branch movement ledger for their own branch only', async () => {
      const own = await createTestBranch({ name: 'Mv Br Own', code: 'MV-BR-OWN' });
      const other = await createTestBranch({ name: 'Mv Br Other', code: 'MV-BR-OTH' });

      const { token } = await createTestSalesperson(own._id);

      const allowed = await request(app)
        .get(`/api/stock/movements/branch/${own._id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(allowed.status).toBe(200);

      const denied = await request(app)
        .get(`/api/stock/movements/branch/${other._id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(denied.status).toBe(403);
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

// GAP-015d. GET /api/stock, /low-stock, /movements and /transfers had no
// validation chain at all, so their filter values went straight into a Mongo
// filter. Express parses ?x=1&x=2 into an array, and Mongoose rewrites
// {field: [...]} into {field: {$in: [...]}} rather than raising a cast error,
// so a repeated parameter widened the filter.
describe('Stock API - read route query validation', () => {
  it('rejects a malformed branch id on GET /api/stock', async () => {
    const { token } = await createTestAdmin();

    const res = await request(app)
      .get('/api/stock?branch=notanid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('rejects a repeated branch parameter, which Mongoose would widen to $in', async () => {
    const { token } = await createTestAdmin();
    const a = await createTestBranch({ name: 'Alpha', code: 'ALP-1' });
    const b = await createTestBranch({ name: 'Beta', code: 'BET-1' });

    const res = await request(app)
      .get(`/api/stock?branch=${a._id}&branch=${b._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('rejects a non-integer page', async () => {
    const { token } = await createTestAdmin();

    const res = await request(app)
      .get('/api/stock?page=abc')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('rejects an out-of-enum movement type on GET /api/stock/movements', async () => {
    const { token } = await createTestAdmin();

    const res = await request(app)
      .get('/api/stock/movements?type=not_a_type')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('accepts a valid movement type', async () => {
    const { token } = await createTestAdmin();

    const res = await request(app)
      .get('/api/stock/movements?type=restock')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('rejects an out-of-enum transfer status', async () => {
    const { token } = await createTestAdmin();

    const res = await request(app)
      .get('/api/stock/transfers?status=bogus')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('still serves an unfiltered listing', async () => {
    const { token } = await createTestAdmin();

    const res = await request(app)
      .get('/api/stock')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('still serves a valid branch filter', async () => {
    const { token } = await createTestAdmin();
    const branch = await createTestBranch({ name: 'Gamma', code: 'GAM-1' });

    const res = await request(app)
      .get(`/api/stock?branch=${branch._id}&page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});


// GAP-019. The source debit sat inside `if (sourceStock)` while the destination
// credit was unconditional, so completing a transfer whose source row had been
// deleted either invented inventory outright, when the destination row already
// existed, or threw a TypeError dereferencing sourceStock.costPrice on the very
// null the guard had just skipped.
//
// Self-seeding: this block sits outside the main `Stock API Tests` describe, so
// it cannot see that block's shared fixtures.
describe('Transfer completion refuses a missing source row', () => {
  const seed = async () => {
    const from = await createTestBranch({ name: 'Transfer Source', code: 'TR-SRC' });
    const to = await createTestBranch({ name: 'Transfer Dest', code: 'TR-DST' });
    const admin = await createTestAdmin();
    const cat = await createTestCategory({ name: 'Transfer Cat', code: 'TR-CAT' });
    const prod = await createTestProduct({ name: 'Transfer Product', category: cat._id });

    const sourceStock = await createTestStock({
      product: prod._id,
      branch: from._id,
      quantity: 100,
      reservedQuantity: 20,
      costPrice: 200,
      sellingPrice: 250
    });
    const transfer = await StockTransfer.create({
      product: prod._id,
      fromBranch: from._id,
      toBranch: to._id,
      quantity: 20,
      initiatedBy: admin.user._id,
      status: 'in-transit'
    });

    return { from, to, admin, prod, sourceStock, transfer };
  };

  const complete = (transfer, token) =>
    request(app)
      .put(`/api/stock/transfers/${transfer._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' });

  it('does not credit an existing destination row when the source is gone', async () => {
    const { to, admin, prod, sourceStock, transfer } = await seed();
    const destStock = await createTestStock({
      product: prod._id,
      branch: to._id,
      quantity: 5,
      costPrice: 200,
      sellingPrice: 250
    });
    await Stock.findByIdAndDelete(sourceStock._id);

    const res = await complete(transfer, admin.token);

    expect(res.statusCode).toBe(400);
    // The 20 units must not have appeared from nowhere.
    expect((await Stock.findById(destStock._id)).quantity).toBe(5);
  });

  it('does not create a destination row when the source is gone', async () => {
    const { to, admin, prod, sourceStock, transfer } = await seed();
    await Stock.findByIdAndDelete(sourceStock._id);

    const res = await complete(transfer, admin.token);

    expect(res.statusCode).toBe(400);
    expect(await Stock.findOne({ product: prod._id, branch: to._id })).toBeNull();
  });

  it('writes no movement rows for a refused transfer', async () => {
    const { admin, sourceStock, transfer } = await seed();
    await Stock.findByIdAndDelete(sourceStock._id);

    await complete(transfer, admin.token);

    const movements = await StockMovement.find({
      'reference.type': 'StockTransfer',
      'reference.id': transfer._id
    });
    expect(movements).toHaveLength(0);
  });

  it('leaves the transfer un-completed so it can be retried', async () => {
    const { admin, sourceStock, transfer } = await seed();
    await Stock.findByIdAndDelete(sourceStock._id);

    await complete(transfer, admin.token);

    expect((await StockTransfer.findById(transfer._id)).status).not.toBe('completed');
  });

  it('still completes normally when the source row is present', async () => {
    const { from, to, admin, prod, transfer } = await seed();

    const res = await complete(transfer, admin.token);

    expect(res.statusCode).toBe(200);
    expect((await Stock.findOne({ product: prod._id, branch: from._id })).quantity).toBe(80);
    expect((await Stock.findOne({ product: prod._id, branch: to._id })).quantity).toBe(20);
  });
});

// GAP-018. Both adjust endpoints clamped quantity at zero and never consulted
// reservedQuantity. The `available` virtual is
// Math.max(0, quantity - reservedQuantity), so a row left at quantity 0 with
// reservedQuantity 5 simply reads as empty; completing that order then calls
// deductStock(5) against quantity 0, which throws, and the order can never be
// completed or cleanly cancelled.
describe('Stock adjustments respect committed reservations', () => {
  const seed = async (quantity, reservedQuantity) => {
    const from = await createTestBranch({ name: 'Adj Branch', code: 'ADJ-1' });
    const admin = await createTestAdmin();
    const cat = await createTestCategory({ name: 'Adj Cat', code: 'ADJ-CAT' });
    const prod = await createTestProduct({ name: 'Adj Product', category: cat._id });
    const stock = await createTestStock({
      product: prod._id,
      branch: from._id,
      quantity,
      reservedQuantity,
      costPrice: 100,
      sellingPrice: 150
    });
    return { branch: from, admin, prod, stock };
  };

  const adjust = (admin, prod, branch, adjustment) =>
    request(app)
      .post('/api/stock/adjust')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        product: prod._id.toString(),
        branch: branch._id.toString(),
        adjustment,
        reason: 'damaged'
      });

  it('refuses an adjustment that would drop below the reserved level', async () => {
    const { branch, admin, prod, stock } = await seed(5, 5);

    const res = await adjust(admin, prod, branch, -5);

    expect(res.statusCode).toBe(400);
    expect((await Stock.findById(stock._id)).quantity).toBe(5);
  });

  it('names the reserved quantity so the operator can act', async () => {
    const { branch, admin, prod } = await seed(10, 4);

    const res = await adjust(admin, prod, branch, -8);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('4');
  });

  it('writes no movement row for a refused adjustment', async () => {
    const { branch, admin, prod } = await seed(5, 5);

    await adjust(admin, prod, branch, -5);

    const movements = await StockMovement.find({ product: prod._id });
    expect(movements).toHaveLength(0);
  });

  it('allows an adjustment down to exactly the reserved level', async () => {
    const { branch, admin, prod, stock } = await seed(10, 4);

    const res = await adjust(admin, prod, branch, -6);

    expect(res.statusCode).toBe(200);
    expect((await Stock.findById(stock._id)).quantity).toBe(4);
  });

  it('always allows an upward adjustment', async () => {
    const { branch, admin, prod, stock } = await seed(2, 2);

    const res = await adjust(admin, prod, branch, 5);

    expect(res.statusCode).toBe(200);
    expect((await Stock.findById(stock._id)).quantity).toBe(7);
  });

  it('applies the same guard to the by-id adjust route', async () => {
    const { admin, stock } = await seed(5, 5);

    const res = await request(app)
      .put(`/api/stock/${stock._id}/adjust`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ quantity: -5, reason: 'damaged' });

    expect(res.statusCode).toBe(400);
    expect((await Stock.findById(stock._id)).quantity).toBe(5);
  });
});

// GAP-026. getLowStock had no skip and no limit at all, so it returned every
// low-stock row in one response.
describe('Low stock listing is paginated', () => {
  it('caps the page size and reports pagination metadata', async () => {
    const branch = await createTestBranch({ name: 'Low Branch', code: 'LOW-1' });
    const admin = await createTestAdmin();
    const cat = await createTestCategory({ name: 'Low Cat', code: 'LOW-CAT' });

    for (let i = 0; i < 5; i += 1) {
      const prod = await createTestProduct({ name: `Low Product ${i}`, category: cat._id });
      await createTestStock({
        product: prod._id,
        branch: branch._id,
        quantity: 1,
        reorderPoint: 10
      });
    }

    const res = await request(app)
      .get('/api/stock/low-stock?limit=2')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
  });

  it('still returns every row when no limit is given, within the default page', async () => {
    const branch = await createTestBranch({ name: 'Low Branch 2', code: 'LOW-2' });
    const admin = await createTestAdmin();
    const cat = await createTestCategory({ name: 'Low Cat 2', code: 'LOW-CAT2' });
    const prod = await createTestProduct({ name: 'Only Low Product', category: cat._id });
    await createTestStock({
      product: prod._id,
      branch: branch._id,
      quantity: 1,
      reorderPoint: 10
    });

    const res = await request(app)
      .get('/api/stock/low-stock')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('stock list search', () => {
  // The stock list paginates, so filtering the fetched page in the browser
  // searches only the rows already on screen: with 300 SKUs and a 20-row page,
  // a product on page four is unreachable from page one and nothing says so.
  let adminToken;
  let branch;
  let category;

  beforeEach(async () => {
    const admin = await createTestAdmin();
    adminToken = admin.token;
    category = await createTestCategory();
    branch = await createTestBranch();

    const brakePad = await createTestProduct({
      name: 'Front Brake Pad',
      sku: 'BRK-001',
      category: category._id,
      brand: 'Honda',
    });
    const chain = await createTestProduct({
      name: 'Drive Chain',
      sku: 'CHN-001',
      category: category._id,
      brand: 'Yamaha',
    });

    await createTestStock({ product: brakePad._id, branch: branch._id });
    await createTestStock({ product: chain._id, branch: branch._id });
  });

  it('matches on product name and reports the matching total', async () => {
    const res = await request(app)
      .get('/api/stock?search=brake')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].product.sku).toBe('BRK-001');
    // The footer reads this, so it has to be the count of matches, not of rows
    // that happen to be on this page.
    expect(res.body.pagination.total).toBe(1);
  });

  it('matches on SKU and on brand', async () => {
    const bySku = await request(app)
      .get('/api/stock?search=CHN-001')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(bySku.body.data).toHaveLength(1);

    const byBrand = await request(app)
      .get('/api/stock?search=yamaha')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byBrand.body.data).toHaveLength(1);
    expect(byBrand.body.data[0].product.sku).toBe('CHN-001');
  });

  it('returns nothing when the search matches no product', async () => {
    const res = await request(app)
      .get('/api/stock?search=carburettor')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('treats the search as literal text, not as a pattern', async () => {
    const res = await request(app)
      .get('/api/stock?search=.*')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('rejects a repeated search parameter rather than filtering on an array', async () => {
    const res = await request(app)
      .get('/api/stock?search=a&search=b')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(400);
  });

  it('searches branch stock too', async () => {
    const res = await request(app)
      .get(`/api/stock/branch/${branch._id}?search=chain`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].product.sku).toBe('CHN-001');
  });

  it('returns nothing for a category that holds no products', async () => {
    // This used to apply the category filter only when it matched at least one
    // product, so an empty category returned the branch's entire stock list.
    const empty = await createTestCategory({ name: 'Empty', code: 'EMPTY' });

    const res = await request(app)
      .get(`/api/stock/branch/${branch._id}?category=${empty._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('narrows rather than widens when a search and a product filter combine', async () => {
    const chain = await Product.findOne({ sku: 'CHN-001' });

    const res = await request(app)
      .get(`/api/stock?product=${chain._id}&search=brake`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('stock list ordering', () => {
  // Ordering used to be declared and never applied: `.sort({'product.name': 1})`
  // names a path `Stock` does not have, because populate is a second query run
  // after the sort. Paginating an unordered list is the worse half of that, since
  // a row can appear on two pages or on none.
  let adminToken;
  let branch;
  let category;

  const NAMES = ['Alpha Part', 'Bravo Part', 'Charlie Part', 'Delta Part', 'Echo Part'];

  beforeEach(async () => {
    const admin = await createTestAdmin();
    adminToken = admin.token;
    category = await createTestCategory();
    branch = await createTestBranch();

    // Created in a deliberately unsorted order, and with quantities that do not
    // follow the name order, so a passing assertion cannot be insertion order.
    const quantities = { 'Charlie Part': 5, 'Alpha Part': 40, 'Echo Part': 10, 'Bravo Part': 30, 'Delta Part': 20 };
    for (const name of ['Charlie Part', 'Alpha Part', 'Echo Part', 'Bravo Part', 'Delta Part']) {
      const product = await createTestProduct({ name, sku: name.replace(/\s/g, '-'), category: category._id });
      await createTestStock({ product: product._id, branch: branch._id, quantity: quantities[name] });
    }
  });

  const namesFrom = (res) => res.body.data.map((row) => row.product.name);

  it('orders by product name across the whole result set, not within a page', async () => {
    const first = await request(app)
      .get('/api/stock?sortBy=product.name&sortOrder=asc&limit=2&page=1')
      .set('Authorization', `Bearer ${adminToken}`);
    const second = await request(app)
      .get('/api/stock?sortBy=product.name&sortOrder=asc&limit=2&page=2')
      .set('Authorization', `Bearer ${adminToken}`);
    const third = await request(app)
      .get('/api/stock?sortBy=product.name&sortOrder=asc&limit=2&page=3')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(first.statusCode).toBe(200);
    expect([...namesFrom(first), ...namesFrom(second), ...namesFrom(third)]).toEqual(NAMES);
  });

  it('reverses on sortOrder=desc', async () => {
    const res = await request(app)
      .get('/api/stock?sortBy=product.name&sortOrder=desc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(namesFrom(res)).toEqual([...NAMES].reverse());
  });

  it('shows no row twice and skips none across pages', async () => {
    const seen = [];
    for (const page of [1, 2, 3]) {
      const res = await request(app)
        .get(`/api/stock?sortBy=product.name&limit=2&page=${page}`)
        .set('Authorization', `Bearer ${adminToken}`);
      seen.push(...res.body.data.map((row) => row._id));
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('orders by a field on the stock document itself', async () => {
    const res = await request(app)
      .get('/api/stock?sortBy=quantity&sortOrder=asc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.map((row) => row.quantity)).toEqual([5, 10, 20, 30, 40]);
  });

  it('orders by available quantity, which is a virtual and not stored', async () => {
    const res = await request(app)
      .get('/api/stock?sortBy=available&sortOrder=desc')
      .set('Authorization', `Bearer ${adminToken}`);

    const available = res.body.data.map((row) => row.quantity - row.reservedQuantity);
    expect(available).toEqual([...available].sort((a, b) => b - a));
    expect(available[0]).toBe(40);
  });

  it('rejects a sortBy the controller does not honour', async () => {
    const res = await request(app)
      .get('/api/stock?sortBy=password')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(400);
  });

  it('orders branch stock the same way', async () => {
    const res = await request(app)
      .get(`/api/stock/branch/${branch._id}?sortBy=product.name&sortOrder=asc`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(namesFrom(res)).toEqual(NAMES);
  });
});

describe('movement read routes', () => {
  // GET /api/stock/movements and its per-branch sibling received no request
  // from any suite: the ledger could have been unreadable and every test would
  // have stayed green (GAP-045).
  let adminToken;
  let branch;
  let product;

  beforeEach(async () => {
    const admin = await createTestAdmin();
    adminToken = admin.token;
    const category = await createTestCategory();
    branch = await createTestBranch();
    product = await createTestProduct({ category: category._id });

    await createTestStock({ product: product._id, branch: branch._id, quantity: 10 });

    await request(app)
      .post('/api/stock/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ product: product._id.toString(), branch: branch._id.toString(), quantity: 5 });
  });

  it('lists movements', async () => {
    const res = await request(app)
      .get('/api/stock/movements')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  it('filters movements by type', async () => {
    const res = await request(app)
      .get('/api/stock/movements?type=restock')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.every((row) => row.type === 'restock')).toBe(true);
  });

  it('rejects a movement type outside the enum', async () => {
    const res = await request(app)
      .get('/api/stock/movements?type=not-a-type')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(400);
  });

  it('lists movements for one branch', async () => {
    const res = await request(app)
      .get(`/api/stock/movements/branch/${branch._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('404s for a branch that does not exist', async () => {
    const res = await request(app)
      .get('/api/stock/movements/branch/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(404);
  });

  it('lists movements for one product', async () => {
    const res = await request(app)
      .get(`/api/stock/movements/product/${product._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
