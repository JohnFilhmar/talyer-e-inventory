const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const ServiceOrder = require('../src/models/ServiceOrder');
const Transaction = require('../src/models/Transaction');
const Stock = require('../src/models/Stock');
const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const Branch = require('../src/models/Branch');
const User = require('../src/models/User');
const serviceRoutes = require('../src/routes/serviceRoutes');
const errorHandler = require('../src/middleware/errorHandler');
const dbHandler = require('./setup/dbHandler');
const {
  createTestUser,
  createTestAdmin,
  createTestSalesperson,
  createTestMechanic
} = require('./setup/testHelpers');

// Test helper functions
const createTestCategory = async (data = {}) => {
  return await Category.create({
    name: 'Test Category',
    code: 'TEST001',
    description: 'Test category description',
    isActive: true,
    ...data
  });
};

const createTestBranch = async (data = {}) => {
  return await Branch.create({
    name: 'Test Branch',
    code: 'BR001',
    contact: {
      phone: '+63 912 345 6789',
      email: 'branch@example.com'
    },
    address: {
      street: '123 Test Street',
      barangay: 'Test Barangay',
      city: 'Test City',
      province: 'Test Province',
      zipCode: '1234'
    },
    isActive: true,
    ...data
  });
};

const createTestProduct = async (category, data = {}) => {
  return await Product.create({
    sku: `SKU-${Date.now()}`,
    barcode: `BAR-${Date.now()}`,
    name: 'Test Product',
    brand: 'Test Brand',
    description: 'Test product description',
    category: category._id,
    unitOfMeasure: 'pcs',
    costPrice: 100,
    retailPrice: 150,
    sellingPrice: 150,
    isActive: true,
    ...data
  });
};

const createTestStock = async (product, branch, data = {}) => {
  return await Stock.create({
    product: product._id,
    branch: branch._id,
    quantity: data.quantity || 10,
    reservedQuantity: data.reservedQuantity || 0,
    reorderPoint: 5,
    reorderQuantity: 20,
    costPrice: 100,
    sellingPrice: data.sellingPrice || 150,
    location: 'A1',
    ...data
  });
};

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

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/services', serviceRoutes);
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errors: err.errors || []
  });
});

// Test helper to create service order
const createTestServiceOrder = async (branch, mechanic, createdBy, data = {}) => {
  const jobCount = await ServiceOrder.countDocuments();
  const jobNumber = `JOB-${new Date().getFullYear()}-${String(jobCount + 1).padStart(6, '0')}`;
  
  return await ServiceOrder.create({
    jobNumber,
    branch: branch._id,
    customer: {
      name: 'Test Customer',
      phone: '+63 912 345 6789',
      email: 'customer@example.com',
      ...data.customer
    },
    vehicle: {
      make: 'Toyota',
      model: 'Vios',
      year: 2020,
      plateNumber: 'ABC 1234',
      ...data.vehicle
    },
    description: 'Oil change and brake inspection',
    diagnosis: data.diagnosis || 'Regular maintenance',
    assignedTo: mechanic?._id,
    priority: data.priority || 'normal',
    status: data.status || 'pending',
    laborCost: data.laborCost || 500,
    otherCharges: data.otherCharges || 0,
    totalParts: data.totalParts || 0,
    totalAmount: data.totalAmount || 500,
    payment: {
      method: data.paymentMethod || 'cash',
      amountPaid: data.amountPaid || 0,
      status: data.paymentStatus || 'pending'
    },
    partsUsed: data.partsUsed || [],
    createdBy: createdBy._id,
    notes: data.notes || 'Test service order',
    ...data
  });
};

