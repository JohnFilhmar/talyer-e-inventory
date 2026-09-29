import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import publicRoutes from '../src/routes/publicRoutes.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import MotorcycleModel from '../src/models/MotorcycleModel.js';
import Branch from '../src/models/Branch.js';
import Stock from '../src/models/Stock.js';

/**
 * The public storefront API. Nothing here sends a token: these routes are
 * reachable by anyone, which is why every response is scanned for fields that
 * must never leave the building.
 */
const app = express();
app.use(express.json());
app.use('/api/public', publicRoutes);

beforeAll(async () => {
  await dbHandler.connect();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

const FORBIDDEN = ['costPrice', 'profitMargin', 'quantity', 'reservedQuantity', 'reorderPoint'];

const collectKeys = (value, keys = new Set()) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
};

const expectNoPrivateFields = (body) => {
  const keys = collectKeys(body);
  FORBIDDEN.forEach((key) => expect(keys.has(key)).toBe(false));
};

const branchData = (code, isActive = true) => ({
  name: `Branch ${code}`,
  code,
  isActive,
  address: { street: '1 St', city: `City ${code}`, province: 'Province', postalCode: '1000', country: 'Philippines' },
  contact: { phone: '09171234567', email: `${code.toLowerCase()}@example.com` },
});

const seed = async () => {
  const brakes = await Category.create({ name: 'Brakes', code: 'BRK' });
  const oils = await Category.create({ name: 'Oils', code: 'OIL' });
  const click = await MotorcycleModel.create({ make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023 });
  const main = await Branch.create(branchData('MAIN'));
  const north = await Branch.create(branchData('NORTH'));
  const closed = await Branch.create(branchData('SHUT', false));

  const pad = await Product.create({
    name: 'Brake Pad', brand: 'Yamaha', category: brakes._id, costPrice: 100, sellingPrice: 150,
    motorcycleModels: [click._id],
  });
  const oil = await Product.create({ name: 'Engine Oil', brand: 'Shell', category: oils._id, costPrice: 200, sellingPrice: 300 });
  const reserved = await Product.create({ name: 'Chain', category: brakes._id, costPrice: 50, sellingPrice: 80 });
  await Product.create({ name: 'Old Part', category: brakes._id, costPrice: 1, sellingPrice: 2, isDiscontinued: true });
  await Product.create({ name: 'Hidden Part', category: brakes._id, costPrice: 1, sellingPrice: 2, isActive: false });

  await Stock.create({ product: pad._id, branch: main._id, quantity: 10, reorderPoint: 2, costPrice: 100, sellingPrice: 150 });
  await Stock.create({ product: pad._id, branch: north._id, quantity: 2, reorderPoint: 2, costPrice: 100, sellingPrice: 150 });
  await Stock.create({ product: pad._id, branch: closed._id, quantity: 9, reorderPoint: 2, costPrice: 100, sellingPrice: 150 });
  await Stock.create({
    product: reserved._id, branch: main._id, quantity: 5, reservedQuantity: 5, reorderPoint: 1,
    costPrice: 50, sellingPrice: 80,
  });

  return { brakes, click, pad, oil, reserved };
};

describe('GET /api/public/products', () => {
  it('lists only active, non-discontinued products without a token', async () => {
    await seed();
    const res = await request(app).get('/api/public/products');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.map((p) => p.name).sort()).toEqual(['Brake Pad', 'Chain', 'Engine Oil']);
    expect(res.body.pagination).toEqual({ page: 1, limit: 24, total: 3, pages: 1 });
    expectNoPrivateFields(res.body);
  });

  it('counts only active branches with available stock', async () => {
    await seed();
    const res = await request(app).get('/api/public/products');
    const byName = Object.fromEntries(res.body.data.map((p) => [p.name, p.availableAt]));

    expect(byName).toEqual({ 'Brake Pad': 2, Chain: 0, 'Engine Oil': 0 });
  });

  it('filters by category, fitment and mixed search', async () => {
    const { brakes, click } = await seed();

    const byCategory = await request(app).get(`/api/public/products?category=${brakes._id}`);
    expect(byCategory.body.data.map((p) => p.name).sort()).toEqual(['Brake Pad', 'Chain']);

    const byFitment = await request(app).get(`/api/public/products?motorcycleModel=${click._id}`);
    expect(byFitment.body.data.map((p) => p.name)).toEqual(['Brake Pad']);

    const byBike = await request(app).get('/api/public/products?search=click');
    expect(byBike.body.data.map((p) => p.name)).toEqual(['Brake Pad']);

    const byBrand = await request(app).get('/api/public/products?search=shell');
    expect(byBrand.body.data.map((p) => p.name)).toEqual(['Engine Oil']);
  });

  it('sorts and clamps the page size', async () => {
    await seed();

    const cheap = await request(app).get('/api/public/products?sort=price_asc');
    expect(cheap.body.data.map((p) => p.sellingPrice)).toEqual([80, 150, 300]);

    const big = await request(app).get('/api/public/products?limit=500');
    expect(big.body.pagination.limit).toBe(48);

    const junkSort = await request(app).get('/api/public/products?sort=costPrice');
    expect(junkSort.statusCode).toBe(200);
  });

  it('refuses a malformed category id', async () => {
    const res = await request(app).get('/api/public/products?category=abc');
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/public/products/:id', () => {
  it('returns branch labels from available stock and no private fields', async () => {
    const { pad, reserved } = await seed();

    const res = await request(app).get(`/api/public/products/${pad._id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.branches).toEqual([
      expect.objectContaining({ name: 'Branch MAIN', city: 'City MAIN', status: 'in-stock' }),
      expect.objectContaining({ name: 'Branch NORTH', status: 'low-stock' }),
    ]);
    expect(res.body.data.availableAt).toBe(2);
    expectNoPrivateFields(res.body);

    const chain = await request(app).get(`/api/public/products/${reserved._id}`);
    expect(chain.body.data.branches).toEqual([expect.objectContaining({ status: 'out-of-stock' })]);
  });

  it('answers 404 for discontinued, inactive, missing and malformed ids', async () => {
    await seed();
    const old = await Product.findOne({ name: 'Old Part' });
    const hidden = await Product.findOne({ name: 'Hidden Part' });

    for (const id of [old._id, hidden._id, '507f1f77bcf86cd799439099', 'not-an-id']) {
      const res = await request(app).get(`/api/public/products/${id}`);
      expect(res.statusCode).toBe(404);
    }
  });
});

describe('filter lists', () => {
  it('lists active categories and motorcycle models', async () => {
    await seed();
    await Category.create({ name: 'Retired', code: 'RET', isActive: false });

    const categories = await request(app).get('/api/public/categories');
    expect(categories.body.data.map((c) => c.name)).toEqual(['Brakes', 'Oils']);
    expect(Object.keys(categories.body.data[0]).sort()).toEqual(['_id', 'name']);

    const models = await request(app).get('/api/public/motorcycle-models');
    expect(models.body.data).toEqual([
      expect.objectContaining({ make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023 }),
    ]);
  });
});
