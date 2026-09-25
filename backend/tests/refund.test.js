import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestAdmin, createTestSalesperson } from './setup/testHelpers.js';
import salesRoutes from '../src/routes/salesRoutes.js';
import SalesOrder from '../src/models/SalesOrder.js';
import Transaction from '../src/models/Transaction.js';
import StockMovement from '../src/models/StockMovement.js';
import Stock from '../src/models/Stock.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Branch from '../src/models/Branch.js';
import { refundSalesOrder } from '../src/utils/salesRefund.js';

const app = express();
app.use(express.json());
app.use('/api/sales', salesRoutes);

beforeAll(async () => dbHandler.connect());
afterEach(async () => dbHandler.clearDatabase());
afterAll(async () => dbHandler.closeDatabase());

let branchSeq = 0;
const makeBranch = () => {
  branchSeq += 1;
  return Branch.create({
    name: `Branch ${branchSeq}`,
    code: `BR-${branchSeq}`,
    address: { street: '1 St', city: 'City', province: 'Prov', postalCode: '1000', country: 'Philippines' },
    contact: { phone: '123-456-7890', email: `b${branchSeq}@example.com` },
    isActive: true,
  });
};

/** A branch, one product stocked at PHP 100, and an admin. */
const setup = async ({ quantity = 10 } = {}) => {
  const branch = await makeBranch();
  const category = await Category.create({ name: 'Parts', code: 'PARTS' });
  const product = await Product.create({
    name: 'Brake pad', sku: 'BP-1', brand: 'X', category: category._id,
    costPrice: 50, sellingPrice: 100, unit: 'piece', isActive: true,
  });
  const stock = await Stock.create({
    product: product._id, branch: branch._id, quantity, costPrice: 50, sellingPrice: 100, reorderPoint: 1,
  });
  const admin = await createTestAdmin();
  return { branch, product, stock, admin };
};

/** A completed, fully paid sale created through the real endpoint. */
const paidSale = async ({ admin, branch, product }, { quantity = 3, taxRate = 0, discount = 0 } = {}) => {
  const res = await request(app)
    .post('/api/sales')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      branch: branch._id.toString(),
      customer: { name: 'Walk-in', phone: '09171234567' },
      items: [{ product: product._id.toString(), quantity }],
      taxRate,
      discount,
      paymentMethod: 'cash',
      amountPaid: 100000,
    });
  expect(res.status).toBe(201);
  expect(res.body.data.status).toBe('completed');
  return res.body.data;
};

const refund = (token, orderId, body) =>
  request(app).post(`/api/sales/${orderId}/refunds`).set('Authorization', `Bearer ${token}`).send(body);

