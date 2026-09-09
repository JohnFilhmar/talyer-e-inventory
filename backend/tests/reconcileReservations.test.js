import mongoose from 'mongoose';
import * as dbHandler from './setup/dbHandler.js';
import { reconcile, applyCorrections } from '../src/utils/reconcileReservations.js';
import Stock from '../src/models/Stock.js';
import SalesOrder from '../src/models/SalesOrder.js';
import StockTransfer from '../src/models/StockTransfer.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Branch from '../src/models/Branch.js';
import { createTestAdmin } from './setup/testHelpers.js';

beforeAll(async () => {
  await dbHandler.connect();
});
afterEach(async () => {
  await dbHandler.clearDatabase();
});
afterAll(async () => {
  await dbHandler.closeDatabase();
});

const seed = async ({ quantity = 50, reservedQuantity = 0 } = {}) => {
  const branch = await Branch.create({
    name: 'Recon Branch',
    code: 'REC-1',
    address: { street: '1 St', city: 'City', province: 'Province', postalCode: '1000' },
    contact: { phone: '+63 2 1234 5678', email: 'recon@branch.com' },
  });
  const category = await Category.create({ name: 'Recon Cat', code: 'REC-CAT' });
  const product = await Product.create({
    sku: `SKU-REC-${Date.now()}`,
    name: 'Recon Product',
    category: category._id,
    costPrice: 100,
    sellingPrice: 150,
  });
  const stock = await Stock.create({
    product: product._id,
    branch: branch._id,
    quantity,
    reservedQuantity,
    costPrice: 100,
    sellingPrice: 150,
  });
  return { branch, product, stock };
};

const openOrder = async (branch, product, quantity, user, status = 'pending') =>
  SalesOrder.create({
    orderNumber: `SO-${Date.now()}-${Math.random().toString().slice(2, 8)}`,
    branch: branch._id,
    customer: { name: 'Walk In', phone: '09171234567' },
    items: [
      {
        product: product._id,
        sku: product.sku,
        name: product.name,
        quantity,
        unitPrice: 150,
        total: 150 * quantity,
      },
    ],
    subtotal: 150 * quantity,
    total: 150 * quantity,
    payment: { method: 'cash', amountPaid: 0, status: 'pending' },
    status,
    processedBy: user._id,
  });

describe('reconcileReservations', () => {
  it('reports a reservation no open record justifies', async () => {
    const { stock } = await seed({ reservedQuantity: 5 });

    const rows = await reconcile();

    expect(rows).toHaveLength(1);
    expect(String(rows[0].stockId)).toBe(String(stock._id));
    expect(rows[0].stored).toBe(5);
    expect(rows[0].expected).toBe(0);
    expect(rows[0].difference).toBe(5);
  });

  it('reports nothing when the reservation matches an open order', async () => {
    const { branch, product } = await seed({ reservedQuantity: 3 });
    const admin = await createTestAdmin();
    await openOrder(branch, product, 3, admin.user);

    await expect(reconcile()).resolves.toHaveLength(0);
  });

  it('counts an in-transit transfer as holding a reservation', async () => {
    const { branch, product } = await seed({ reservedQuantity: 4 });
    const admin = await createTestAdmin();
    const other = await Branch.create({
      name: 'Recon Dest',
      code: 'REC-2',
      address: { street: '2 St', city: 'City', province: 'Province', postalCode: '1000' },
      contact: { phone: '+63 2 1234 5679', email: 'dest@branch.com' },
    });
    await StockTransfer.create({
      product: product._id,
      fromBranch: branch._id,
      toBranch: other._id,
      quantity: 4,
      initiatedBy: admin.user._id,
      status: 'in-transit',
    });

    await expect(reconcile()).resolves.toHaveLength(0);
  });

  // A completed order no longer holds a reservation: deductStock released it.
  it('does not count a completed order as holding a reservation', async () => {
    const { branch, product } = await seed({ reservedQuantity: 2 });
    const admin = await createTestAdmin();
    await openOrder(branch, product, 2, admin.user, 'completed');

    const rows = await reconcile();

    expect(rows).toHaveLength(1);
    expect(rows[0].difference).toBe(2);
  });

  it('reports an under-reservation too, as a negative difference', async () => {
    const { branch, product } = await seed({ reservedQuantity: 0 });
    const admin = await createTestAdmin();
    await openOrder(branch, product, 6, admin.user);

    const rows = await reconcile();

    expect(rows).toHaveLength(1);
    expect(rows[0].difference).toBe(-6);
  });

  it('writes nothing when only reporting', async () => {
    const { stock } = await seed({ reservedQuantity: 5 });

    await reconcile();

    expect((await Stock.findById(stock._id)).reservedQuantity).toBe(5);
  });

  describe('applyCorrections', () => {
    it('lowers an over-reserved row to what open records justify', async () => {
      const { stock } = await seed({ reservedQuantity: 5 });

      const corrected = await applyCorrections(await reconcile());

      expect(corrected).toBe(1);
      expect((await Stock.findById(stock._id)).reservedQuantity).toBe(0);
    });

    it('never raises an under-reservation', async () => {
      const { branch, product, stock } = await seed({ reservedQuantity: 0 });
      const admin = await createTestAdmin();
      await openOrder(branch, product, 6, admin.user);

      const corrected = await applyCorrections(await reconcile());

      expect(corrected).toBe(0);
      expect((await Stock.findById(stock._id)).reservedQuantity).toBe(0);
    });

    it('leaves a partially justified reservation at the justified level', async () => {
      const { branch, product, stock } = await seed({ reservedQuantity: 9 });
      const admin = await createTestAdmin();
      await openOrder(branch, product, 4, admin.user);

      await applyCorrections(await reconcile());

      expect((await Stock.findById(stock._id)).reservedQuantity).toBe(4);
    });
  });
});
