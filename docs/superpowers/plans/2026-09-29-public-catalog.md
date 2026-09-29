# Public Product Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing page's mock products with the real catalog and add server-rendered `/catalog` and `/catalog/[product_id]` pages backed by a new unauthenticated `/api/public` API that can never leak cost, margin or quantity data.

**Architecture:** Backend gets a dedicated public router whose every read goes through one allow-list serializer over `.lean()` documents, with 60 second Redis caching. The frontend reads it from React server components through a Zod-validated fetch helper that uses an internal backend URL inside Docker. The staff product routes are closed to customers.

**Tech Stack:** Express 5, Mongoose 9, Jest + supertest + mongodb-memory-server (replica set); Next.js 16 App Router, React 19, Tailwind 4, Zod 4, Vitest 3; Playwright for end-to-end.

**Spec:** `docs/superpowers/specs/2026-09-29-public-catalog-design.md`

## Global Constraints

- Public data never includes `costPrice`, `profitMargin`, `quantity`, `reservedQuantity` or `reorderPoint`, at any depth.
- Only products with `isActive: true` and `isDiscontinued` not true are public.
- Price shown is `Product.sellingPrice`; the detail page shows "Price may vary by branch; confirm at the counter."
- Stock is shown only as the labels In stock, Low stock, Out of stock, computed from `quantity - reservedQuantity` against `reorderPoint`.
- Public cache TTL is 60 seconds; Next `revalidate` is 60 seconds.
- `limit` on the public list defaults to 24 and is clamped to 48.
- Page URL query parameters are snake_case: `search`, `category`, `motorcycle_model`, `sort`, `page`.
- Frontend palette: yellow-400, black, white, gray-100/200/400/500 only; status by text label; no transitions or animations; mobile first from 320px; Tailwind scale values only.
- Controllers answer through `ApiResponse`, never `res.json`. Request values reaching a Mongo filter are narrowed with `utils/narrowing.js` in the controller.
- JS/TS: no `any`, no `as` to silence errors. JSDoc on every exported function and reusable component. No em dashes in prose, no AI attribution in commits.
- Backend tests run with `TEMP=D:\claude-test-tmp TMP=D:\claude-test-tmp` on this machine.

## Review Focus

1. A junk `category` or `motorcycle_model` in the page URL (`/catalog?category=abc`) must show the unfiltered catalog, not the error page. Owned by Task 5 (`buildProductsUrl` drops malformed ids), tested there.
2. A page number past the end (`/catalog?page=99`) must show an empty-state with a link back to page 1, not a crash. Owned by Task 7, checked in Task 10's Playwright suite.
3. A product whose stock is entirely reserved must read Out of stock, not In stock. Owned by Task 2 (`publicStockStatus`) and asserted end to end in Task 3.
4. A product with no image, no brand, no category or no fitment must render without blank labels or broken image boxes. Owned by Task 7 (`CatalogProductCard` branches), checked in Task 10.
5. The landing page must still render when the backend is down, just without the products section. Owned by Task 8 (`featuredProducts` catch), tested in Task 10 by stopping the backend.

---

### Task 1: Extract the shared product search helpers

**Files:**
- Create: `backend/src/utils/productSearch.js`
- Modify: `backend/src/controllers/productController.js:54-71` (remove `parseMotorcycleModelFilter`), `:297-323` (use `productTextClauses`)
- Test: existing `backend/tests/product.test.js` (search and motorcycle filter cases)

**Interfaces:**
- Produces: `parseMotorcycleModelFilter(raw: string|string[]|undefined): string[]`; `productTextClauses(q: string): Promise<object[]>` returning the `$or` array.

- [ ] **Step 1: Create the helper module**

```js
import MotorcycleModel from '../models/MotorcycleModel.js';
import { escapeRegex } from './regex.js';

/**
 * Normalises the `motorcycleModel` filter, which arrives either as a repeated
 * query param (parsed by Express into an array) or as one comma-joined string,
 * the form the frontend sends since axios appends `[]` to repeated keys.
 *
 * @param {string|string[]|undefined} raw
 * @returns {string[]} ids, empty when nothing usable was supplied
 */
export const parseMotorcycleModelFilter = (raw) => {
  if (raw === undefined || raw === null) return [];
  const values = Array.isArray(raw) ? raw : String(raw).split(',');
  return values
    .map((value) => String(value).trim())
    .filter((value) => /^[0-9a-fA-F]{24}$/.test(value));
};

/**
 * The `$or` clauses of the mixed product search: one text matches the part
 * (name, SKU, brand, productModel, barcode) and the motorcycle it fits. The
 * motorcycles are resolved to ids first, since their text lives in another
 * collection and one query cannot reach it.
 *
 * @param {string} q the search text
 * @returns {Promise<object[]>} clauses for a `$or`
 */
export const productTextClauses = async (q) => {
  const pattern = { $regex: escapeRegex(q), $options: 'i' };
  const matchingMotorcycles = await MotorcycleModel.find({
    $or: [{ make: pattern }, { model: pattern }, { code: pattern }],
  })
    .select('_id')
    .lean();

  const clauses = [
    { name: pattern },
    { sku: pattern },
    { brand: pattern },
    { productModel: pattern },
    { barcode: pattern },
  ];
  if (matchingMotorcycles.length > 0) {
    clauses.push({ motorcycleModels: { $in: matchingMotorcycles.map((m) => m._id) } });
  }
  return clauses;
};
```

- [ ] **Step 2: Use it in `productController.js`**

Delete the local `parseMotorcycleModelFilter` (lines 54-71 including its JSDoc), add
`import { parseMotorcycleModelFilter, productTextClauses } from '../utils/productSearch.js';`,
and replace the body of the `if (q) { ... }` block in `searchProducts` with:

```js
  if (q) {
    query.$or = await productTextClauses(q);
  }
```

Remove the `escapeRegex` import only if nothing else in the file uses it (`getProducts` uses it for `brand`, so it stays).

- [ ] **Step 3: Run the product suite**

Run: `cd backend && npm test -- product.test.js`
Expected: PASS, same count as before.

- [ ] **Step 4: Commit**

```bash
git add backend/src/utils/productSearch.js backend/src/controllers/productController.js
git commit -m "refactor: share the mixed product search between staff and public reads"
```

---

### Task 2: Public product serializer and stock status

**Files:**
- Create: `backend/src/utils/publicProduct.js`
- Test: `backend/tests/publicProduct.test.js` (no database)

**Interfaces:**
- Produces: `PUBLIC_PRODUCT_SELECT: string`; `toPublicProduct(doc): PublicProduct`; `publicStockStatus({ quantity, reservedQuantity, reorderPoint }): 'in-stock'|'low-stock'|'out-of-stock'`.

- [ ] **Step 1: Write the failing test**

