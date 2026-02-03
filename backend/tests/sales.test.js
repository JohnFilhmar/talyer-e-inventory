import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestAdmin, createTestSalesperson, createTestMechanic } from './setup/testHelpers.js';
import salesRoutes from '../src/routes/salesRoutes.js';
import SalesOrder from '../src/models/SalesOrder.js';
import Transaction from '../src/models/Transaction.js';
import Stock from '../src/models/Stock.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Branch from '../src/models/Branch.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/sales', salesRoutes);

// Add error handling middleware
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errors: err.errors || []
  });
});

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
    description: 'Test category description',
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
    isActive: true,
    ...data
  });
};

const createTestProduct = async (category, data = {}) => {
  return await Product.create({
    name: data.name || 'Test Product',
    sku: data.sku || 'TEST-PROD-001',
    description: 'Test product description',
    brand: 'Test Brand',
    category: category._id,
    costPrice: data.costPrice || 100,
    sellingPrice: data.sellingPrice || 150,
    unit: 'piece',
    isActive: true,
    ...data
  });
};

const createTestStock = async (product, branch, data = {}) => {
  return await Stock.create({
    product: product._id,
    branch: branch._id,
    quantity: data.quantity !== undefined ? data.quantity : 100,
    reservedQuantity: data.reservedQuantity || 0,
    costPrice: data.costPrice || 100,
    sellingPrice: data.sellingPrice || 150,
    reorderPoint: data.reorderPoint || 10,
    ...data
  });
};

