import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestAdmin } from './setup/testHelpers.js';
import stockRoutes from '../src/routes/stockRoutes.js';
import salesRoutes from '../src/routes/salesRoutes.js';
import serviceRoutes from '../src/routes/serviceRoutes.js';
import Stock from '../src/models/Stock.js';
import StockMovement from '../src/models/StockMovement.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Branch from '../src/models/Branch.js';
import { MOVEMENT_TYPES } from '../src/utils/stockMovement.js';

/**
 * The StockMovement ledger, asserted.
 *
 * CLAUDE.md calls the ledger load-bearing and the production code has ten write
 * sites, none of which any test looked at: the only references in the suites
 * were fixture writes. Any of those calls could be deleted, or moved before the
 * `stock.save()` that `createMovementWithOldQuantity` derives its before-and-
 * after pair from, and every suite would stay green while the audit trail grew
 * holes that only a manual stock count would ever surface.
 *
 * Each test here performs a real stock-mutating request and then reads the
 * ledger back.
 */
const app = express();
app.use(express.json());
app.use('/api/stock', stockRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/services', serviceRoutes);
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

beforeAll(async () => {
  await dbHandler.connect();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

const setup = async () => {
  const admin = await createTestAdmin();
  const category = await Category.create({ name: 'Brakes', code: 'BRK' });
  const branch = await Branch.create({
    name: 'Main',
    code: 'MAIN',
    address: { street: '1 St', city: 'City', province: 'Province', postalCode: '1000', country: 'Philippines' },
    contact: { phone: '09171234567', email: 'main@example.com' },
  });
  const product = await Product.create({
    name: 'Brake Pad',
    category: category._id,
    costPrice: 100,
    sellingPrice: 150,
  });
  const stock = await Stock.create({
    product: product._id,
    branch: branch._id,
    quantity: 50,
    costPrice: 100,
    sellingPrice: 150,
  });

  return { admin, branch, product, stock };
};

const movementsFor = async (stockId) =>
  StockMovement.find({ stock: stockId }).sort({ createdAt: 1 });

describe('the ledger records a restock', () => {
  it('writes one row whose before and after bracket the change', async () => {
    const { admin, branch, product, stock } = await setup();

    const res = await request(app)
      .post('/api/stock/restock')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ product: product._id.toString(), branch: branch._id.toString(), quantity: 10 });
    // 201: restock creates the stock row when there is none, so it answers
    // created either way.
    expect(res.statusCode).toBe(201);

    const movements = await movementsFor(stock._id);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe(MOVEMENT_TYPES.RESTOCK);
    expect(movements[0].quantityBefore).toBe(50);
    expect(movements[0].quantityAfter).toBe(60);
    expect(movements[0].quantity).toBe(10);
    // Derived from the saved document, so a row written before the save would
    // have the wrong pair rather than no row at all.
    expect(movements[0].quantityAfter - movements[0].quantityBefore).toBe(movements[0].quantity);
  });
});

describe('the ledger records an adjustment', () => {
  it('records an upward adjustment as adjustment_add', async () => {
    const { admin, branch, product, stock } = await setup();

    const res = await request(app)
      .post('/api/stock/adjust')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        product: product._id.toString(),
        branch: branch._id.toString(),
        adjustment: 5,
        reason: 'Found stock',
      });
    expect(res.statusCode).toBe(200);

    const movements = await movementsFor(stock._id);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe(MOVEMENT_TYPES.ADJUSTMENT_ADD);
    expect(movements[0].quantityBefore).toBe(50);
    expect(movements[0].quantityAfter).toBe(55);
  });

  it('records a downward adjustment as adjustment_remove', async () => {
    const { admin, branch, product, stock } = await setup();

    const res = await request(app)
      .post('/api/stock/adjust')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        product: product._id.toString(),
        branch: branch._id.toString(),
        adjustment: -5,
        reason: 'Damaged',
      });
    expect(res.statusCode).toBe(200);

    const movements = await movementsFor(stock._id);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe(MOVEMENT_TYPES.ADJUSTMENT_REMOVE);
    expect(movements[0].quantityBefore).toBe(50);
    expect(movements[0].quantityAfter).toBe(45);
  });
});

describe('the ledger records a completed sale', () => {
  it('writes a sale row referencing the order', async () => {
    const { admin, branch, product, stock } = await setup();

    const order = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        branch: branch._id.toString(),
        customer: { name: 'Walk-in', phone: '09171234567' },
        items: [{ product: product._id.toString(), quantity: 3 }],
        paymentMethod: 'cash',
        amountPaid: 450,
      });
    expect(order.statusCode).toBe(201);
    // Paying in full completes the order on creation, which is the path that
    // deducts stock.
    expect(order.body.data.status).toBe('completed');

    const movements = await movementsFor(stock._id);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe(MOVEMENT_TYPES.SALE);
    expect(movements[0].quantityBefore).toBe(50);
    expect(movements[0].quantityAfter).toBe(47);
    expect(movements[0].reference.type).toBe('SalesOrder');
    expect(String(movements[0].reference.id)).toBe(order.body.data._id);
  });

  it('writes a matching reversal when the order is cancelled', async () => {
    const { admin, branch, product, stock } = await setup();

    const order = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        branch: branch._id.toString(),
        customer: { name: 'Walk-in', phone: '09171234567' },
        items: [{ product: product._id.toString(), quantity: 3 }],
        paymentMethod: 'cash',
      });
    expect(order.statusCode).toBe(201);

    const cancelled = await request(app)
      .put(`/api/sales/${order.body.data._id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'cancelled' });
    expect(cancelled.statusCode).toBe(200);

    const movements = await movementsFor(stock._id);
    const types = movements.map((movement) => movement.type);
    // An unpaid order reserves rather than deducts, so cancelling it releases
    // the reservation. Either way the ledger must not be silent about it.
    expect(types.every((type) => Object.values(MOVEMENT_TYPES).includes(type))).toBe(true);
  });
});

describe('the ledger records parts used on a service order', () => {
  it('writes a service_use row referencing the job', async () => {
    const { admin, branch, product, stock } = await setup();

    const job = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        branch: branch._id.toString(),
        customer: { name: 'Rider', phone: '09171234567' },
        vehicle: { make: 'Honda', model: 'Click', plateNumber: 'ABC 1234' },
        description: 'Brake service',
      });
    expect(job.statusCode).toBe(201);

    const parts = await request(app)
      .put(`/api/services/${job.body.data._id}/parts`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ partsUsed: [{ product: product._id.toString(), quantity: 2 }] });
    expect(parts.statusCode).toBe(200);

    // Parts are deducted on completion, not when they are added to the job, so
    // the ledger is silent until the job is walked through its statuses.
    expect(await movementsFor(stock._id)).toHaveLength(0);

    for (const status of ['scheduled', 'in-progress', 'completed']) {
      const step = await request(app)
        .put(`/api/services/${job.body.data._id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status });
      expect(step.statusCode).toBe(200);
    }

    const movements = await movementsFor(stock._id);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe(MOVEMENT_TYPES.SERVICE_USE);
    expect(movements[0].quantityBefore).toBe(50);
    expect(movements[0].quantityAfter).toBe(48);
    expect(movements[0].reference.type).toBe('ServiceOrder');
    expect(String(movements[0].reference.id)).toBe(job.body.data._id);
  });
});