```js
import { toPublicProduct, publicStockStatus } from '../src/utils/publicProduct.js';

describe('toPublicProduct', () => {
  const doc = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Brake Pad',
    description: 'Front pad',
    brand: 'Yamaha',
    productModel: 'BP-1',
    costPrice: 100,
    profitMargin: 50,
    sellingPrice: 150,
    sku: 'PROD-000001',
    specifications: { material: 'ceramic' },
    category: { _id: '507f1f77bcf86cd799439012', name: 'Brakes', code: 'BRK', color: '#000' },
    motorcycleModels: [{ _id: '507f1f77bcf86cd799439013', make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023, code: 'X' }],
    images: [{ url: 'http://x/a.jpg', isPrimary: false, _id: 'i1' }, { url: 'http://x/b.jpg', isPrimary: true, _id: 'i2' }],
  };

  it('keeps only the allow-listed fields', () => {
    expect(Object.keys(toPublicProduct(doc)).sort()).toEqual([
      '_id', 'brand', 'category', 'description', 'images', 'motorcycleModels',
      'name', 'primaryImage', 'productModel', 'sellingPrice',
    ]);
  });

  it('strips nested fields that are not listed', () => {
    const out = toPublicProduct(doc);
    expect(out.category).toEqual({ _id: '507f1f77bcf86cd799439012', name: 'Brakes' });
    expect(out.motorcycleModels[0]).toEqual({ _id: '507f1f77bcf86cd799439013', make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023 });
    expect(out.images).toEqual([{ url: 'http://x/a.jpg', isPrimary: false }, { url: 'http://x/b.jpg', isPrimary: true }]);
  });

  it('picks the primary image, else the first, else null', () => {
    expect(toPublicProduct(doc).primaryImage).toBe('http://x/b.jpg');
    expect(toPublicProduct({ ...doc, images: [{ url: 'http://x/a.jpg' }] }).primaryImage).toBe('http://x/a.jpg');
    expect(toPublicProduct({ ...doc, images: [] }).primaryImage).toBeNull();
  });

  it('fills absent optional text with empty strings and an unpopulated category with null', () => {
    const out = toPublicProduct({ _id: 'a', name: 'X', sellingPrice: 1, category: '507f1f77bcf86cd799439012' });
    expect(out).toMatchObject({ description: '', brand: '', productModel: '', category: null, motorcycleModels: [], images: [], primaryImage: null });
  });
});

describe('publicStockStatus', () => {
  it('reads available stock, not raw quantity', () => {
    expect(publicStockStatus({ quantity: 5, reservedQuantity: 5, reorderPoint: 2 })).toBe('out-of-stock');
    expect(publicStockStatus({ quantity: 5, reservedQuantity: 3, reorderPoint: 2 })).toBe('low-stock');
    expect(publicStockStatus({ quantity: 10, reservedQuantity: 0, reorderPoint: 2 })).toBe('in-stock');
    expect(publicStockStatus({ quantity: 0, reservedQuantity: 0, reorderPoint: 0 })).toBe('out-of-stock');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- publicProduct.test.js`
Expected: FAIL, "Cannot find module '../src/utils/publicProduct.js'".

- [ ] **Step 3: Implement**

```js
/**
 * The only product fields the public catalog selects. `createdAt` is selected
 * for sorting and never serialized.
 */
export const PUBLIC_PRODUCT_SELECT =
  'name description brand productModel category motorcycleModels images sellingPrice createdAt';

const primaryImageOf = (images) => {
  if (!Array.isArray(images) || images.length === 0) return null;
  const primary = images.find((image) => image.isPrimary);
  return (primary ?? images[0]).url ?? null;
};

const isPopulated = (value) => value !== null && typeof value === 'object' && 'name' in value;

/**
 * Builds the public view of a lean product document from an explicit
 * allow-list. Anything not named here, cost and margin included, cannot reach
 * a visitor, and a field added to Product later stays private until it is
 * added here.
 *
 * @param {object} doc a `.lean()` product, category and motorcycleModels populated
 * @returns {object} the public product
 */
export const toPublicProduct = (doc) => ({
  _id: String(doc._id),
  name: doc.name,
  description: doc.description ?? '',
  brand: doc.brand ?? '',
  productModel: doc.productModel ?? '',
  category: isPopulated(doc.category)
    ? { _id: String(doc.category._id), name: doc.category.name }
    : null,
  motorcycleModels: (doc.motorcycleModels ?? [])
    .filter((model) => model !== null && typeof model === 'object' && 'make' in model)
    .map((model) => ({
      _id: String(model._id),
      make: model.make,
      model: model.model,
      yearFrom: model.yearFrom ?? null,
      yearTo: model.yearTo ?? null,
    })),
  images: (doc.images ?? []).map((image) => ({ url: image.url, isPrimary: Boolean(image.isPrimary) })),
  primaryImage: primaryImageOf(doc.images),
  sellingPrice: doc.sellingPrice,
});

/**
 * The public stock label for one branch's stock row. Reads available stock,
 * `quantity - reservedQuantity`, because units held for pending orders cannot
 * be sold to a walk-in; Stock's own `stockStatus` virtual ignores reservations.
 *
 * @param {{ quantity?: number, reservedQuantity?: number, reorderPoint?: number }} stock
 * @returns {'in-stock'|'low-stock'|'out-of-stock'}
 */
export const publicStockStatus = (stock) => {
  const available = Math.max(0, (stock.quantity ?? 0) - (stock.reservedQuantity ?? 0));
  if (available === 0) return 'out-of-stock';
  if (available <= (stock.reorderPoint ?? 0)) return 'low-stock';
  return 'in-stock';
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- publicProduct.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/publicProduct.js backend/tests/publicProduct.test.js
git commit -m "feat: allow-list serializer and stock label for the public catalog"
```

---

### Task 3: Public catalog API

**Files:**
- Create: `backend/src/controllers/publicCatalogController.js`, `backend/src/routes/publicRoutes.js`
- Modify: `backend/src/server.js` (import and mount beside the other routers, lines ~147-156)
- Test: `backend/tests/publicCatalog.test.js`

**Interfaces:**
- Consumes: Task 1 `parseMotorcycleModelFilter`, `productTextClauses`; Task 2 `PUBLIC_PRODUCT_SELECT`, `toPublicProduct`, `publicStockStatus`.
- Produces HTTP: `GET /api/public/products` → `{ success, data: PublicProduct[] (each + availableAt), pagination: { page, limit, total, pages } }`; `GET /api/public/products/:id` → `{ success, data: PublicProduct + availableAt + branches[{ _id, name, city, phone, status }] }` or 404; `GET /api/public/categories` → `data: [{ _id, name }]`; `GET /api/public/motorcycle-models` → `data: [{ _id, make, model, yearFrom, yearTo }]`.

- [ ] **Step 1: Write the failing integration test**

```js
import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import publicRoutes from '../src/routes/publicRoutes.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import MotorcycleModel from '../src/models/MotorcycleModel.js';
import Branch from '../src/models/Branch.js';
import Stock from '../src/models/Stock.js';

const app = express();
app.use(express.json());
app.use('/api/public', publicRoutes);

beforeAll(async () => { await dbHandler.connect(); });
afterEach(async () => { await dbHandler.clearDatabase(); });
afterAll(async () => { await dbHandler.closeDatabase(); });

const FORBIDDEN = ['costPrice', 'profitMargin', 'quantity', 'reservedQuantity', 'reorderPoint'];
const collectKeys = (value, keys = new Set()) => {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) { keys.add(key); collectKeys(child, keys); }
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
  const pad = await Product.create({ name: 'Brake Pad', brand: 'Yamaha', category: brakes._id, costPrice: 100, sellingPrice: 150, motorcycleModels: [click._id] });
  const oil = await Product.create({ name: 'Engine Oil', brand: 'Shell', category: oils._id, costPrice: 200, sellingPrice: 300 });
  const reserved = await Product.create({ name: 'Chain', category: brakes._id, costPrice: 50, sellingPrice: 80 });
  await Product.create({ name: 'Old Part', category: brakes._id, costPrice: 1, sellingPrice: 2, isDiscontinued: true });
  await Product.create({ name: 'Hidden Part', category: brakes._id, costPrice: 1, sellingPrice: 2, isActive: false });
  await Stock.create({ product: pad._id, branch: main._id, quantity: 10, reorderPoint: 2, costPrice: 100, sellingPrice: 150 });
  await Stock.create({ product: pad._id, branch: north._id, quantity: 2, reorderPoint: 2, costPrice: 100, sellingPrice: 150 });
  await Stock.create({ product: pad._id, branch: closed._id, quantity: 9, reorderPoint: 2, costPrice: 100, sellingPrice: 150 });
  await Stock.create({ product: reserved._id, branch: main._id, quantity: 5, reservedQuantity: 5, reorderPoint: 1, costPrice: 50, sellingPrice: 80 });
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
    expect(models.body.data).toEqual([expect.objectContaining({ make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023 })]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- publicCatalog.test.js`
