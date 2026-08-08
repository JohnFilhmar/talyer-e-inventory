import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestUser, createTestAdmin } from './setup/testHelpers.js';
import motorcycleModelRoutes from '../src/routes/motorcycleModelRoutes.js';
import MotorcycleModel from '../src/models/MotorcycleModel.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Branch from '../src/models/Branch.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/motorcycle-models', motorcycleModelRoutes);

beforeAll(async () => {
  await dbHandler.connect();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

const createTestMotorcycleModel = async (data = {}) => {
  return MotorcycleModel.create({
    make: data.make || 'Honda',
    model: data.model || 'Click 125i',
    ...data
  });
};

describe('Motorcycle Model API Tests', () => {
  let adminToken;
  let userToken;
  let branch;

  beforeEach(async () => {
    branch = await Branch.create({
      name: 'Test Branch',
      code: 'TEST-001',
      address: { street: '123 St', city: 'Test City', province: 'Province' },
      contact: { phone: '+63 2 1234 5678', email: 'test@branch.com' }
    });

    const admin = await createTestAdmin();
    adminToken = admin.token;

    const user = await createTestUser({
      name: 'Regular User',
      email: 'user@example.com',
      role: 'salesperson',
      branch: branch._id
    });
    userToken = user.token;
  });

  describe('GET /api/motorcycle-models', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/motorcycle-models');
      expect(res.status).toBe(401);
    });

    it('should return all motorcycle models to any authenticated user', async () => {
      await createTestMotorcycleModel({ make: 'Honda', model: 'Click 125i' });
      await createTestMotorcycleModel({ make: 'Yamaha', model: 'Mio i 125' });

      const res = await request(app)
        .get('/api/motorcycle-models')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should sort by make then model', async () => {
      await createTestMotorcycleModel({ make: 'Yamaha', model: 'Mio i 125' });
      await createTestMotorcycleModel({ make: 'Honda', model: 'PCX 160' });
      await createTestMotorcycleModel({ make: 'Honda', model: 'Click 125i' });

      const res = await request(app)
        .get('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.data.map((m) => `${m.make} ${m.model}`)).toEqual([
        'Honda Click 125i',
        'Honda PCX 160',
        'Yamaha Mio i 125'
      ]);
    });

    it('should filter by make', async () => {
      await createTestMotorcycleModel({ make: 'Honda', model: 'Click 125i' });
      await createTestMotorcycleModel({ make: 'Yamaha', model: 'Mio i 125' });

      const res = await request(app)
        .get('/api/motorcycle-models?make=honda')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].model).toBe('Click 125i');
    });

    it('should filter by active state', async () => {
      await createTestMotorcycleModel({ make: 'Honda', model: 'Click 125i' });
      await createTestMotorcycleModel({
        make: 'Honda',
        model: 'Wave 110',
        isActive: false
      });

      const res = await request(app)
        .get('/api/motorcycle-models?active=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].model).toBe('Click 125i');
    });

    it('should search across make and model', async () => {
      await createTestMotorcycleModel({ make: 'Honda', model: 'Click 125i' });
      await createTestMotorcycleModel({ make: 'Yamaha', model: 'Mio i 125' });

      const res = await request(app)
        .get('/api/motorcycle-models?search=click')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].model).toBe('Click 125i');
    });

    it('should treat regex metacharacters in search as literal text', async () => {
      await createTestMotorcycleModel({ make: 'Honda', model: 'Click 125i (V2)' });

      const res = await request(app)
        .get('/api/motorcycle-models?search=(V2)')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/motorcycle-models/makes', () => {
    it('should return the distinct sorted list of makes', async () => {
      await createTestMotorcycleModel({ make: 'Yamaha', model: 'Mio i 125' });
      await createTestMotorcycleModel({ make: 'Honda', model: 'Click 125i' });
      await createTestMotorcycleModel({ make: 'Honda', model: 'PCX 160' });

      const res = await request(app)
        .get('/api/motorcycle-models/makes')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(['Honda', 'Yamaha']);
    });

    it('should not be shadowed by the :id route', async () => {
      const res = await request(app)
        .get('/api/motorcycle-models/makes')
        .set('Authorization', `Bearer ${adminToken}`);

      // A shadowed route would 400 on "makes" failing isMongoId.
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/motorcycle-models/:id', () => {
    it('should return a single motorcycle model', async () => {
      const created = await createTestMotorcycleModel();

      const res = await request(app)
        .get(`/api/motorcycle-models/${created._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.model).toBe('Click 125i');
    });

    it('should 404 for a missing motorcycle model', async () => {
      const res = await request(app)
        .get('/api/motorcycle-models/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should 400 for an invalid id', async () => {
      const res = await request(app)
        .get('/api/motorcycle-models/not-an-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/motorcycle-models', () => {
    it('should create a motorcycle model as admin', async () => {
      const res = await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023 });

      expect(res.status).toBe(201);
      expect(res.body.data.make).toBe('Honda');
      expect(res.body.data.code).toBe('HONDA-CLICK-125I-2018-2023');
      expect(res.body.data.displayName).toBe('Honda Click 125i (2018-2023)');
    });

    it('should reject creation by a non-admin', async () => {
      const res = await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ make: 'Honda', model: 'Click 125i' });

      expect(res.status).toBe(403);
    });

    it('should require make and model', async () => {
      const res = await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ make: 'Honda' });

      expect(res.status).toBe(400);
    });

    it('should reject a year range that runs backwards', async () => {
      const res = await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ make: 'Honda', model: 'Click 125i', yearFrom: 2023, yearTo: 2018 });

      expect(res.status).toBe(400);
    });

    it('should reject an implausible year', async () => {
      const res = await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ make: 'Honda', model: 'Click 125i', yearFrom: 20222 });

      expect(res.status).toBe(400);
    });

    it('should reject a duplicate regardless of capitalisation', async () => {
      await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ make: 'Honda', model: 'Click 125i' });

      const res = await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ make: 'HONDA', model: 'click 125i' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should allow the same model with a different year range', async () => {
      await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ make: 'Honda', model: 'Click 125i', yearFrom: 2015, yearTo: 2017 });

      const res = await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023 });

      expect(res.status).toBe(201);
    });

    it('should render an open-ended range in displayName', async () => {
      const res = await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ make: 'Honda', model: 'PCX 160', yearFrom: 2021 });

      expect(res.body.data.displayName).toBe('Honda PCX 160 (2021+)');
    });
  });

  describe('PUT /api/motorcycle-models/:id', () => {
    it('should update a motorcycle model as admin', async () => {
      const created = await createTestMotorcycleModel();

      const res = await request(app)
        .put(`/api/motorcycle-models/${created._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ model: 'Click 150i' });

      expect(res.status).toBe(200);
      expect(res.body.data.model).toBe('Click 150i');
    });

    it('should regenerate the code when the identity changes', async () => {
      const created = await createTestMotorcycleModel();
      expect(created.code).toBe('HONDA-CLICK-125I');

      const res = await request(app)
        .put(`/api/motorcycle-models/${created._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ model: 'Click 150i' });

      expect(res.body.data.code).toBe('HONDA-CLICK-150I');

      // The old identity must be free again, or a genuine Click 125i could
      // never be re-added after a rename.
      const reAdd = await request(app)
        .post('/api/motorcycle-models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ make: 'Honda', model: 'Click 125i' });

      expect(reAdd.status).toBe(201);
    });

    it('should reject an update that collides with another model', async () => {
      await createTestMotorcycleModel({ make: 'Honda', model: 'Click 125i' });
      const other = await createTestMotorcycleModel({ make: 'Honda', model: 'PCX 160' });

      const res = await request(app)
        .put(`/api/motorcycle-models/${other._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ model: 'Click 125i' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should reject an update by a non-admin', async () => {
      const created = await createTestMotorcycleModel();

      const res = await request(app)
        .put(`/api/motorcycle-models/${created._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ model: 'Click 150i' });

      expect(res.status).toBe(403);
    });

    it('should 404 for a missing motorcycle model', async () => {
      const res = await request(app)
        .put('/api/motorcycle-models/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ model: 'Click 150i' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/motorcycle-models/:id', () => {
    it('should soft delete a motorcycle model', async () => {
      const created = await createTestMotorcycleModel();

      const res = await request(app)
        .delete(`/api/motorcycle-models/${created._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const reloaded = await MotorcycleModel.findById(created._id);
      expect(reloaded.isActive).toBe(false);
    });

    it('should refuse to delete a motorcycle model still used by products', async () => {
      const category = await Category.create({ name: 'Engine Parts' });
      const created = await createTestMotorcycleModel();

      await Product.create({
        name: 'Brake Pad',
        category: category._id,
        costPrice: 100,
        sellingPrice: 150,
        motorcycleModels: [created._id]
      });

      const res = await request(app)
        .delete(`/api/motorcycle-models/${created._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/1 product/i);

      const reloaded = await MotorcycleModel.findById(created._id);
      expect(reloaded.isActive).toBe(true);
    });

    it('should reject deletion by a non-admin', async () => {
      const created = await createTestMotorcycleModel();

      const res = await request(app)
        .delete(`/api/motorcycle-models/${created._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/motorcycle-models/:id/restore', () => {
    const archived = async () => {
      const created = await MotorcycleModel.create({
        make: 'Honda',
        model: 'Beat',
        yearFrom: 2015,
        isActive: false
      });
      return created;
    };

    it('brings an archived model back', async () => {
      const motorcycleModel = await archived();

      const res = await request(app)
        .patch(`/api/motorcycle-models/${motorcycleModel._id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);

      const stored = await MotorcycleModel.findById(motorcycleModel._id).lean();
      expect(stored.isActive).toBe(true);
    });

    it('makes the model selectable again as active', async () => {
      const motorcycleModel = await archived();

      const before = await request(app)
        .get('/api/motorcycle-models?active=true')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(before.body.data.map((m) => m._id)).not.toContain(String(motorcycleModel._id));

      await request(app)
        .patch(`/api/motorcycle-models/${motorcycleModel._id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);

      const after = await request(app)
        .get('/api/motorcycle-models?active=true')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(after.body.data.map((m) => m._id)).toContain(String(motorcycleModel._id));
    });

    it('preserves the derived code, which a query-middleware update would skip', async () => {
      const motorcycleModel = await archived();
      const codeBefore = motorcycleModel.code;

      const res = await request(app)
        .patch(`/api/motorcycle-models/${motorcycleModel._id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.code).toBe(codeBefore);
    });

    it('is idempotent on an already-active model', async () => {
      const motorcycleModel = await MotorcycleModel.create({ make: 'Honda', model: 'Click' });

      const res = await request(app)
        .patch(`/api/motorcycle-models/${motorcycleModel._id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);
    });

    it('404s for an unknown id', async () => {
      const res = await request(app)
        .patch('/api/motorcycle-models/507f1f77bcf86cd799439011/restore')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('refuses a non-admin', async () => {
      const motorcycleModel = await archived();

      const res = await request(app)
        .patch(`/api/motorcycle-models/${motorcycleModel._id}/restore`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);

      const stored = await MotorcycleModel.findById(motorcycleModel._id).lean();
      expect(stored.isActive).toBe(false);
    });
  });
});
