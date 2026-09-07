import request from 'supertest';
import express from 'express';
import sanitizeRequest from '../src/middleware/sanitizeRequest.js';

// No database: this suite exercises the guard against a bare app, the same way
// errorHandler.test.js and csrf.test.js do. That matters because it means it
// still runs in a sandbox where mongodb-memory-server cannot fetch its binary.
const buildApp = () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(sanitizeRequest);
  app.all('/echo', (req, res) => res.status(200).json({ body: req.body, query: req.query }));
  app.get('/echo/:id', (req, res) => res.status(200).json({ params: req.params }));
  return app;
};

describe('sanitizeRequest', () => {
  describe('rejects Mongo operator keys in a JSON body', () => {
    it('at the top level', async () => {
      const res = await request(buildApp()).post('/echo').send({ email: 'a@b.com', $where: '1' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('$where');
    });

    it('nested inside an object value, which is the real shape of the attack', async () => {
      const res = await request(buildApp()).post('/echo').send({ mechanicId: { $ne: null } });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('$ne');
    });

    it('nested inside an array element', async () => {
      const res = await request(buildApp())
        .post('/echo')
        .send({ partsUsed: [{ product: { $ne: null }, quantity: 1 }] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('$ne');
    });

    it('several levels down', async () => {
      const res = await request(buildApp()).post('/echo').send({ a: { b: { c: { $gt: '' } } } });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('$gt');
    });

    it('as an update operator, which is what findByIdAndUpdate(id, req.body) would run', async () => {
      const res = await request(buildApp()).post('/echo').send({ $unset: { isActive: 1 } });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('$unset');
    });
  });

  it('rejects a dotted key, which writes into a nested path in an update document', async () => {
    const res = await request(buildApp()).post('/echo').send({ 'payment.status': 'paid' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('payment.status');
  });

  // express.urlencoded({ extended: true }) uses qs, so unlike the query string
  // it does build nested objects. This is a second live path into the same sink.
  it('rejects an operator key from an extended urlencoded body', async () => {
    const res = await request(buildApp())
      .post('/echo')
      .type('form')
      .send('mechanicId[$ne]=x');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('$ne');
  });

  describe('lets legitimate traffic through unchanged', () => {
    it('an ordinary nested body', async () => {
      const body = {
        branch: '507f1f77bcf86cd799439011',
        customer: { name: 'Ana', phone: '09171234567' },
        items: [{ product: '507f1f77bcf86cd799439012', quantity: 2, discount: 0 }],
        paymentMethod: 'cash',
      };
      const res = await request(buildApp()).post('/echo').send(body);

      expect(res.status).toBe(200);
      expect(res.body.body).toEqual(body);
    });

    it('an empty body', async () => {
      const res = await request(buildApp()).post('/echo').send({});

      expect(res.status).toBe(200);
    });

    it('a value that merely contains a dollar sign or a dot', async () => {
      const res = await request(buildApp()).post('/echo').send({ notes: 'PHP $5.00 paid' });

      expect(res.status).toBe(200);
      expect(res.body.body.notes).toBe('PHP $5.00 paid');
    });

    it('a normal query string, including a repeated parameter', async () => {
      const res = await request(buildApp()).get('/echo?status=pending&status=completed');

      expect(res.status).toBe(200);
      expect(res.body.query.status).toEqual(['pending', 'completed']);
    });

    it('a route parameter', async () => {
      const res = await request(buildApp()).get('/echo/507f1f77bcf86cd799439011');

      expect(res.status).toBe(200);
      expect(res.body.params.id).toBe('507f1f77bcf86cd799439011');
    });
  });

  // Express 5's default query parser is `simple`, so this arrives as one
  // literal key rather than a nested object and is harmless today. The guard
  // still walks the query string so it keeps holding if that ever changes.
  it('leaves the literal bracket key Express 5 produces from ?x[$ne]=1 alone', async () => {
    const res = await request(buildApp()).get('/echo?search%5B%24ne%5D=1');

    expect(res.status).toBe(200);
    expect(res.body.query['search[$ne]']).toBe('1');
  });

  describe('cannot be turned into a denial of service itself', () => {
    it('answers rather than throwing on a body nested past the depth bound', async () => {
      let deep = {};
      const root = deep;
      for (let i = 0; i < 500; i += 1) {
        deep.next = {};
        deep = deep.next;
      }
      deep.value = 'leaf';

      const res = await request(buildApp()).post('/echo').send(root);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('nested too deeply');
    });

    it('answers rather than hanging on a body with very many keys', async () => {
      const wide = {};
      for (let i = 0; i < 20000; i += 1) wide[`k${i}`] = i;

      const res = await request(buildApp()).post('/echo').send(wide);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('too large to inspect');
    });
  });
});