Expected: FAIL, "Cannot find module '../src/routes/publicRoutes.js'".

- [ ] **Step 3: Implement the controller**

`backend/src/controllers/publicCatalogController.js`:

```js
import Product from '../models/Product.js';
import Stock from '../models/Stock.js';
import Category from '../models/Category.js';
import MotorcycleModel from '../models/MotorcycleModel.js';
// Registered for the branch populate below; nothing else here uses it.
import '../models/Branch.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import CacheUtil from '../utils/cache.js';
import { asObjectId, asEnum, asCount } from '../utils/narrowing.js';
import { parseMotorcycleModelFilter, productTextClauses } from '../utils/productSearch.js';
import { PUBLIC_PRODUCT_SELECT, toPublicProduct, publicStockStatus } from '../utils/publicProduct.js';

/** Sort orders the public listing accepts. */
export const PUBLIC_SORTS = ['newest', 'name', 'price_asc', 'price_desc'];

const SORT_SPEC = {
  newest: { createdAt: -1 },
  name: { name: 1 },
  price_asc: { sellingPrice: 1 },
  price_desc: { sellingPrice: -1 },
};

/** Largest page the public listing serves. */
export const PUBLIC_MAX_LIMIT = 48;
const PUBLIC_DEFAULT_LIMIT = 24;
const PUBLIC_TTL_SECONDS = 60;
const MAX_SEARCH_LENGTH = 100;
const MOTORCYCLE_SELECT = 'make model yearFrom yearTo';
const LISTED = { isActive: true, isDiscontinued: { $ne: true } };

/**
 * How many active branches hold available stock of each product, in one
 * aggregate rather than a query per card.
 *
 * @param {import('mongoose').Types.ObjectId[]} productIds
 * @returns {Promise<Map<string, number>>}
 */
const countAvailableBranches = async (productIds) => {
  if (productIds.length === 0) return new Map();
  const rows = await Stock.aggregate([
    { $match: { product: { $in: productIds } } },
    { $match: { $expr: { $gt: [{ $subtract: ['$quantity', '$reservedQuantity'] }, 0] } } },
    { $lookup: { from: 'branches', localField: 'branch', foreignField: '_id', as: 'branchDoc' } },
    { $match: { 'branchDoc.isActive': true } },
    { $group: { _id: '$product', branches: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.branches]));
};

/**
 * @desc    Public product listing
 * @route   GET /api/public/products
 * @access  Public
 */
export const getPublicProducts = asyncHandler(async (req, res) => {
  const page = Math.max(1, asCount(req.query.page, 1));
  const limit = Math.min(Math.max(1, asCount(req.query.limit, PUBLIC_DEFAULT_LIMIT)), PUBLIC_MAX_LIMIT);
  const sort = asEnum(req.query.sort, PUBLIC_SORTS) ?? 'newest';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, MAX_SEARCH_LENGTH) : '';

  let category = null;
  if (req.query.category !== undefined && req.query.category !== '') {
    category = asObjectId(req.query.category);
    if (!category) return ApiResponse.error(res, 400, 'Invalid category');
  }
  const motorcycleModelIds = parseMotorcycleModelFilter(req.query.motorcycleModel);

  const cacheKey = CacheUtil.generateKey(
    'public', 'products', page, limit, sort,
    search || '-', category ?? '-', motorcycleModelIds.join(',') || '-'
  );
  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    return ApiResponse.paginate(res, cached.data, page, limit, cached.total, 'Catalog retrieved');
  }

  const query = { ...LISTED };
  if (category) query.category = category;
  if (motorcycleModelIds.length > 0) query.motorcycleModels = { $in: motorcycleModelIds };
  if (search) query.$or = await productTextClauses(search);

  const docs = await Product.find(query)
    .select(PUBLIC_PRODUCT_SELECT)
    .populate('category', 'name')
    .populate('motorcycleModels', MOTORCYCLE_SELECT)
    .sort({ ...SORT_SPEC[sort], _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const total = await Product.countDocuments(query);
  const available = await countAvailableBranches(docs.map((doc) => doc._id));
  const data = docs.map((doc) => ({ ...toPublicProduct(doc), availableAt: available.get(String(doc._id)) ?? 0 }));

  await CacheUtil.set(cacheKey, { data, total }, PUBLIC_TTL_SECONDS);
  return ApiResponse.paginate(res, data, page, limit, total, 'Catalog retrieved');
});

/**
 * @desc    Public product detail with per-branch availability
 * @route   GET /api/public/products/:id
 * @access  Public
 */
export const getPublicProduct = asyncHandler(async (req, res) => {
  const id = asObjectId(req.params.id);
  if (!id) return ApiResponse.error(res, 404, 'Product not found');

  const cacheKey = CacheUtil.generateKey('public', 'product', id);
  const cached = await CacheUtil.get(cacheKey);
  if (cached) return ApiResponse.success(res, 200, 'Product retrieved', cached);

  const doc = await Product.findOne({ _id: id, ...LISTED })
    .select(PUBLIC_PRODUCT_SELECT)
    .populate('category', 'name')
    .populate('motorcycleModels', MOTORCYCLE_SELECT)
    .lean();
  if (!doc) return ApiResponse.error(res, 404, 'Product not found');

  const stocks = await Stock.find({ product: doc._id })
    .select('branch quantity reservedQuantity reorderPoint')
    .populate('branch', 'name address.city contact.phone isActive')
    .lean();
  const branches = stocks
    .filter((stock) => stock.branch && stock.branch.isActive !== false)
    .map((stock) => ({
      _id: String(stock.branch._id),
      name: stock.branch.name,
      city: stock.branch.address?.city ?? '',
      phone: stock.branch.contact?.phone ?? '',
      status: publicStockStatus(stock),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const product = {
    ...toPublicProduct(doc),
    availableAt: branches.filter((branch) => branch.status !== 'out-of-stock').length,
    branches,
  };
  await CacheUtil.set(cacheKey, product, PUBLIC_TTL_SECONDS);
  return ApiResponse.success(res, 200, 'Product retrieved', product);
});

/**
 * @desc    Active categories for the catalog filter
 * @route   GET /api/public/categories
 * @access  Public
 */
export const getPublicCategories = asyncHandler(async (req, res) => {
  const cacheKey = CacheUtil.generateKey('public', 'categories');
  const cached = await CacheUtil.get(cacheKey);
  if (cached) return ApiResponse.success(res, 200, 'Categories retrieved', cached);

  const rows = await Category.find({ isActive: true }).select('name').sort({ name: 1 }).lean();
  const data = rows.map((row) => ({ _id: String(row._id), name: row.name }));
  await CacheUtil.set(cacheKey, data, PUBLIC_TTL_SECONDS);
  return ApiResponse.success(res, 200, 'Categories retrieved', data);
});

/**
 * @desc    Motorcycle models for the fitment filter
 * @route   GET /api/public/motorcycle-models
 * @access  Public
 */
export const getPublicMotorcycleModels = asyncHandler(async (req, res) => {
  const cacheKey = CacheUtil.generateKey('public', 'motorcycle-models');
  const cached = await CacheUtil.get(cacheKey);
  if (cached) return ApiResponse.success(res, 200, 'Motorcycle models retrieved', cached);

  const rows = await MotorcycleModel.find().select(MOTORCYCLE_SELECT).sort({ make: 1, model: 1, yearFrom: 1 }).lean();
  const data = rows.map((row) => ({
    _id: String(row._id),
    make: row.make,
    model: row.model,
    yearFrom: row.yearFrom ?? null,
    yearTo: row.yearTo ?? null,
  }));
  await CacheUtil.set(cacheKey, data, PUBLIC_TTL_SECONDS);
  return ApiResponse.success(res, 200, 'Motorcycle models retrieved', data);
});
```

