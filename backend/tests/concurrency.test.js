import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestAdmin } from './setup/testHelpers.js';
import salesRoutes from '../src/routes/salesRoutes.js';
import Stock from '../src/models/Stock.js';
import StockMovement from '../src/models/StockMovement.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Branch from '../src/models/Branch.js';
import SalesOrder from '../src/models/SalesOrder.js';

/**
 * Concurrency against a single stock row.
 *
 * No suite fired two requests at the same document before this one: every
 * request in every suite was awaited sequentially, so the lost-update shape
 * GAP-046 describes was entirely unprobed.
 *
 * GAP-046 made every stock-mutating operation a transaction, so two writers on
 * one row conflict and the loser retries against what the winner committed.
 */
const app = express();
app.use(express.json());
app.use('/api/sales', salesRoutes);
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

const setup = async (quantity) => {
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
    quantity,
    costPrice: 100,
    sellingPrice: 150,
  });

  return { admin, branch, product, stock };
};

const orderFor = (admin, branch, product, quantity, extra = {}) =>
  request(app)
    .post('/api/sales')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      branch: branch._id.toString(),
      customer: { name: 'Walk-in', phone: '09171234567' },
      items: [{ product: product._id.toString(), quantity }],
      paymentMethod: 'cash',
      ...extra,
    });

describe('concurrent order creation', () => {
  it('gives every concurrent order its own number and persists all of them', async () => {
    const { admin, branch, product } = await setup(100);

    const responses = await Promise.all([
      orderFor(admin, branch, product, 1),
      orderFor(admin, branch, product, 1),
      orderFor(admin, branch, product, 1),
      orderFor(admin, branch, product, 1),
      orderFor(admin, branch, product, 1),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([201, 201, 201, 201, 201]);
    const numbers = responses.map((r) => r.body.data.orderNumber);
    expect(new Set(numbers).size).toBe(5);
  });

  it('answers the loser of a racing replay with 200 and the same order', async () => {
    // The offline outbox reuses its clientRequestId on every retry, and a
    // dropped response is exactly the case where two arrive at once. Both can
    // pass the dedupe read before either inserts. The loser's transaction
    // aborts, which rolls its reservation back, and it answers with the
    // winner's order as a sequential replay would.
    //
    // The reservation assertion failed intermittently under load before
    // GAP-046, when the rollback was a cleanup racing the failure it undid.
    const { admin, branch, product, stock } = await setup(100);
    const clientRequestId = '507f1f77bcf86cd799439099';

    const responses = await Promise.all([
      orderFor(admin, branch, product, 1, { clientRequestId }),
      orderFor(admin, branch, product, 1, { clientRequestId }),
    ]);

    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    expect(responses[0].body.data._id).toBe(responses[1].body.data._id);
    expect(await SalesOrder.countDocuments({ clientRequestId })).toBe(1);

    const after = await Stock.findById(stock._id);
    expect(after.reservedQuantity).toBe(1);
    expect(after.quantity).toBe(100);
  });

  it('answers a sequential replay with 200 and the same order', async () => {
    // The contract the race above cannot honour, in the ordinary case it was
    // written for.
    const { admin, branch, product } = await setup(100);
    const clientRequestId = '507f1f77bcf86cd799439098';

    const first = await orderFor(admin, branch, product, 1, { clientRequestId });
    const replay = await orderFor(admin, branch, product, 1, { clientRequestId });

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(replay.body.data._id).toBe(first.body.data._id);
  });

  it('does not oversell when two orders race for the last unit (GAP-046)', async () => {
    // Reservation is a read, a modify and a write, so without a transaction
    // two requests could both read availableQuantity 1 and both reserve it.
    const { admin, branch, product, stock } = await setup(1);

    const responses = await Promise.all([
      orderFor(admin, branch, product, 1),
      orderFor(admin, branch, product, 1),
    ]);

    const accepted = responses.filter((r) => r.statusCode === 201);
    expect(accepted).toHaveLength(1);

    const after = await Stock.findById(stock._id);
    expect(after.reservedQuantity).toBeLessThanOrEqual(1);
    expect(after.quantity - after.reservedQuantity).toBeGreaterThanOrEqual(0);
  });

  it('loses no update when two completed sales deduct from one row at once', async () => {
    // The lost update GAP-046 describes: both read 10, both write 7. Paid in
    // full, each order completes on creation and deducts its three units.
    const { admin, branch, product, stock } = await setup(10);

    const responses = await Promise.all([
      orderFor(admin, branch, product, 3, { amountPaid: 450 }),
      orderFor(admin, branch, product, 3, { amountPaid: 450 }),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
    const after = await Stock.findById(stock._id);
    expect(after.quantity).toBe(4);
    expect(after.reservedQuantity).toBe(0);

    // Each ledger row records the transition that actually persisted.
    const movements = await StockMovement.find({ stock: stock._id, type: 'sale' }).sort({ quantityBefore: -1 });
    expect(movements.map((m) => [m.quantityBefore, m.quantityAfter])).toEqual([[10, 7], [7, 4]]);
  });
});

describe('the ledger reconciles with the quantity it explains', () => {
  it('sums its movements to the change in quantity', async () => {
    // The invariant the ledger exists to support: replaying every row must
    // arrive at the quantity on the stock document.
    const { admin, branch, product, stock } = await setup(20);

    await orderFor(admin, branch, product, 3, { amountPaid: 450 });
    await orderFor(admin, branch, product, 2, { amountPaid: 300 });

    const movements = await StockMovement.find({ stock: stock._id }).sort({ createdAt: 1 });
    expect(movements.length).toBeGreaterThan(0);

    const first = movements[0];
    const last = movements[movements.length - 1];
    const netFromLedger = last.quantityAfter - first.quantityBefore;

    const after = await Stock.findById(stock._id);
    expect(after.quantity).toBe(last.quantityAfter);
    expect(netFromLedger).toBe(after.quantity - 20);
  });
});
