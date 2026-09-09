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
 * Two of the tests here pass today. The third is the specification for GAP-046
 * and is marked pending rather than left red, because production MongoDB is
 * standalone and the fix is a compensating read-modify-write, not a
 * transaction. When GAP-046 lands, remove the `.skip` first and watch it fail
 * before fixing it.
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

  it('never creates a second order when two replays race, though the loser 500s', async () => {
    // The offline outbox reuses its clientRequestId on every retry, and a
    // dropped response is exactly the case where two arrive at once. The
    // dedupe check is a read followed by a write with nothing between them, so
    // under a true race both requests pass it and the unique index rejects the
    // second insert.
    //
    // What matters holds: exactly one order exists, the stock is committed
    // once, and the losing request's reservation is rolled back rather than
    // stranded. What does not hold is the documented contract, which says a
    // replay answers 200 with the existing order. It answers 500 here.
    //
    // That is not data loss. sync.ts treats a 5xx as retryable and leaves the
    // entry pending, so the retry hits the dedupe path and gets its 200. It is
    // recorded on GAP-046, which owns atomicity on this path, rather than
    // fixed here: catching the duplicate key and answering 200 means deciding
    // what the losing request does about its reservation, which is the same
    // decision GAP-046 has to make.
    const { admin, branch, product, stock } = await setup(100);
    const clientRequestId = '507f1f77bcf86cd799439099';

    const responses = await Promise.all([
      orderFor(admin, branch, product, 1, { clientRequestId }),
      orderFor(admin, branch, product, 1, { clientRequestId }),
    ]);

    const created = responses.filter((r) => r.statusCode === 201);
    expect(created).toHaveLength(1);

    expect(await SalesOrder.countDocuments({ clientRequestId })).toBe(1);

    // No reservation stranded by the request that lost.
    const after = await Stock.findById(stock._id);
    expect(after.reservedQuantity).toBe(0);
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

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('does not oversell when two orders race for the last unit (GAP-046)', async () => {
    // The specification, not a regression guard. Reservation is a read, a
    // modify and a write with no compare-and-set between them, so two requests
    // can both read availableQuantity 1 and both reserve it.
    //
    // Production MongoDB is standalone, so the fix is a conditional update
    // (`findOneAndUpdate` with the availability in the filter) rather than a
    // transaction. Un-skip this when GAP-046 is picked up: it should fail
    // first.
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