describe('Service Order Management', () => {
  describe('POST /api/services - Create Service Order', () => {
    it('should create a new service order', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();

      const orderData = {
        branch: branch._id.toString(),
        customer: {
          name: 'Juan Dela Cruz',
          phone: '+63 912 345 6789',
          email: 'juan@example.com'
        },
        vehicle: {
          make: 'Honda',
          model: 'Civic',
          year: 2021,
          plateNumber: 'XYZ 5678',
          mileage: 50000
        },
        description: 'Engine overheating issue',
        priority: 'high',
        laborCost: 1000,
        scheduledAt: new Date()
      };

      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(orderData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('jobNumber');
      expect(res.body.data.jobNumber).toMatch(/^JOB-\d{4}-\d{6}$/);
      expect(res.body.data.customer.name).toBe('Juan Dela Cruz');
      expect(res.body.data.vehicle.make).toBe('Honda');
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.priority).toBe('high');
    });

    it('should create service order with assigned mechanic and set status to scheduled', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);

      const orderData = {
        branch: branch._id.toString(),
        customer: { name: 'Test Customer', phone: '+63 912 345 6789' },
        vehicle: { make: 'Toyota', model: 'Vios' },
        description: 'Brake repair',
        assignedTo: mechanic.user._id.toString()
      };

      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(orderData);

      expect(res.status).toBe(201);
      expect(res.body.data.assignedTo).toBeDefined();
      expect(res.body.data.status).toBe('scheduled');
    });

    it('should reject creating service order for different branch (salesperson)', async () => {
      const branch1 = await createTestBranch();
      const branch2 = await createTestBranch({ name: 'Branch 2', code: 'BR002' });
      const salesperson = await createTestSalesperson(branch1._id);

      const orderData = {
        branch: branch2._id.toString(),
        customer: { name: 'Test', phone: '+63 912 345 6789' },
        description: 'Test service'
      };

      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${salesperson.token}`)
        .send(orderData);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid mechanic assignment', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const salesperson = await createTestSalesperson(branch._id);

      const orderData = {
        branch: branch._id.toString(),
        customer: { name: 'Test', phone: '+63 912 345 6789' },
        description: 'Test service',
        assignedTo: salesperson.user._id.toString() // Not a mechanic!
      };

      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(orderData);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('mechanic');
    });

    it('should validate required fields', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject mechanic creating service orders', async () => {
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);

      const orderData = {
        branch: branch._id.toString(),
        customer: { name: 'Test', phone: '+63 912 345 6789' },
        description: 'Test service'
      };

      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send(orderData);

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/services/:id/assign - Assign Mechanic', () => {
    it('should assign mechanic to service order', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, null, admin.user);

      const res = await request(app)
        .put(`/api/services/${order._id}/assign`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ mechanicId: mechanic.user._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.assignedTo).toBeDefined();
      expect(res.body.data.status).toBe('scheduled');
    });

    it('should reassign mechanic', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic1 = await createTestMechanic(branch._id);
      const mechanic2 = await createTestMechanic(branch._id, {
        name: 'Mechanic 2',
        email: 'mechanic2@example.com'
      });
      
      const order = await createTestServiceOrder(branch, mechanic1.user, admin.user, {
        status: 'scheduled'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/assign`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ mechanicId: mechanic2.user._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.assignedTo._id).toBe(mechanic2.user._id.toString());
    });

    it('should reject assigning non-mechanic user', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const salesperson = await createTestSalesperson(branch._id);
      
      const order = await createTestServiceOrder(branch, null, admin.user);

      const res = await request(app)
        .put(`/api/services/${order._id}/assign`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ mechanicId: salesperson.user._id.toString() });

      expect(res.status).toBe(400);
    });

    it('should reject salesperson assigning mechanics', async () => {
      const branch = await createTestBranch();
      const salesperson = await createTestSalesperson(branch._id);
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, null, salesperson.user);

      const res = await request(app)
        .put(`/api/services/${order._id}/assign`)
        .set('Authorization', `Bearer ${salesperson.token}`)
        .send({ mechanicId: mechanic.user._id.toString() });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/services/:id/status - Update Status', () => {
    it('should update service order status to in-progress', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'scheduled'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/status`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send({ status: 'in-progress' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('in-progress');
      expect(res.body.data.order.startedAt).toBeDefined();
    });

    it('should complete service order, deduct parts, and create transaction', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      const product = await createTestProduct(category);
      const stock = await createTestStock(product, branch, {
        quantity: 100,
        sellingPrice: 300
      });

      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'in-progress',
        partsUsed: [{
          product: product._id,
          sku: product.sku,
          name: product.name,
          quantity: 2,
          unitPrice: 300,
          total: 600
        }],
        totalParts: 600,
        laborCost: 500,
        totalAmount: 1100,
        paymentStatus: 'paid',
        amountPaid: 1100,
        paymentMethod: 'cash'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/status`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('completed');
      expect(res.body.data.order.completedAt).toBeDefined();

      // Verify stock deducted
      const updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.quantity).toBe(98);

      // Verify transaction created
      const transaction = await Transaction.findOne({
        'reference.model': 'ServiceOrder',
        'reference.id': order._id
      });
      expect(transaction).toBeDefined();
      expect(transaction.type).toBe('service');
      expect(transaction.amount).toBe(1100);
    });

    it('should not create transaction when payment status is not paid', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'in-progress',
        paymentStatus: 'partial',
        totalAmount: 500
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/status`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);

      const transaction = await Transaction.findOne({
        'reference.model': 'ServiceOrder',
        'reference.id': order._id
      });
      expect(transaction).toBeNull();
    });

    it('should cancel service order', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'scheduled'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('cancelled');
    });

    it('should reject invalid status transition', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'pending'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBeTruthy();
    });

    it('should reject mechanic updating unassigned job', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic1 = await createTestMechanic(branch._id);
      const mechanic2 = await createTestMechanic(branch._id, {
        name: 'Mechanic 2',
        email: 'mechanic2@example.com'
      });
      
      const order = await createTestServiceOrder(branch, mechanic1.user, admin.user, {
        status: 'scheduled'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/status`)
        .set('Authorization', `Bearer ${mechanic2.token}`)
        .send({ status: 'in-progress' });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/services/:id/parts - Update Parts Used', () => {
    it('should add parts to service order', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      const product = await createTestProduct(category);
      await createTestStock(product, branch, { quantity: 50, sellingPrice: 250 });

      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'in-progress'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/parts`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send({
          partsUsed: [
            { product: product._id.toString(), quantity: 3 }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.partsUsed).toHaveLength(1);
      expect(res.body.data.partsUsed[0].quantity).toBe(3);
      expect(res.body.data.partsUsed[0].unitPrice).toBe(250);
      expect(res.body.data.totalParts).toBe(750);
    });

    it('should reject adding parts with insufficient stock', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      const product = await createTestProduct(category);
      await createTestStock(product, branch, { quantity: 5 });

      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'in-progress'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/parts`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send({
          partsUsed: [
            { product: product._id.toString(), quantity: 10 }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient stock');
    });

    it('should reject updating parts for completed order', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      const product = await createTestProduct(category);
      await createTestStock(product, branch, { quantity: 50 });

      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'completed'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/parts`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send({
          partsUsed: [
            { product: product._id.toString(), quantity: 2 }
          ]
        });

      expect(res.status).toBe(400);
    });

    it('should reject mechanic updating unassigned job parts', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const mechanic1 = await createTestMechanic(branch._id);
      const mechanic2 = await createTestMechanic(branch._id, {
        name: 'Mechanic 2',
        email: 'mechanic2@example.com'
      });
      const product = await createTestProduct(category);
      await createTestStock(product, branch, { quantity: 50 });

      const order = await createTestServiceOrder(branch, mechanic1.user, admin.user, {
        status: 'in-progress'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/parts`)
        .set('Authorization', `Bearer ${mechanic2.token}`)
        .send({
          partsUsed: [
            { product: product._id.toString(), quantity: 2 }
          ]
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/services/:id/payment - Update Payment', () => {
    it('should update payment information', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        laborCost: 1000
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/payment`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          paymentMethod: 'card',
          amountPaid: 500
        });

      expect(res.status).toBe(200);
      expect(res.body.data.payment.method).toBe('card');
      expect(res.body.data.payment.amountPaid).toBe(500);
      expect(res.body.data.payment.status).toBe('partial');
    });

    it('should create transaction when completing payment for completed order', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'completed',
        totalAmount: 1000,
        paymentStatus: 'partial',
        amountPaid: 500
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/payment`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          paymentMethod: 'cash',
          amountPaid: 1000
        });

      expect(res.status).toBe(200);
      expect(res.body.data.payment.status).toBe('paid');

      const transaction = await Transaction.findOne({
        'reference.model': 'ServiceOrder',
        'reference.id': order._id
      });
      expect(transaction).toBeDefined();
    });

    it('should reject payment update for cancelled order', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'cancelled'
      });

      const res = await request(app)
        .put(`/api/services/${order._id}/payment`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          amountPaid: 500
        });

      expect(res.status).toBe(400);
    });

    it('should reject mechanic updating payment', async () => {
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      const admin = await createTestAdmin();
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user);

      const res = await request(app)
        .put(`/api/services/${order._id}/payment`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send({
          amountPaid: 500
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/services - Get All Service Orders', () => {
    it('should get paginated service orders', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      await createTestServiceOrder(branch, mechanic.user, admin.user);
      await createTestServiceOrder(branch, mechanic.user, admin.user);

      const res = await request(app)
        .get('/api/services')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.pagination).toBeDefined();
    });

    it('should filter by status', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      await createTestServiceOrder(branch, mechanic.user, admin.user, { status: 'pending' });
      await createTestServiceOrder(branch, mechanic.user, admin.user, { status: 'completed' });

      const res = await request(app)
        .get('/api/services?status=pending')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every(order => order.status === 'pending')).toBe(true);
    });

    it('should filter by priority', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      await createTestServiceOrder(branch, mechanic.user, admin.user, { priority: 'urgent' });
      await createTestServiceOrder(branch, mechanic.user, admin.user, { priority: 'normal' });

      const res = await request(app)
        .get('/api/services?priority=urgent')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every(order => order.priority === 'urgent')).toBe(true);
    });

    it('should only show mechanic their assigned jobs', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic1 = await createTestMechanic(branch._id);
      const mechanic2 = await createTestMechanic(branch._id, {
        name: 'Mechanic 2',
        email: 'mechanic2@example.com'
      });
      
      await createTestServiceOrder(branch, mechanic1.user, admin.user);
      await createTestServiceOrder(branch, mechanic2.user, admin.user);

      const res = await request(app)
        .get('/api/services')
        .set('Authorization', `Bearer ${mechanic1.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every(order => 
        order.assignedTo._id === mechanic1.user._id.toString()
      )).toBe(true);
    });
  });

  describe('GET /api/services/my-jobs - Get Mechanic Jobs', () => {
    it('should get mechanic assigned jobs', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      await createTestServiceOrder(branch, mechanic.user, admin.user, { status: 'scheduled' });
      await createTestServiceOrder(branch, mechanic.user, admin.user, { status: 'in-progress' });

      const res = await request(app)
        .get('/api/services/my-jobs')
        .set('Authorization', `Bearer ${mechanic.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every(order => 
        order.assignedTo._id === mechanic.user._id.toString()
      )).toBe(true);
    });

    it('should reject non-mechanic accessing my-jobs', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .get('/api/services/my-jobs')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/services/:id - Get Single Service Order', () => {
    it('should get single service order', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user);

      const res = await request(app)
        .get(`/api/services/${order._id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(order._id.toString());
      expect(res.body.data.jobNumber).toBe(order.jobNumber);
    });

    it('should reject mechanic viewing unassigned job', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic1 = await createTestMechanic(branch._id);
      const mechanic2 = await createTestMechanic(branch._id, {
        name: 'Mechanic 2',
        email: 'mechanic2@example.com'
      });
      
      const order = await createTestServiceOrder(branch, mechanic1.user, admin.user);

      const res = await request(app)
        .get(`/api/services/${order._id}`)
        .set('Authorization', `Bearer ${mechanic2.token}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent order', async () => {
      const admin = await createTestAdmin();
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .get(`/api/services/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/services/:id/invoice - Get Invoice', () => {
    it('should get service invoice', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'completed',
        laborCost: 1000,
        otherCharges: 500
      });

      const res = await request(app)
        .get(`/api/services/${order._id}/invoice`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.jobNumber).toBe(order.jobNumber);
      expect(res.body.data.totalAmount).toBe(1500);
      expect(res.body.data.laborCost).toBe(1000);
    });
  });

  describe('DELETE /api/services/:id - Cancel Service Order', () => {
    it('should cancel service order (Admin only)', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user);

      const res = await request(app)
        .delete(`/api/services/${order._id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
    });

    it('should reject cancelling completed order', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user, {
        status: 'completed'
      });

      const res = await request(app)
        .delete(`/api/services/${order._id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });

    it('should reject non-admin from cancelling orders', async () => {
      const admin = await createTestAdmin();
      const branch = await createTestBranch();
      const salesperson = await createTestSalesperson(branch._id);
      const mechanic = await createTestMechanic(branch._id);
      
      const order = await createTestServiceOrder(branch, mechanic.user, admin.user);

      const res = await request(app)
        .delete(`/api/services/${order._id}`)
        .set('Authorization', `Bearer ${salesperson.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full service lifecycle: create → assign → start → complete → verify', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();
      const branch = await createTestBranch();
      const mechanic = await createTestMechanic(branch._id);
      const product = await createTestProduct(category);
      const stock = await createTestStock(product, branch, {
        quantity: 100,
        sellingPrice: 400
      });

      // Step 1: Create service order
      const createRes = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          branch: branch._id.toString(),
          customer: { name: 'Test Customer', phone: '+63 912 345 6789' },
          vehicle: { make: 'Toyota', model: 'Vios', plateNumber: 'ABC 1234' },
          description: 'Engine repair',
          laborCost: 2000
        });

      expect(createRes.status).toBe(201);
      const orderId = createRes.body.data._id;

      // Step 2: Assign mechanic
      const assignRes = await request(app)
        .put(`/api/services/${orderId}/assign`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ mechanicId: mechanic.user._id.toString() });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.status).toBe('scheduled');

      // Step 3: Start work
      const startRes = await request(app)
        .put(`/api/services/${orderId}/status`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send({ status: 'in-progress' });

      expect(startRes.status).toBe(200);

      // Step 4: Add parts
      const partsRes = await request(app)
        .put(`/api/services/${orderId}/parts`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send({
          partsUsed: [
            { product: product._id.toString(), quantity: 3 }
          ]
        });

      expect(partsRes.status).toBe(200);
      expect(partsRes.body.data.totalParts).toBe(1200);

      // Step 5: Update payment
      const paymentRes = await request(app)
        .put(`/api/services/${orderId}/payment`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          paymentMethod: 'cash',
          amountPaid: 3200
        });

      expect(paymentRes.status).toBe(200);

      // Step 6: Complete service
      const completeRes = await request(app)
        .put(`/api/services/${orderId}/status`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .send({ status: 'completed' });

      expect(completeRes.status).toBe(200);

      // Verify: Stock deducted
      const updatedStock = await Stock.findById(stock._id);
      expect(updatedStock.quantity).toBe(97);

      // Verify: Transaction created
      const transaction = await Transaction.findOne({
        'reference.model': 'ServiceOrder',
        'reference.id': orderId
      });
      expect(transaction).toBeDefined();
      expect(transaction.amount).toBe(3200);
    });
  });
});