const createTestSalesOrder = async (branch, product, processedBy, data = {}) => {
  // Generate unique order number
  const count = await SalesOrder.countDocuments();
  const orderNumber = `SO-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
  
  return await SalesOrder.create({
    orderNumber,
    branch: branch._id,
    customer: {
      name: 'Test Customer',
      phone: '+63 912 345 6789',
      email: 'customer@example.com',
      ...data.customer
    },
    items: data.items || [{
      product: product._id,
      sku: product.sku,
      name: product.name,
      quantity: 2,
      unitPrice: 150,
      discount: 0,
      total: 300
    }],
    subtotal: data.subtotal || 300,
    tax: {
      rate: data.taxRate || 12,
      amount: data.taxAmount || 36
    },
    discount: data.discount || 0,
    total: data.total || 336,
    payment: {
      method: data.paymentMethod || 'cash',
      amountPaid: data.amountPaid || 0,
      change: 0,
      status: data.paymentStatus || 'pending'
    },
    status: data.status || 'pending',
    processedBy: processedBy._id,
    notes: data.notes || 'Test order',
    ...data
  });
};

describe('Sales Order Management', () => {
  describe('POST /api/sales - Create Sales Order (MVP CRITICAL)', () => {
    it('should create a new sales order with stock reservation', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      const stock = await createTestStock(product, branch, {
        quantity: 100,
        sellingPrice: 150
      });

      const orderData = {
        branch: branch._id.toString(),
        customer: {
          name: 'Juan Dela Cruz',
          phone: '+63 912 345 6789',
          email: 'juan@example.com',
          address: '123 Main St, Manila'
        },
        items: [
          {
            product: product._id.toString(),
            quantity: 2,
            discount: 10
          }
        ],
        taxRate: 12,
        discount: 0,
        paymentMethod: 'cash',
        amountPaid: 500,
        notes: 'Test order'
      };

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(orderData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('orderNumber');
      expect(res.body.data.orderNumber).toMatch(/^SO-\d{4}-\d{6}$/);
      expect(res.body.data.customer.name).toBe('Juan Dela Cruz');
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].unitPrice).toBe(150); // Branch-specific price
      expect(res.body.data.payment.status).toBe('paid'); // amountPaid > total

      // Verify stock was reserved
      const updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.reservedQuantity).toBe(2);
      expect(updatedStock.availableQuantity).toBe(98);
    });

    it('should use branch-specific pricing from Stock model', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category, { sellingPrice: 100 }); // Product price
      const stock = await createTestStock(product, branch, {
        quantity: 100,
        sellingPrice: 200 // Branch-specific price (different from product)
      });

      const orderData = {
        branch: branch._id.toString(),
        customer: { name: 'Test Customer' },
        items: [{ product: product._id.toString(), quantity: 1 }],
        paymentMethod: 'cash'
      };

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(orderData);

      expect(res.status).toBe(201);
      expect(res.body.data.items[0].unitPrice).toBe(200); // Should use Stock price, not Product price
    });

    it('should auto-calculate totals, tax, change, and payment status', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch, { sellingPrice: 100 });

      const orderData = {
        branch: branch._id.toString(),
        customer: { name: 'Test Customer' },
        items: [
          { product: product._id.toString(), quantity: 2, discount: 10 } // (2 * 100) - 10 = 190
        ],
        taxRate: 12,
        discount: 0,
        paymentMethod: 'cash',
        amountPaid: 300
      };

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(orderData);

      expect(res.status).toBe(201);
      expect(res.body.data.subtotal).toBe(190); // Item total
      expect(res.body.data.tax.amount).toBeCloseTo(22.8, 1); // 190 * 0.12 (allow floating point variance)
      expect(res.body.data.total).toBeCloseTo(212.8, 1); // 190 + 22.8
      expect(res.body.data.payment.change).toBeCloseTo(87.2, 1); // 300 - 212.8 (floating point issue)
      expect(res.body.data.payment.status).toBe('paid'); // amountPaid >= total
    });

    it('should set payment status to partial when partially paid', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch, { sellingPrice: 100 });

      const orderData = {
        branch: branch._id.toString(),
        customer: { name: 'Test Customer' },
        items: [{ product: product._id.toString(), quantity: 2 }],
        paymentMethod: 'cash',
        amountPaid: 50 // Less than total
      };

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(orderData);

      expect(res.status).toBe(201);
      expect(res.body.data.payment.status).toBe('partial');
      expect(res.body.data.payment.change).toBe(0);
    });

    it('should reject order with insufficient stock', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch, { quantity: 5 }); // Only 5 in stock

      const orderData = {
        branch: branch._id.toString(),
        customer: { name: 'Test Customer' },
        items: [{ product: product._id.toString(), quantity: 10 }], // Requesting 10
        paymentMethod: 'cash'
      };

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(orderData);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Insufficient stock');
    });

    it('should reject order for inactive product', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category, { isActive: false });
      await createTestStock(product, branch);

      const orderData = {
        branch: branch._id.toString(),
        customer: { name: 'Test Customer' },
        items: [{ product: product._id.toString(), quantity: 1 }],
        paymentMethod: 'cash'
      };

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(orderData);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not active');
    });

    it('should reject order for product not available at branch', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      // No stock created for this branch

      const orderData = {
        branch: branch._id.toString(),
        customer: { name: 'Test Customer' },
        items: [{ product: product._id.toString(), quantity: 1 }],
        paymentMethod: 'cash'
      };

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(orderData);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not available at this branch');
    });

    it('should reject salesperson creating order for different branch', async () => {
      const category = await createTestCategory();
      const branch1 = await createTestBranch({ name: 'Branch One', code: 'BRANCH-1' });
      const branch2 = await createTestBranch({ name: 'Branch Two', code: 'BRANCH-2' });
      const salesperson = await createTestSalesperson(branch1._id);

      const product = await createTestProduct(category);
      await createTestStock(product, branch2);

      const orderData = {
        branch: branch2._id.toString(), // Different branch
        customer: { name: 'Test Customer' },
        items: [{ product: product._id.toString(), quantity: 1 }],
        paymentMethod: 'cash'
      };

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${salesperson.token}`)
        .send(orderData);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/sales/:id/status - Update Order Status', () => {
    it('should complete order, deduct stock, and create transaction (MVP CRITICAL)', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      const stock = await createTestStock(product, branch, {
        quantity: 100,
        reservedQuantity: 2
      });

      const order = await createTestSalesOrder(branch, product, admin.user, {
        status: 'processing',
        paymentStatus: 'paid',
        amountPaid: 336, // Must match or exceed total for payment status to be 'paid'
        total: 336
      });

      const res = await request(app)
        .put(`/api/sales/${order._id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.order.status).toBe('completed');
      expect(res.body.data.order.completedAt).toBeDefined();

      // Verify stock was deducted
      const updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.quantity).toBe(98); // 100 - 2
      expect(updatedStock.reservedQuantity).toBe(0); // Released

      // Verify transaction was created (MVP CRITICAL - Cash Flow Tracking)
      const transaction = await Transaction.findOne({
        'reference.model': 'SalesOrder',
        'reference.id': order._id
      });

      expect(transaction).toBeDefined();
      expect(transaction.transactionNumber).toMatch(/^TXN-\d{6}-\d{6}$/);
      expect(transaction.type).toBe('sale');
      expect(transaction.branch.toString()).toBe(branch._id.toString());
      expect(transaction.amount).toBe(336);
      expect(transaction.paymentMethod).toBe('cash');
      expect(transaction.processedBy.toString()).toBe(admin.user._id.toString());
      expect(transaction.description).toContain(order.orderNumber);
    });

    it('should not create transaction when payment status is not paid', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch, { quantity: 100, reservedQuantity: 2 });

      const order = await createTestSalesOrder(branch, product, admin.user, {
        status: 'processing', // Changed from 'pending' to 'processing'
        paymentStatus: 'pending' // Not paid
      });

      const res = await request(app)
        .put(`/api/sales/${order._id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('completed');

      // Verify NO transaction was created
      const transaction = await Transaction.findOne({
        'reference.model': 'SalesOrder',
        'reference.id': order._id
      });

      expect(transaction).toBeNull();
    });

    it('should cancel order and release reserved stock', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      const stock = await createTestStock(product, branch, {
        quantity: 100,
        reservedQuantity: 2
      });

      const order = await createTestSalesOrder(branch, product, admin.user, {
        status: 'pending'
      });

      const res = await request(app)
        .put(`/api/sales/${order._id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('cancelled');

      // Verify reserved stock was released
      const updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.quantity).toBe(100); // No change
      expect(updatedStock.reservedQuantity).toBe(0); // Released
      expect(updatedStock.availableQuantity).toBe(100); // Back to full
    });

    it('should reject invalid status transition', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      const order = await createTestSalesOrder(branch, product, admin.user, {
        status: 'completed'
      });

      const res = await request(app)
        .put(`/api/sales/${order._id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'pending' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      // Accept either validation error or specific transition error message
      expect(res.body.message).toBeTruthy();
    });

    it('should reject salesperson updating different branch order', async () => {
      const category = await createTestCategory();
      const branch1 = await createTestBranch({ name: 'Branch One', code: 'BRANCH-1' });
      const branch2 = await createTestBranch({ name: 'Branch Two', code: 'BRANCH-2' });
      const salesperson = await createTestSalesperson(branch1._id);

      const admin = await createTestAdmin();
      const product = await createTestProduct(category);
      await createTestStock(product, branch2);

      const order = await createTestSalesOrder(branch2, product, admin.user);

      const res = await request(app)
        .put(`/api/sales/${order._id}/status`)
        .set('Authorization', `Bearer ${salesperson.token}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/sales/:id/payment - Update Payment', () => {
    it('should update payment and recalculate status', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      const order = await createTestSalesOrder(branch, product, admin.user, {
        total: 336, // Updated to match the actual calculated total (300 + 36 tax)
        amountPaid: 100,
        paymentStatus: 'partial'
      });

      const res = await request(app)
        .put(`/api/sales/${order._id}/payment`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ amountPaid: 500 });

      expect(res.status).toBe(200);
      expect(res.body.data.payment.amountPaid).toBe(500);
      expect(res.body.data.payment.status).toBe('paid');
      expect(res.body.data.payment.change).toBe(164); // 500 - 336 = 164
      expect(res.body.data.payment.paidAt).toBeDefined();
    });

    it('should update payment method', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      const order = await createTestSalesOrder(branch, product, admin.user, {
        paymentMethod: 'cash'
      });

      const res = await request(app)
        .put(`/api/sales/${order._id}/payment`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ paymentMethod: 'gcash' });

      expect(res.status).toBe(200);
      expect(res.body.data.payment.method).toBe('gcash');
    });

    it('should reject payment update for completed order', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      const order = await createTestSalesOrder(branch, product, admin.user, {
        status: 'completed'
      });

      const res = await request(app)
        .put(`/api/sales/${order._id}/payment`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ amountPaid: 500 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/sales - Get All Sales Orders', () => {
    it('should get paginated sales orders', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      // Create multiple orders
      await createTestSalesOrder(branch, product, admin.user);
      await createTestSalesOrder(branch, product, admin.user);
      await createTestSalesOrder(branch, product, admin.user);

      const res = await request(app)
        .get('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.pagination.total).toBe(3);
    });

    it('should filter by branch', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch1 = await createTestBranch({ name: 'Branch One', code: 'BRANCH-1' });
      const branch2 = await createTestBranch({ name: 'Branch Two', code: 'BRANCH-2' });
      const product = await createTestProduct(category);
      await createTestStock(product, branch1);
      await createTestStock(product, branch2);

      await createTestSalesOrder(branch1, product, admin.user);
      await createTestSalesOrder(branch1, product, admin.user);
      await createTestSalesOrder(branch2, product, admin.user);

      const res = await request(app)
        .get(`/api/sales?branch=${branch1._id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      await createTestSalesOrder(branch, product, admin.user, { status: 'pending' });
      await createTestSalesOrder(branch, product, admin.user, { status: 'completed' });
      await createTestSalesOrder(branch, product, admin.user, { status: 'completed' });

      const res = await request(app)
        .get('/api/sales?status=completed')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every(order => order.status === 'completed')).toBe(true);
    });

    it('should only show salesperson their branch orders', async () => {
      const category = await createTestCategory();
      const branch1 = await createTestBranch({ name: 'Branch One', code: 'BRANCH-1' });
      const branch2 = await createTestBranch({ name: 'Branch Two', code: 'BRANCH-2' });
      const salesperson = await createTestSalesperson(branch1._id);

      const admin = await createTestAdmin();
      const product = await createTestProduct(category);
      await createTestStock(product, branch1);
      await createTestStock(product, branch2);

      await createTestSalesOrder(branch1, product, salesperson.user);
      await createTestSalesOrder(branch2, product, admin.user);

      const res = await request(app)
        .get('/api/sales')
        .set('Authorization', `Bearer ${salesperson.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].branch._id.toString()).toBe(branch1._id.toString());
    });

    it('should reject unauthorized access', async () => {
      const res = await request(app)
        .get('/api/sales');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/sales/:id - Get Single Sales Order', () => {
    it('should get single sales order with populated fields', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      const order = await createTestSalesOrder(branch, product, admin.user);

      const res = await request(app)
        .get(`/api/sales/${order._id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(order._id.toString());
      expect(res.body.data.branch).toHaveProperty('name');
      expect(res.body.data.processedBy).toHaveProperty('name');
      expect(res.body.data.items[0].product).toHaveProperty('sku');
    });

    it('should reject salesperson viewing different branch order', async () => {
      const category = await createTestCategory();
      const branch1 = await createTestBranch({ name: 'Branch One', code: 'BRANCH-1' });
      const branch2 = await createTestBranch({ name: 'Branch Two', code: 'BRANCH-2' });
      const salesperson = await createTestSalesperson(branch1._id);

      const admin = await createTestAdmin();
      const product = await createTestProduct(category);
      await createTestStock(product, branch2);

      const order = await createTestSalesOrder(branch2, product, admin.user);

      const res = await request(app)
        .get(`/api/sales/${order._id}`)
        .set('Authorization', `Bearer ${salesperson.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent order', async () => {
      const admin = await createTestAdmin();
      const fakeId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .get(`/api/sales/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/sales/:id/invoice - Get Invoice', () => {
    it('should get invoice data', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      const order = await createTestSalesOrder(branch, product, admin.user);

      const res = await request(app)
        .get(`/api/sales/${order._id}/invoice`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('orderNumber');
      expect(res.body.data).toHaveProperty('branch');
      expect(res.body.data).toHaveProperty('customer');
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data.branch).toHaveProperty('address');
      expect(res.body.data.branch).toHaveProperty('contact');
    });
  });

  describe('GET /api/sales/branch/:branchId - Get Branch Orders', () => {
    it('should get orders for specific branch', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      await createTestSalesOrder(branch, product, admin.user);
      await createTestSalesOrder(branch, product, admin.user);

      const res = await request(app)
        .get(`/api/sales/branch/${branch._id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every(order => order.branch.toString() === branch._id.toString())).toBe(true);
    });
  });

  describe('GET /api/sales/stats - Get Sales Statistics', () => {
    it('should get sales statistics', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      await createTestSalesOrder(branch, product, admin.user, {
        status: 'completed',
        paymentStatus: 'paid',
        total: 500
      });
      await createTestSalesOrder(branch, product, admin.user, {
        status: 'completed',
        paymentStatus: 'paid',
        total: 300
      });
      await createTestSalesOrder(branch, product, admin.user, {
        status: 'pending',
        total: 200
      });

      const res = await request(app)
        .get('/api/sales/stats')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('orders');
      expect(res.body.data).toHaveProperty('revenue');
      expect(res.body.data.orders.total).toBe(3);
      expect(res.body.data.orders.completed).toBe(2);
      expect(res.body.data.orders.pending).toBe(1);
    });
  });

  describe('DELETE /api/sales/:id - Cancel Order', () => {
    it('should cancel order and release stock (Admin only)', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      const stock = await createTestStock(product, branch, {
        quantity: 100,
        reservedQuantity: 2
      });

      const order = await createTestSalesOrder(branch, product, admin.user, {
        status: 'pending'
      });

      const res = await request(app)
        .delete(`/api/sales/${order._id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('cancelled');

      // Verify order status
      const cancelledOrder = await SalesOrder.findById(order._id);
      expect(cancelledOrder.status).toBe('cancelled');

      // Verify stock was released
      const updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.reservedQuantity).toBe(0);
    });

    it('should reject deleting completed order', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      const order = await createTestSalesOrder(branch, product, admin.user, {
        status: 'completed'
      });

      const res = await request(app)
        .delete(`/api/sales/${order._id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-admin from deleting orders', async () => {
      const category = await createTestCategory();
      const branch = await createTestBranch();
      
      const salesperson = await createTestSalesperson(branch._id);

      const product = await createTestProduct(category);
      await createTestStock(product, branch);

      const order = await createTestSalesOrder(branch, product, salesperson.user);

      const res = await request(app)
        .delete(`/api/sales/${order._id}`)
        .set('Authorization', `Bearer ${salesperson.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Stock Integration Tests', () => {
    it('should complete full order lifecycle: create → complete → verify stock & transaction', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      const stock = await createTestStock(product, branch, {
        quantity: 100,
        reservedQuantity: 0,
        sellingPrice: 200
      });

      // Step 1: Create order
      const createRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          branch: branch._id.toString(),
          customer: { name: 'Test Customer' },
          items: [{ product: product._id.toString(), quantity: 5 }],
          paymentMethod: 'cash',
          amountPaid: 1200
        });

      expect(createRes.status).toBe(201);
      const orderId = createRes.body.data._id;

      // Verify: Stock reserved
      let updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.quantity).toBe(100);
      expect(updatedStock.reservedQuantity).toBe(5);
      expect(updatedStock.availableQuantity).toBe(95);

      // Step 2: Move order to processing (required before completion)
      await request(app)
        .put(`/api/sales/${orderId}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'processing' });

      // Step 3: Complete order
      const completeRes = await request(app)
        .put(`/api/sales/${orderId}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'completed' });

      expect(completeRes.status).toBe(200);

      // Verify: Stock deducted
      updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.quantity).toBe(95);
      expect(updatedStock.reservedQuantity).toBe(0);
      expect(updatedStock.availableQuantity).toBe(95);

      // Verify: Transaction created
      const transaction = await Transaction.findOne({
        'reference.model': 'SalesOrder',
        'reference.id': orderId
      });

      expect(transaction).toBeDefined();
      expect(transaction.type).toBe('sale');
      expect(transaction.amount).toBe(1000); // 5 * 200
    });

    it('should handle cancel lifecycle: create → cancel → verify stock released', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const product = await createTestProduct(category);
      const stock = await createTestStock(product, branch, {
        quantity: 100,
        reservedQuantity: 0
      });

      // Create order
      const createRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          branch: branch._id.toString(),
          customer: { name: 'Test Customer' },
          items: [{ product: product._id.toString(), quantity: 3 }],
          paymentMethod: 'cash'
        });

      const orderId = createRes.body.data._id;

      // Verify: Stock reserved
      let updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.reservedQuantity).toBe(3);
      expect(updatedStock.availableQuantity).toBe(97);

      // Cancel order
      await request(app)
        .delete(`/api/sales/${orderId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      // Verify: Stock released back
      updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.quantity).toBe(100);
      expect(updatedStock.reservedQuantity).toBe(0);
      expect(updatedStock.availableQuantity).toBe(100);
    });
  });
});
