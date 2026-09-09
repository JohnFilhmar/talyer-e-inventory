import mongoose from 'mongoose';
import * as dbHandler from './setup/dbHandler.js';
import Counter from '../src/models/Counter.js';
import Category from '../src/models/Category.js';
import Product from '../src/models/Product.js';
import Transaction from '../src/models/Transaction.js';
import {
  highestSuffix,
  monthKey,
  nextIdentifier,
  nextSequence,
  yearKey,
} from '../src/utils/sequence.js';
import { migrateCounters, survey } from '../src/utils/migrateCounters.js';

beforeAll(async () => {
  await dbHandler.connect();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

const makeTransaction = (overrides = {}) => ({
  type: 'sale',
  branch: new mongoose.Types.ObjectId(),
  amount: 100,
  paymentMethod: 'cash',
  processedBy: new mongoose.Types.ObjectId(),
  ...overrides,
});

const makeProduct = async (category, overrides = {}) =>
  Product.create({
    name: 'Brake Pad',
    category: category._id,
    costPrice: 100,
    sellingPrice: 150,
    ...overrides,
  });

describe('nextSequence', () => {
  it('starts at 1 and increments', async () => {
    await expect(nextSequence('demo')).resolves.toBe(1);
    await expect(nextSequence('demo')).resolves.toBe(2);
    await expect(nextSequence('demo')).resolves.toBe(3);
  });

  it('keeps sequences with different keys independent', async () => {
    await nextSequence('salesOrder:2026');
    await nextSequence('salesOrder:2026');

    await expect(nextSequence('salesOrder:2027')).resolves.toBe(1);
    await expect(nextSequence('salesOrder:2026')).resolves.toBe(3);
  });

  // The whole point of the change. countDocuments() + 1 hands the same number
  // to every caller that reads before any of them writes.
  it('gives twenty concurrent callers twenty distinct numbers', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => nextSequence('concurrent'))
    );

    expect(new Set(results).size).toBe(20);
    expect(Math.min(...results)).toBe(1);
    expect(Math.max(...results)).toBe(20);
  });

  it('seeds from existing identifiers on first use, then ignores the seed', async () => {
    await expect(nextSequence('seeded', async () => 41)).resolves.toBe(42);

    // A seed that would rewind the sequence must not be consulted again once
    // the counter exists, or a later allocation could reissue a live number.
    await expect(nextSequence('seeded', async () => 1)).resolves.toBe(43);
  });

  it('does not seed when nothing has been issued yet', async () => {
    await expect(nextSequence('empty', async () => 0)).resolves.toBe(1);
  });

  it('stores one counter document per key', async () => {
    await nextSequence('kept');
    await nextSequence('kept');

    const counter = await Counter.findById('kept').lean();
    expect(counter.seq).toBe(2);
  });
});

describe('nextIdentifier', () => {
  it('formats with a zero-padded width', async () => {
    await expect(nextIdentifier({ key: 'fmt', prefix: 'SO-2026-' })).resolves.toBe(
      'SO-2026-000001'
    );
  });

  it('yearKey and monthKey match the formats the prefixes advertise', () => {
    const when = new Date('2026-03-09T12:00:00');
    expect(yearKey(when)).toBe('2026');
    expect(monthKey(when)).toBe('202603');
  });
});

describe('highestSuffix', () => {
  it('reads the highest number already issued under a prefix', async () => {
    const category = await Category.create({ name: 'Brakes', code: 'BRK' });
    await makeProduct(category, { sku: 'PROD-000007' });
    await makeProduct(category, { sku: 'PROD-000012' });

    await expect(highestSuffix(Product, 'sku', 'PROD-')).resolves.toBe(12);
  });

  it('ignores identifiers that do not match the prefix', async () => {
    const category = await Category.create({ name: 'Brakes', code: 'BRK' });
    await makeProduct(category, { sku: 'LEGACY-SKU-1' });

    await expect(highestSuffix(Product, 'sku', 'PROD-')).resolves.toBe(0);
  });
});