- [ ] **Step 4: Implement the router and mount it**

`backend/src/routes/publicRoutes.js`:

```js
import express from 'express';
import { apiLimiter } from '../middleware/rateLimit.js';
import {
  getPublicProducts,
  getPublicProduct,
  getPublicCategories,
  getPublicMotorcycleModels,
} from '../controllers/publicCatalogController.js';

const router = express.Router();

// No `protect`: this is the public storefront. The limiter sits on each route
// rather than on the mount, because a request refused at the mount never
// reaches the router and is labelled `unmatched` in the metrics, which would
// hide these 429s from the TalyerPublicCatalogRateLimited alert.
//
// ponytail: server-rendered catalog pages all reach this from the frontend
// container's address, so the whole public site shares one IP bucket.
// Forwarding the visitor's address (after verifying TRUST_PROXY) lifts it.
router.get('/products', apiLimiter, getPublicProducts);
router.get('/products/:id', apiLimiter, getPublicProduct);
router.get('/categories', apiLimiter, getPublicCategories);
router.get('/motorcycle-models', apiLimiter, getPublicMotorcycleModels);

export default router;
```

In `backend/src/server.js`, add `import publicRoutes from './routes/publicRoutes.js';` beside the other route imports and `app.use('/api/public', publicRoutes);` directly after the `/api/services` mount.

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && npm test -- publicCatalog.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/publicCatalogController.js backend/src/routes/publicRoutes.js backend/src/server.js backend/tests/publicCatalog.test.js
git commit -m "feat: public catalog API with an allow-list and branch stock labels"
```

---

### Task 4: Close the staff product reads to customers

**Files:**
- Modify: `backend/src/routes/productRoutes.js` (the three GET chains at `/search`, `/`, `/:id`)
- Test: `backend/tests/product.test.js`

- [ ] **Step 1: Write the failing test** (append to `product.test.js`)

```js
describe('staff product reads are closed to customers', () => {
  it('answers 403 to a customer on list, search and detail', async () => {
    const { token } = await createTestUser({ role: 'customer', email: 'shopper@example.com' });
    const category = await Category.create({ name: 'Brakes', code: 'BRK' });
    const product = await Product.create({ name: 'Pad', category: category._id, costPrice: 1, sellingPrice: 2 });
    for (const path of ['/api/products', '/api/products/search?q=pad', `/api/products/${product._id}`]) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(403);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- product.test.js -t "closed to customers"`
Expected: FAIL, received 200.

- [ ] **Step 3: Implement**

In `productRoutes.js`, add `authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON, USER_ROLES.MECHANIC),` directly after `protect,` in the three GET chains (`/search`, `/` GET, `/:id` GET), with this comment above the `/search` route:

```js
// Staff only. Customers read the catalog through /api/public, which serializes
// an allow-list; these return whole documents, cost price and margin included.
```

- [ ] **Step 4: Run the product suite**

Run: `cd backend && npm test -- product.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/productRoutes.js backend/tests/product.test.js
git commit -m "fix: stop customer accounts reading cost price from staff product routes"
```

---

### Task 5: Frontend catalog data layer

**Files:**
- Create: `frontend/src/utils/validators/publicCatalog.ts`, `frontend/src/types/catalog.ts`, `frontend/src/lib/public/catalogApi.ts`, `frontend/src/lib/public/catalogHref.ts`, `frontend/src/lib/public/formatFitment.ts`
- Test: `frontend/src/lib/public/catalogApi.test.ts`

**Interfaces:**
- Produces: types `PublicProduct`, `PublicProductDetail`, `PublicCategory`, `PublicMotorcycleModel`, `PublicStockStatus`, `PublicProductPage`; `CatalogQuery`; `getPublicProducts(query): Promise<PublicProductPage>`, `getPublicProduct(id): Promise<PublicProductDetail | null>`, `getPublicCategories(): Promise<PublicCategory[]>`, `getPublicMotorcycleModels(): Promise<PublicMotorcycleModel[]>`, `buildProductsUrl(query, base?): string`, `CatalogUnavailableError`; `catalogHref(query): string`; `formatFitment(model): string`.

- [ ] **Step 1: Schemas and types**

`frontend/src/utils/validators/publicCatalog.ts`:

```ts
import { z } from 'zod';

/** Stock label for one branch, as the public API sends it. */
export const publicStockStatusSchema = z.enum(['in-stock', 'low-stock', 'out-of-stock']);

/** A category as the public catalog exposes it. */
export const publicCategorySchema = z.object({ _id: z.string(), name: z.string() });

/** A motorcycle model as the public catalog exposes it. */
export const publicMotorcycleModelSchema = z.object({
  _id: z.string(),
  make: z.string(),
  model: z.string(),
  yearFrom: z.number().nullable(),
  yearTo: z.number().nullable(),
});

/** A product card in the public listing. */
export const publicProductSchema = z.object({
  _id: z.string(),
  name: z.string(),
  description: z.string(),
  brand: z.string(),
  productModel: z.string(),
  category: publicCategorySchema.nullable(),
  motorcycleModels: z.array(publicMotorcycleModelSchema),
  images: z.array(z.object({ url: z.string(), isPrimary: z.boolean() })),
  primaryImage: z.string().nullable(),
  sellingPrice: z.number(),
  availableAt: z.number().int().nonnegative(),
});

/** One branch's availability on the product page. */
export const publicBranchAvailabilitySchema = z.object({
  _id: z.string(),
  name: z.string(),
  city: z.string(),
  phone: z.string(),
  status: publicStockStatusSchema,
});

/** The product page: a card plus where it is stocked. */
export const publicProductDetailSchema = publicProductSchema.extend({
  branches: z.array(publicBranchAvailabilitySchema),
});

/** One page of the listing. */
export const publicProductPageSchema = z.object({
  data: z.array(publicProductSchema),
  pagination: z.object({ page: z.number(), limit: z.number(), total: z.number(), pages: z.number() }),
});

export type PublicStockStatus = z.infer<typeof publicStockStatusSchema>;
export type PublicCategory = z.infer<typeof publicCategorySchema>;
export type PublicMotorcycleModel = z.infer<typeof publicMotorcycleModelSchema>;
export type PublicProduct = z.infer<typeof publicProductSchema>;
export type PublicBranchAvailability = z.infer<typeof publicBranchAvailabilitySchema>;
export type PublicProductDetail = z.infer<typeof publicProductDetailSchema>;
export type PublicProductPage = z.infer<typeof publicProductPageSchema>;
```

`frontend/src/types/catalog.ts`:

```ts
/**
 * The catalog listing's query, in the snake_case the page URL uses. The data
 * layer maps it to the backend's own parameter names.
 */
export interface CatalogQuery {
  search?: string;
  category?: string;
  motorcycle_model?: string;
  sort?: string;
  page?: number;
  limit?: number;
}
```

- [ ] **Step 2: Write the failing test**

`frontend/src/lib/public/catalogApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProductsUrl,
  CatalogUnavailableError,
  getPublicProduct,
  getPublicProducts,
} from './catalogApi';
import { catalogHref } from './catalogHref';
import { formatFitment } from './formatFitment';

const ID = '507f1f77bcf86cd799439011';
const product = {
  _id: ID, name: 'Brake Pad', description: '', brand: 'Yamaha', productModel: '',
  category: { _id: ID, name: 'Brakes' }, motorcycleModels: [], images: [],
  primaryImage: null, sellingPrice: 150, availableAt: 2,
};

const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => { vi.unstubAllGlobals(); });

describe('buildProductsUrl', () => {
  it('maps page params to backend names and drops defaults', () => {
    expect(buildProductsUrl({ search: 'pad', category: ID, motorcycle_model: ID, sort: 'price_asc', page: 2 }, 'http://api'))
      .toBe(`http://api/public/products?search=pad&category=${ID}&motorcycleModel=${ID}&sort=price_asc&page=2`);
    expect(buildProductsUrl({ page: 1 }, 'http://api')).toBe('http://api/public/products');
  });

  it('drops malformed ids so a bad link shows the unfiltered catalog', () => {
    expect(buildProductsUrl({ category: 'abc', motorcycle_model: 'x,y' }, 'http://api')).toBe('http://api/public/products');
  });
});

describe('getPublicProducts', () => {
  it('parses a valid page', async () => {
    vi.stubGlobal('fetch', respond(200, { success: true, data: [product], pagination: { page: 1, limit: 24, total: 1, pages: 1 } }));
    const page = await getPublicProducts({});
    expect(page.data[0].name).toBe('Brake Pad');
  });

  it('rejects a response of the wrong shape', async () => {
    vi.stubGlobal('fetch', respond(200, { success: true, data: [{ name: 'x' }] }));
    await expect(getPublicProducts({})).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it('rejects when the backend is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(getPublicProducts({})).rejects.toBeInstanceOf(CatalogUnavailableError);
  });
});

describe('getPublicProduct', () => {
  it('returns null on 404 and for a malformed id without fetching', async () => {
    const fetchMock = respond(404, { success: false });
    vi.stubGlobal('fetch', fetchMock);
    expect(await getPublicProduct(ID)).toBeNull();
    expect(await getPublicProduct('nope')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('catalogHref and formatFitment', () => {
  it('builds catalog links in page-URL names', () => {
    expect(catalogHref({})).toBe('/catalog');
    expect(catalogHref({ search: 'oil', motorcycle_model: ID, sort: 'newest', page: 3 }))
      .toBe(`/catalog?search=oil&motorcycle_model=${ID}&page=3`);
  });

  it('formats a fitment with and without years', () => {
    expect(formatFitment({ _id: ID, make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023 })).toBe('Honda Click 125i (2018-2023)');
    expect(formatFitment({ _id: ID, make: 'Honda', model: 'Beat', yearFrom: 2020, yearTo: null })).toBe('Honda Beat (2020 onward)');
    expect(formatFitment({ _id: ID, make: 'Honda', model: 'Wave', yearFrom: null, yearTo: null })).toBe('Honda Wave');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd frontend && npx vitest run src/lib/public/catalogApi.test.ts`
Expected: FAIL, cannot resolve `./catalogApi`.

- [ ] **Step 4: Implement**

`frontend/src/lib/public/catalogApi.ts`:

```ts
import { z } from 'zod';
import type { CatalogQuery } from '@/types/catalog';
import {
  publicCategorySchema,
  publicMotorcycleModelSchema,
  publicProductDetailSchema,
  publicProductPageSchema,
  type PublicCategory,
  type PublicMotorcycleModel,
  type PublicProductDetail,
  type PublicProductPage,
} from '@/utils/validators/publicCatalog';

/** Seconds a catalog response may be served from Next's data cache. */
const REVALIDATE_SECONDS = 60;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** The catalog could not be read: the backend is down or answered unexpectedly. */
export class CatalogUnavailableError extends Error {
  override name = 'CatalogUnavailableError';
}

/**
 * Backend base URL for server-side reads. Inside Docker `localhost` is the
 * frontend container itself, so `API_INTERNAL_URL` names the backend service;
 * outside Docker the public URL works.
 */
const apiBase = (): string =>
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

/**
 * Builds the backend URL for a listing query. Malformed ids are dropped rather
 * than sent, so a mangled link shows the unfiltered catalog instead of an error.
 *
 * @param query the page's query, in page-URL names
 * @param base backend base URL, defaulting to the server-side one
 */
export const buildProductsUrl = (query: CatalogQuery, base: string = apiBase()): string => {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.category && OBJECT_ID.test(query.category)) params.set('category', query.category);
  const fitment = (query.motorcycle_model ?? '').split(',').filter((id) => OBJECT_ID.test(id));
  if (fitment.length > 0) params.set('motorcycleModel', fitment.join(','));
  if (query.sort) params.set('sort', query.sort);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return `${base}/public/products${qs ? `?${qs}` : ''}`;
};

const readJson = async (url: string): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  } catch (error) {
    throw new CatalogUnavailableError(`Catalog request to ${url} failed: ${String(error)}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new CatalogUnavailableError(`Catalog request to ${url} answered ${response.status}`);
  const body: unknown = await response.json();
  return body;
};

const parse = <T>(schema: z.ZodType<T>, body: unknown, url: string): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new CatalogUnavailableError(`Catalog response from ${url} has an unexpected shape`);
  return result.data;
};

/**
 * One page of the public listing.
 *
 * @throws CatalogUnavailableError when the backend is unreachable or the shape is wrong
 */
export const getPublicProducts = async (query: CatalogQuery): Promise<PublicProductPage> => {
  const url = buildProductsUrl(query);
  return parse(publicProductPageSchema, await readJson(url), url);
};

/**
 * One public product with its branch availability, or null when it is not
 * listed (unknown, inactive, discontinued or a malformed id).
 */
export const getPublicProduct = async (id: string): Promise<PublicProductDetail | null> => {
  if (!OBJECT_ID.test(id)) return null;
  const url = `${apiBase()}/public/products/${id}`;
  const body = await readJson(url);
  if (body === null) return null;
  return parse(z.object({ data: publicProductDetailSchema }), body, url).data;
};

/** Active categories for the listing filter. */
export const getPublicCategories = async (): Promise<PublicCategory[]> => {
  const url = `${apiBase()}/public/categories`;
  return parse(z.object({ data: z.array(publicCategorySchema) }), await readJson(url), url).data;
};

/** Motorcycle models for the fitment filter, sorted by make then model. */
export const getPublicMotorcycleModels = async (): Promise<PublicMotorcycleModel[]> => {
  const url = `${apiBase()}/public/motorcycle-models`;
  return parse(z.object({ data: z.array(publicMotorcycleModelSchema) }), await readJson(url), url).data;
};
```

`frontend/src/lib/public/catalogHref.ts`:

```ts
import type { CatalogQuery } from '@/types/catalog';

/**
 * A `/catalog` link for a query, in page-URL names. Defaults (page 1, newest)
 * are left out so the canonical link stays short.
 */
export const catalogHref = (query: CatalogQuery): string => {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.category) params.set('category', query.category);
  if (query.motorcycle_model) params.set('motorcycle_model', query.motorcycle_model);
  if (query.sort && query.sort !== 'newest') params.set('sort', query.sort);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const qs = params.toString();
  return qs ? `/catalog?${qs}` : '/catalog';
};
```

`frontend/src/lib/public/formatFitment.ts`:

```ts
import type { PublicMotorcycleModel } from '@/utils/validators/publicCatalog';

/** "Honda Click 125i (2018-2023)", "(2020 onward)", or no years at all. */
export const formatFitment = (model: PublicMotorcycleModel): string => {
  const name = `${model.make} ${model.model}`;
  if (model.yearFrom && model.yearTo) return `${name} (${model.yearFrom}-${model.yearTo})`;
  if (model.yearFrom) return `${name} (${model.yearFrom} onward)`;
  if (model.yearTo) return `${name} (up to ${model.yearTo})`;
  return name;
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd frontend && npx vitest run src/lib/public/catalogApi.test.ts && npx tsc --noEmit`
Expected: PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/validators/publicCatalog.ts frontend/src/types/catalog.ts frontend/src/lib/public
git commit -m "feat: validated server-side data layer for the public catalog"
```

---

### Task 6: One image URL resolver

**Files:**
- Create: `frontend/src/lib/images/resolveImageUrl.ts`
- Modify: `frontend/src/components/products/ProductCard.tsx:24-38`, `ProductImageGallery.tsx`, `ProductImageEditor.tsx` (delete their local `resolveImageUrl`, import the shared one)

- [ ] **Step 1: Create the shared helper**

```ts
/**
 * Makes a product image URL loadable: full URLs pass through, and legacy
 * relative `/uploads/...` paths get the backend origin prepended.
 */
export const resolveImageUrl = (url: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/uploads/')) {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    return `${backendUrl}${url}`;
  }
  return url;
};
```

- [ ] **Step 2: Replace the three local copies**

In each of the three files delete the local `resolveImageUrl` function (and its doc comment) and add `import { resolveImageUrl } from '@/lib/images/resolveImageUrl';`. Call sites are unchanged.

- [ ] **Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: tsc exit 0; lint 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/images frontend/src/components/products
git commit -m "refactor: one resolveImageUrl instead of three copies"
```

---

### Task 7: Catalog components and pages

**Files:**
- Create: `frontend/src/components/catalog/CatalogProductCard.tsx`, `CatalogFilters.tsx`, `BranchAvailability.tsx`, `CatalogPagination.tsx`, `index.ts`
- Create: `frontend/src/app/(public)/catalog/layout.tsx`, `page.tsx`, `error.tsx`, `[product_id]/page.tsx`, `[product_id]/not-found.tsx`
- Modify: `frontend/src/app/(public)/(landing-page)/landing-page.tsx` (export `Navbar` and `Footer`; `NAV_LINKS` and footer links point at `/catalog` and `/#section`)

**Interfaces:**
- Consumes: Task 5 data layer and types; Task 6 `resolveImageUrl`; `formatCurrency` from `@/types/service`; `Combobox`, `ComboboxOption` from `@/components/ui/Combobox`.
- Produces: `CatalogProductCard({ product })`, used again by Task 8.

- [ ] **Step 1: `CatalogProductCard`**

```tsx
import Image from 'next/image';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatCurrency } from '@/types/service';
import { resolveImageUrl } from '@/lib/images/resolveImageUrl';
import { formatFitment } from '@/lib/public/formatFitment';
import type { PublicProduct } from '@/utils/validators/publicCatalog';

/** Props for {@link CatalogProductCard}. */
export interface CatalogProductCardProps {
  /** The product to show; the whole card links to its page. */
  product: PublicProduct;
}

const availabilityLabel = (count: number): string =>
  count === 0 ? 'Out of stock' : `Available at ${count} ${count === 1 ? 'branch' : 'branches'}`;

const fitmentSummary = (product: PublicProduct): string | null => {
  if (product.motorcycleModels.length === 0) return null;
  const [first, ...rest] = product.motorcycleModels;
  return rest.length === 0 ? formatFitment(first) : `${formatFitment(first)} and ${rest.length} more`;
};

/** A public catalog card: image, name, brand, fitment, price and availability. */
export function CatalogProductCard({ product }: CatalogProductCardProps) {
  const image = product.primaryImage ? resolveImageUrl(product.primaryImage) : null;
  const fitment = fitmentSummary(product);
  return (
    <Link
      href={`/catalog/${product._id}`}
      className="flex h-full flex-col rounded-lg border border-gray-200 bg-white hover:border-yellow-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
    >
      <div className="relative aspect-square w-full bg-gray-100">
        {image ? (
          <Image src={image} alt={product.name} fill sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" className="object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-12 w-12 text-gray-400" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {product.category && <p className="text-xs font-medium uppercase text-gray-500">{product.category.name}</p>}
        <h3 className="mt-1 line-clamp-2 text-base font-bold text-black">{product.name}</h3>
        {product.brand && <p className="text-sm text-gray-500">{product.brand}</p>}
        {fitment && <p className="mt-1 text-xs text-gray-500">Fits {fitment}</p>}
        <p className="mt-auto pt-2 text-lg font-bold text-black">{formatCurrency(product.sellingPrice)}</p>
        <p className="text-sm font-medium text-black">{availabilityLabel(product.availableAt)}</p>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: `BranchAvailability` and `CatalogPagination`**

```tsx
import type { PublicBranchAvailability, PublicStockStatus } from '@/utils/validators/publicCatalog';

const STATUS_LABEL: Record<PublicStockStatus, string> = {
  'in-stock': 'In stock',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock',
};

/** Props for {@link BranchAvailability}. */
export interface BranchAvailabilityProps {
  /** Branches that carry the product, with their stock label. */
  branches: PublicBranchAvailability[];
}

/** Where a product is stocked, as text labels with each branch's phone. */
export function BranchAvailability({ branches }: BranchAvailabilityProps) {
  if (branches.length === 0) {
    return <p className="text-sm text-gray-500">Not stocked at any branch right now. Call us to order it.</p>;
  }
  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
      {branches.map((branch) => (
        <li key={branch._id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-black">{branch.name}</p>
            {branch.city && <p className="text-sm text-gray-500">{branch.city}</p>}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-black">{STATUS_LABEL[branch.status]}</span>
            {branch.phone && (
              <a href={`tel:${branch.phone.replace(/[^\d+]/g, '')}`} className="text-sm font-medium text-black underline">
                {branch.phone}
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

```tsx
import Link from 'next/link';
import { catalogHref } from '@/lib/public/catalogHref';
import type { CatalogQuery } from '@/types/catalog';

/** Props for {@link CatalogPagination}. */
export interface CatalogPaginationProps {
  /** The current query; page links keep its filters. */
  query: CatalogQuery;
  /** Current page, 1-based. */
  page: number;
  /** Total pages; nothing renders when there is one or none. */
  pages: number;
}

/** Previous and next links for the catalog listing. */
export function CatalogPagination({ query, page, pages }: CatalogPaginationProps) {
  if (pages <= 1) return null;
  const linkClass = 'rounded-lg border border-black px-4 py-2 text-sm font-medium text-black hover:bg-yellow-400';
  return (
    <nav aria-label="Catalog pages" className="mt-8 flex items-center justify-between gap-4">
      {page > 1 ? <Link href={catalogHref({ ...query, page: page - 1 })} className={linkClass}>Previous</Link> : <span />}
      <span className="text-sm text-gray-500">Page {page} of {pages}</span>
      {page < pages ? <Link href={catalogHref({ ...query, page: page + 1 })} className={linkClass}>Next</Link> : <span />}
    </nav>
  );
}
```

- [ ] **Step 3: `CatalogFilters` (client)**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { catalogHref } from '@/lib/public/catalogHref';
import { formatFitment } from '@/lib/public/formatFitment';
import type { CatalogQuery } from '@/types/catalog';
import type { PublicCategory, PublicMotorcycleModel } from '@/utils/validators/publicCatalog';

/** Props for {@link CatalogFilters}. */
export interface CatalogFiltersProps {
  /** Category options. */
  categories: PublicCategory[];
  /** Fitment options, sorted by make then model. */
  motorcycleModels: PublicMotorcycleModel[];
  /** The query the page was rendered with. */
  current: CatalogQuery;
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name A to Z' },
  { value: 'price_asc', label: 'Price, low to high' },
  { value: 'price_desc', label: 'Price, high to low' },
];

/** Search, category, fitment and sort controls; every change navigates to page 1. */
export function CatalogFilters({ categories, motorcycleModels, current }: CatalogFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(current.search ?? '');

  const go = (next: CatalogQuery) => router.push(catalogHref({ ...current, ...next, page: 1 }));

  const categoryOptions: ComboboxOption[] = categories.map((c) => ({ value: c._id, label: c.name }));
  const fitmentOptions: ComboboxOption[] = motorcycleModels.map((m) => ({ value: m._id, label: formatFitment(m), group: m.make }));

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    go({ search: search.trim() || undefined });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <form role="search" onSubmit={onSearch} className="flex flex-col gap-1 lg:col-span-1">
        <label htmlFor="catalog-search" className="text-sm font-medium text-black">Search parts</label>
        <div className="flex gap-2">
          <input
            id="catalog-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Part, brand or motorcycle"
            className="w-full rounded-lg border border-gray-400 px-3 py-2 text-base text-black focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <button type="submit" className="rounded-lg bg-yellow-400 px-4 py-2 font-medium text-black hover:bg-black hover:text-white">
            Search
          </button>
        </div>
      </form>
      <Combobox
        id="catalog-category"
        label="Category"
        options={categoryOptions}
        value={current.category ?? ''}
        onChange={(value) => go({ category: value || undefined })}
        emptyOptionLabel="All categories"
        placeholder="All categories"
      />
      <Combobox
        id="catalog-fitment"
        label="Fits motorcycle"
        options={fitmentOptions}
        value={current.motorcycle_model ?? ''}
        onChange={(value) => go({ motorcycle_model: value || undefined })}
        emptyOptionLabel="Any motorcycle"
        placeholder="Any motorcycle"
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="catalog-sort" className="text-sm font-medium text-black">Sort by</label>
        <select
          id="catalog-sort"
          value={current.sort ?? 'newest'}
          onChange={(event) => go({ sort: event.target.value })}
          className="rounded-lg border border-gray-400 bg-white px-3 py-2 text-base text-black focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        >
          {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </div>
  );
}
```

`frontend/src/components/catalog/index.ts` re-exports the four components.

- [ ] **Step 4: Share the landing navbar and footer**

In `landing-page.tsx`: change `const Navbar` and `const Footer` to `export const Navbar` / `export const Footer`; change `NAV_LINKS` to
`[{ href: '/', label: 'Home' }, { href: '/catalog', label: 'Catalog' }, { href: '/#services', label: 'Services' }, { href: '/#sales', label: 'Sales' }, { href: '/#about', label: 'About' }, { href: '/#contact', label: 'Contact' }]`,
and in `Footer` change `href="#products"` to `href="/catalog"` and the other `#section` anchors to `/#section`.

- [ ] **Step 5: Catalog layout, listing, error**

`frontend/src/app/(public)/catalog/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Footer, Navbar } from '../(landing-page)/landing-page';

/** Public chrome around the catalog pages. */
export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-6">{children}</main>
      <Footer />
    </div>
  );
}
```

`frontend/src/app/(public)/catalog/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CatalogFilters, CatalogPagination, CatalogProductCard } from '@/components/catalog';
import { getPublicCategories, getPublicMotorcycleModels, getPublicProducts } from '@/lib/public/catalogApi';
import type { CatalogQuery } from '@/types/catalog';

export const metadata: Metadata = {
  title: 'Parts catalog | E-Talyer',
  description: 'Motorcycle parts in stock at Joemar Motor Parts & Services branches.',
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const toQuery = (params: SearchParams): CatalogQuery => {
  const page = Number.parseInt(first(params.page) ?? '1', 10);
  return {
    search: first(params.search) || undefined,
    category: first(params.category) || undefined,
    motorcycle_model: first(params.motorcycle_model) || undefined,
    sort: first(params.sort) || undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
};

/** The public parts catalog: filters, a grid of products and pagination. */
export default async function CatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = toQuery(await searchParams);
  const [listing, categories, motorcycleModels] = await Promise.all([
    getPublicProducts(query),
    getPublicCategories(),
    getPublicMotorcycleModels(),
  ]);
  const filtered = Boolean(query.search || query.category || query.motorcycle_model);

  return (
    <>
      <h1 className="text-2xl font-bold text-black">Parts catalog</h1>
      <p className="mt-2 mb-6 text-base text-gray-500">
        {listing.pagination.total} {listing.pagination.total === 1 ? 'part' : 'parts'}. Prices may vary by branch; confirm at the counter.
      </p>
      <CatalogFilters categories={categories} motorcycleModels={motorcycleModels} current={query} />
      {listing.data.length > 0 ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {listing.data.map((product) => <CatalogProductCard key={product._id} product={product} />)}
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-lg font-bold text-black">
            {(query.page ?? 1) > 1 && listing.pagination.total > 0 ? 'No parts on this page' : 'No parts match these filters'}
          </p>
          {(filtered || (query.page ?? 1) > 1) && (
            <Link href="/catalog" className="mt-4 inline-block rounded-lg bg-yellow-400 px-4 py-2 font-medium text-black">
              Show all parts
            </Link>
          )}
        </div>
      )}
      <CatalogPagination query={query} page={listing.pagination.page} pages={listing.pagination.pages} />
    </>
  );
}
```

`frontend/src/app/(public)/catalog/error.tsx`:

```tsx
'use client';

/** Shown when the catalog cannot be read, instead of an unhandled error. */
export default function CatalogError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 p-8 text-center">
      <h1 className="text-xl font-bold text-black">The catalog is unavailable right now</h1>
      <p className="mt-2 text-base text-gray-500">Please try again shortly.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-lg bg-yellow-400 px-4 py-2 font-medium text-black">
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Detail page and not-found**

`frontend/src/app/(public)/catalog/[product_id]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { BranchAvailability } from '@/components/catalog';
import { getPublicProduct } from '@/lib/public/catalogApi';
import { formatFitment } from '@/lib/public/formatFitment';
import { resolveImageUrl } from '@/lib/images/resolveImageUrl';
import { formatCurrency } from '@/types/service';

type Params = Promise<{ product_id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await getPublicProduct((await params).product_id);
  if (!product) return { title: 'Part not found | E-Talyer' };
  return {
    title: `${product.name} | E-Talyer`,
    description: product.description.slice(0, 160) || `${product.name}, available at Joemar Motor Parts & Services.`,
    openGraph: { images: product.primaryImage ? [resolveImageUrl(product.primaryImage)] : [] },
  };
}

/** One public product: images, details, price and where it is stocked. */
export default async function CatalogProductPage({ params }: { params: Params }) {
  const product = await getPublicProduct((await params).product_id);
  if (!product) notFound();
  const image = product.primaryImage ? resolveImageUrl(product.primaryImage) : null;

  return (
    <>
      <Link href="/catalog" className="text-sm font-medium text-black underline">Back to catalog</Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div className="relative aspect-square w-full rounded-lg bg-gray-100">
          {image ? (
            <Image src={image} alt={product.name} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-contain" priority />
          ) : (
            <div className="flex h-full items-center justify-center"><Package className="h-16 w-16 text-gray-400" aria-hidden="true" /></div>
          )}
        </div>
        <div>
          {product.category && <p className="text-sm font-medium uppercase text-gray-500">{product.category.name}</p>}
          <h1 className="mt-1 text-2xl font-bold text-black">{product.name}</h1>
          {(product.brand || product.productModel) && (
            <p className="mt-1 text-base text-gray-500">{[product.brand, product.productModel].filter(Boolean).join(' · ')}</p>
          )}
          <p className="mt-4 text-2xl font-bold text-black">{formatCurrency(product.sellingPrice)}</p>
          <p className="mt-1 text-xs text-gray-500">Price may vary by branch; confirm at the counter.</p>
          {product.motorcycleModels.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-bold text-black">Fits</h2>
              <ul className="mt-2 list-inside list-disc text-base text-black">
                {product.motorcycleModels.map((model) => <li key={model._id}>{formatFitment(model)}</li>)}
              </ul>
            </section>
          )}
          {product.description && (
            <section className="mt-6">
              <h2 className="text-lg font-bold text-black">Details</h2>
              <p className="mt-2 whitespace-pre-line text-base text-black">{product.description}</p>
            </section>
          )}
        </div>
      </div>
      <section className="mt-8">
        <h2 className="mb-4 text-xl font-bold text-black">Where to buy</h2>
        <BranchAvailability branches={product.branches} />
      </section>
    </>
  );
}
```

`frontend/src/app/(public)/catalog/[product_id]/not-found.tsx`:

```tsx
import Link from 'next/link';

/** A product link that no longer resolves: unknown, hidden or discontinued. */
export default function ProductNotFound() {
  return (
    <div className="rounded-lg border border-gray-200 p-8 text-center">
      <h1 className="text-xl font-bold text-black">This part is no longer listed</h1>
      <Link href="/catalog" className="mt-4 inline-block rounded-lg bg-yellow-400 px-4 py-2 font-medium text-black">Browse the catalog</Link>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm test`
Expected: tsc exit 0, lint 0 errors, vitest PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/catalog "frontend/src/app/(public)"
git commit -m "feat: server-rendered public catalog and product pages"
```

---

### Task 8: Landing page shows real products

**Files:**
- Modify: `frontend/src/app/(public)/(landing-page)/page.tsx`, `landing-page.tsx` (remove `Product`, `SAMPLE_PRODUCTS`, the local `ProductCard`; `LandingPage` takes `products`)

- [ ] **Step 1: Server entry fetches the newest products**

```tsx
import LandingPage from './landing-page';
import { getPublicProducts } from '@/lib/public/catalogApi';
import type { PublicProduct } from '@/utils/validators/publicCatalog';

// Regenerated at most once a minute; set explicitly because a build-time fetch
// that fails must not freeze the page as static with no products.
export const revalidate = 60;

/** The newest listed products; the landing page hides the section if none load. */
const featuredProducts = async (): Promise<PublicProduct[]> => {
  try {
    return (await getPublicProducts({ sort: 'newest', limit: 8 })).data;
  } catch {
    return [];
  }
};

export default async function Page() {
  return <LandingPage products={await featuredProducts()} />;
}
```

- [ ] **Step 2: `landing-page.tsx` renders them**

- Delete `interface Product`, `SAMPLE_PRODUCTS` and the local `ProductCard` component.
- Import `import { CatalogProductCard } from '@/components/catalog/CatalogProductCard';` and `import type { PublicProduct } from '@/utils/validators/publicCatalog';`.
- `FeaturedProductsSection` becomes `React.FC<{ products: PublicProduct[] }>`, returns `null` when `products.length === 0`, renders `<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">` of `<CatalogProductCard key={product._id} product={product} />`, and its "View All Products" link goes to `/catalog`.
- `function LandingPage({ products }: { products: PublicProduct[] })`, delete `const [products] = useState<Product[]>(SAMPLE_PRODUCTS);` and the "In a real app" comment.

- [ ] **Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: all exit 0; the build logs `/` as ISR (revalidate 60) and `/catalog` routes as dynamic.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(public)/(landing-page)"
git commit -m "feat: landing page shows the newest real products"
```

---

### Task 9: Configuration, alert and docs

**Files:**
- Modify: `docker-compose.yml` (frontend service), `monitoring/rules/talyer.yml`, `CLAUDE.md` (Environment, Frontend architecture), `README.md` (regenerated endpoint list)

- [ ] **Step 1: Compose**

Add to the frontend service (sibling of `build:`):

```yaml
    environment:
      # Server-side catalog reads (React server components). Inside the
      # compose network `localhost` is this container, so name the backend
      # service. Same in every environment, so no deploy variable.
      API_INTERNAL_URL: http://backend:5000/api
```

- [ ] **Step 2: Alert rule** (append under the backend group's `rules:`)

```yaml
      - alert: TalyerPublicCatalogRateLimited
        expr: sum by (project) (rate(http_request_duration_seconds_count{project=~"talyer-.*", route=~"/api/public/.*", status_code="429"}[5m])) > 0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.project }} public catalog is being rate limited"
          description: >-
            Server-rendered catalog pages share one rate-limit bucket (the
            frontend container's address). Sustained 429s mean the public site
            is showing its error page. See the ponytail note in
            backend/src/routes/publicRoutes.js for the fix.
```

- [ ] **Step 3: Docs**

- `CLAUDE.md` Environment: add `API_INTERNAL_URL` to the frontend variables, runtime (not `NEXT_PUBLIC_*`), set in `docker-compose.yml`, fallback `NEXT_PUBLIC_API_URL`.
- `CLAUDE.md` Frontend architecture: a short "Public catalog" paragraph: `/api/public` + allow-list serializer, server components through `lib/public/catalogApi.ts`, staff product reads are staff-only, and the shared rate-limit bucket.
- Run `python scripts/gen_endpoints.py` then `python scripts/gen_endpoints.py --check`.

- [ ] **Step 4: Verify and commit**

Run: `python -c "import yaml;yaml.safe_load(open('monitoring/rules/talyer.yml'));yaml.safe_load(open('docker-compose.yml'))" && python scripts/gen_endpoints.py --check`
Expected: no error; "README lists all 92 routes."

```bash
git add docker-compose.yml monitoring/rules/talyer.yml CLAUDE.md README.md
git commit -m "chore: wire the internal API URL, alert on catalog rate limiting, document the catalog"
```

---

### Task 10: End-to-end verification with Playwright

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/e2e/catalog.spec.ts`, `frontend/e2e/seed.ts`
- Modify: `frontend/package.json` (devDependency `@playwright/test` pinned to the version whose Chromium build is already installed locally; script `"test:e2e": "playwright test"`), `frontend/eslint.config.mjs` only if lint rejects the e2e files

**Interfaces:**
- Consumes: the running stack (`docker compose -p talyer-e2e up --build` with process-env secrets and `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`), backend admin API for seeding.

- [ ] **Step 1: Seed through the real API** (`e2e/seed.ts`): log in as the seeded admin, create two branches, a category, a motorcycle model, and four products (one with image URL, one with no image/brand/category-less fitment, one fully reserved, one discontinued) with stock rows, returning their ids. Idempotent by unique names per run (`E2E <timestamp>`).
- [ ] **Step 2: Specs** (`e2e/catalog.spec.ts`):
  - Landing `/` shows real product names from the seed, no "$" prices, "View All Products" goes to `/catalog`.
  - `/catalog` lists seeded products, search "click" finds the fitted part, category and fitment filters narrow, sort price low to high orders prices ascending, pagination Next and Previous work when there are more than 24.
  - `/catalog?category=abc` shows the unfiltered catalog; `/catalog?page=99` shows "No parts on this page" with "Show all parts".
  - Product page shows price, the branch-price line, branches with text labels, and the reserved product reads "Out of stock".
  - A discontinued product id and `/catalog/not-an-id` show "This part is no longer listed".
  - No page response body or DOM contains `costPrice` or `profitMargin`.
  - At 320px width the grid is two columns, no horizontal scroll (`document.documentElement.scrollWidth <= 320`).
- [ ] **Step 3: Backend-down check**: stop the backend container; `/` still renders without the products section; `/catalog` shows "The catalog is unavailable right now". Start it again.
- [ ] **Step 4: Exploratory UX pass** with Playwright screenshots at 320, 768 and 1280 widths of `/`, `/catalog`, a product page; fix every layout, copy or behaviour bug found, re-running the affected unit tests and the e2e suite after each fix.
- [ ] **Step 5: Full verification**: `cd backend && npm test`; `cd frontend && npm test && npm run lint && npm run build && npm run test:e2e`; tear down with `docker compose -p talyer-e2e down -v`.
- [ ] **Step 6: Commit and open the PR**

```bash
git add frontend/playwright.config.ts frontend/e2e frontend/package.json frontend/package-lock.json
git commit -m "test: end-to-end checks for the public catalog"
git push
gh pr create --base master --title "feat: public product catalog" --body "<summary, test evidence, screenshots>"
```