describe('POST /api/sales/:id/refunds (GAP-050)', () => {
  it('refunds part of an order, returns sellable units to stock, and records it everywhere', async () => {
    const ctx = await setup();
    const order = await paidSale(ctx, { quantity: 3 });
    const itemId = order.items[0]._id;

    const res = await refund(ctx.admin.token, order._id, {
      items: [{ itemId, quantity: 2, disposition: 'sellable' }],
      reason: 'wrong size',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.refund.amount).toBe(200);
    expect(res.body.data.order.refundStatus).toBe('partial');
    expect(res.body.data.order.refundedAmount).toBe(200);
    expect(res.body.data.order.payment.status).toBe('paid');

    // 10 in stock, 3 sold, 2 back on the shelf.
    expect((await Stock.findById(ctx.stock._id)).quantity).toBe(9);
    const movement = await StockMovement.findOne({ type: 'sale_return' });
    expect(movement.quantity).toBe(2);
    expect(String(movement.reference.id)).toBe(String(order._id));

    const txn = await Transaction.findOne({ type: 'refund' });
    expect(txn.amount).toBe(200);
    expect(String(txn.branch)).toBe(String(ctx.branch._id));
    expect(txn.description).toContain('wrong size');
  });

  it('refunds the rest as discarded, touches no stock, and ends refunded to the exact centavo', async () => {
    const ctx = await setup();
    const order = await paidSale(ctx, { quantity: 3 });
    const itemId = order.items[0]._id;
    await refund(ctx.admin.token, order._id, { items: [{ itemId, quantity: 1, disposition: 'sellable' }] });
    const stockBefore = (await Stock.findById(ctx.stock._id)).quantity;

    const res = await refund(ctx.admin.token, order._id, {
      items: [{ itemId, quantity: 2, disposition: 'discarded' }],
      reason: 'manufacturer defect',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.order.refundStatus).toBe('full');
    expect(res.body.data.order.payment.status).toBe('refunded');
    expect(res.body.data.order.refundedAmount).toBe(order.total);
    expect((await Stock.findById(ctx.stock._id)).quantity).toBe(stockBefore);
    expect(res.body.data.order.refunds).toHaveLength(2);
    expect(res.body.data.order.refunds[1].items[0].disposition).toBe('discarded');
  });

  it('refunds the share actually paid, including VAT after the order discount', async () => {
    const ctx = await setup();
    // 2 x 100 = 200, less 20 = 180, 12% VAT = 21.60, total 201.60.
    const order = await paidSale(ctx, { quantity: 2, taxRate: 12, discount: 20 });
    expect(order.total).toBe(201.6);
    const itemId = order.items[0]._id;

    const first = await refund(ctx.admin.token, order._id, { items: [{ itemId, quantity: 1, disposition: 'sellable' }] });
    const second = await refund(ctx.admin.token, order._id, { items: [{ itemId, quantity: 1, disposition: 'sellable' }] });

    expect(first.body.data.refund.amount).toBe(100.8);
    expect(second.body.data.refund.amount).toBe(100.8);
    expect(second.body.data.order.refundedAmount).toBe(201.6);
  });

  it('refuses to refund more than is left, and changes nothing', async () => {
    const ctx = await setup();
    const order = await paidSale(ctx, { quantity: 2 });
    const itemId = order.items[0]._id;
    await refund(ctx.admin.token, order._id, { items: [{ itemId, quantity: 1, disposition: 'sellable' }] });

    const res = await refund(ctx.admin.token, order._id, { items: [{ itemId, quantity: 2, disposition: 'sellable' }] });

    expect(res.status).toBe(400);
    const after = await SalesOrder.findById(order._id);
    expect(after.refunds).toHaveLength(1);
    expect(await Transaction.countDocuments({ type: 'refund' })).toBe(1);
  });

  it('refuses an order that has not been paid', async () => {
    const ctx = await setup();
    const res0 = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${ctx.admin.token}`)
      .send({
        branch: ctx.branch._id.toString(),
        customer: { name: 'Walk-in', phone: '09171234567' },
        items: [{ product: ctx.product._id.toString(), quantity: 1 }],
        paymentMethod: 'cash',
      });
    expect(res0.status).toBe(201);

    const res = await refund(ctx.admin.token, res0.body.data._id, {
      items: [{ itemId: res0.body.data.items[0]._id, quantity: 1, disposition: 'sellable' }],
    });
    expect(res.status).toBe(400);
  });

  it("refuses a salesperson from another branch", async () => {
    const ctx = await setup();
    const order = await paidSale(ctx);
    const other = await makeBranch();
    const salesperson = await createTestSalesperson(other._id);

    const res = await refund(salesperson.token, order._id, {
      items: [{ itemId: order.items[0]._id, quantity: 1, disposition: 'sellable' }],
    });
    expect(res.status).toBe(403);
  });

  it('rejects a disposition that is neither sellable nor discarded', async () => {
    const ctx = await setup();
    const order = await paidSale(ctx);
    const res = await refund(ctx.admin.token, order._id, {
      items: [{ itemId: order.items[0]._id, quantity: 1, disposition: 'lost' }],
    });
    expect(res.status).toBe(400);
  });

  it('lets only one of two racing refunds claim the same units', async () => {
    const ctx = await setup();
    const order = await paidSale(ctx, { quantity: 1 });
    const request_ = { items: [{ itemId: order.items[0]._id, quantity: 1, disposition: 'sellable' }] };

    // Two copies loaded before either writes, as two cashiers would have.
    const [a, b] = await Promise.all([SalesOrder.findById(order._id), SalesOrder.findById(order._id)]);
    const results = await Promise.allSettled([
      refundSalesOrder(a, request_, ctx.admin.user),
      refundSalesOrder(b, request_, ctx.admin.user),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.name).toBe('VersionError');
    expect((await SalesOrder.findById(order._id)).refunds).toHaveLength(1);
    expect(await Transaction.countDocuments({ type: 'refund' })).toBe(1);
  });

  it('keeps a fully refunded order refunded when it is saved again later', async () => {
    const ctx = await setup();
    const order = await paidSale(ctx, { quantity: 1 });
    await refund(ctx.admin.token, order._id, {
      items: [{ itemId: order.items[0]._id, quantity: 1, disposition: 'sellable' }],
    });

    const doc = await SalesOrder.findById(order._id);
    doc.notes = 'touched later';
    await doc.save();
    expect((await SalesOrder.findById(order._id)).payment.status).toBe('refunded');
  });

  it('reports revenue net of refunds in the same sales statistics', async () => {
    const ctx = await setup();
    const order = await paidSale(ctx, { quantity: 3 });
    await refund(ctx.admin.token, order._id, {
      items: [{ itemId: order.items[0]._id, quantity: 1, disposition: 'sellable' }],
    });

    const res = await request(app).get('/api/sales/stats').set('Authorization', `Bearer ${ctx.admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.revenue.total).toBe(200);
    expect(res.body.data.refunds).toEqual({ orders: 1, amount: 100 });
  });
});