describe('generated identifiers', () => {
  it('numbers transactions in the documented TXN-YYYYMM- format', async () => {
    const transaction = await Transaction.create(makeTransaction());
    expect(transaction.transactionNumber).toBe(`TXN-${monthKey()}-000001`);
  });

  it('gives concurrent transaction writes distinct numbers', async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, () => Transaction.create(makeTransaction()))
    );

    const numbers = created.map((t) => t.transactionNumber);
    expect(new Set(numbers).size).toBe(5);
  });

  it('leaves an explicitly supplied number alone', async () => {
    const transaction = await Transaction.create(
      makeTransaction({ transactionNumber: 'TXN-LEGACY-000001' })
    );
    expect(transaction.transactionNumber).toBe('TXN-LEGACY-000001');
  });

  it('continues past identifiers that already exist', async () => {
    await Transaction.create(
      makeTransaction({ transactionNumber: `TXN-${monthKey()}-000850` })
    );

    const next = await Transaction.create(makeTransaction());
    expect(next.transactionNumber).toBe(`TXN-${monthKey()}-000851`);
  });

  // countDocuments() ran backwards after a delete and reissued a retired
  // number. A counter never goes back.
  it('does not reuse a number after the newest document is deleted', async () => {
    const category = await Category.create({ name: 'Brakes', code: 'BRK' });
    const first = await makeProduct(category);
    const second = await makeProduct(category, { name: 'Chain' });

    expect(first.sku).toBe('PROD-000001');
    expect(second.sku).toBe('PROD-000002');

    await Product.deleteOne({ _id: second._id });
    const third = await makeProduct(category, { name: 'Sprocket' });

    expect(third.sku).toBe('PROD-000003');
  });
});

describe('migrateCounters', () => {
  it('reports the highest identifier per period without writing', async () => {
    const period = monthKey();
    await Transaction.create(
      makeTransaction({ transactionNumber: `TXN-${period}-000009` })
    );

    const planned = await migrateCounters({ log: () => {} });

    expect(planned).toEqual([
      { key: `transaction:${period}`, from: null, to: 9 },
    ]);
    await expect(Counter.findById(`transaction:${period}`)).resolves.toBeNull();
  });

  it('writes the counters under --apply, and is a no-op on a second run', async () => {
    const period = monthKey();
    await Transaction.create(
      makeTransaction({ transactionNumber: `TXN-${period}-000009` })
    );

    await migrateCounters({ apply: true, log: () => {} });
    const counter = await Counter.findById(`transaction:${period}`).lean();
    expect(counter.seq).toBe(9);

    const second = await migrateCounters({ apply: true, log: () => {} });
    expect(second).toEqual([]);
  });

  it('never lowers a counter that is already ahead', async () => {
    const period = monthKey();
    await Transaction.create(
      makeTransaction({ transactionNumber: `TXN-${period}-000002` })
    );
    await Counter.create({ _id: `transaction:${period}`, seq: 500 });

    const planned = await migrateCounters({ apply: true, log: () => {} });

    expect(planned).toEqual([]);
    const counter = await Counter.findById(`transaction:${period}`).lean();
    expect(counter.seq).toBe(500);
  });

  it('groups a survey by the period embedded in the identifier', async () => {
    await Transaction.create(
      makeTransaction({ transactionNumber: 'TXN-202601-000004' })
    );
    await Transaction.create(
      makeTransaction({ transactionNumber: 'TXN-202602-000011' })
    );

    const rows = await survey({
      name: 'transaction',
      model: Transaction,
      field: 'transactionNumber',
      prefix: 'TXN-',
      periodLength: 6,
    });

    expect(rows).toEqual([
      { key: 'transaction:202601', highest: 4 },
      { key: 'transaction:202602', highest: 11 },
    ]);
  });
});
