import request from 'supertest';
import express from 'express';
import errorHandler from '../src/middleware/errorHandler.js';

const buildApp = () => {
  const app = express();
  app.get('/boom', () => {
    throw new Error('connection <mongodb://user:pass@host> refused');
  });
  app.get('/bad-request', (req, res, next) => {
    const err = new Error('Quantity must be at least 1');
    err.statusCode = 400;
    next(err);
  });
  app.use(errorHandler);
  return app;
};

describe('errorHandler', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it('hides internal 500 messages in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(buildApp()).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Server Error');
    expect(JSON.stringify(res.body)).not.toContain('mongodb://');
    expect(res.body.stack).toBeUndefined();
  });

  it('still returns actionable 4xx messages in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(buildApp()).get('/bad-request');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Quantity must be at least 1');
  });

  it('returns the real message and stack in development', async () => {
    process.env.NODE_ENV = 'development';
    const res = await request(buildApp()).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('refused');
    expect(res.body.stack).toBeDefined();
  });
});

// GAP-005. The gate used to be `NODE_ENV === 'production'` guarding the safe
// branch, so anything else, including an unset or misspelled value, disclosed
// the raw 5xx message and a full stack trace. It is now an affirmative test for
// development or test.
describe('errorHandler fails closed on an unrecognised NODE_ENV', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it.each(['staging', 'PRODUCTION', 'prod', 'developement', ''])(
    'hides the message and stack when NODE_ENV is %p',
    async (value) => {
      process.env.NODE_ENV = value;
      const res = await request(buildApp()).get('/boom');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Server Error');
      expect(res.body.stack).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('mongodb://');
    }
  );

  it('hides the message and stack when NODE_ENV is unset entirely', async () => {
    delete process.env.NODE_ENV;
    const res = await request(buildApp()).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Server Error');
    expect(res.body.stack).toBeUndefined();
  });

  it('still discloses in development, which the local workflow relies on', async () => {
    process.env.NODE_ENV = 'development';
    const res = await request(buildApp()).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('connection');
    expect(res.body.stack).toBeDefined();
  });

  it('still returns actionable 4xx messages when failing closed', async () => {
    process.env.NODE_ENV = 'staging';
    const res = await request(buildApp()).get('/bad-request');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Quantity must be at least 1');
  });
});

// GAP-003. The duplicate-key branch matched `err.name === 'MongoServerError'`
// as well as code 11000, and MongoServerError is the name the driver gives
// every server-side failure: failover, stepdown, write-concern timeout, pool
// exhaustion. All were answered 400 "Field already exists". The offline outbox
// treats a 4xx as permanent and marks the entry rejected, so a Mongo failover
// during replay discarded real sales.
describe('errorHandler distinguishes duplicate keys from transient Mongo failures', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  const appWith = (err) => {
    const app = express();
    app.get('/x', () => {
      throw err;
    });
    app.use(errorHandler);
    return app;
  };

  const mongoError = (name, code, extra = {}) => {
    const err = new Error(`${name} ${code}`);
    err.name = name;
    if (code !== undefined) err.code = code;
    return Object.assign(err, extra);
  };

  it('still answers 400 for a real duplicate key', async () => {
    process.env.NODE_ENV = 'test';
    const err = mongoError('MongoServerError', 11000, { keyPattern: { sku: 1 } });

    const res = await request(appWith(err)).get('/x');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Sku already exists');
  });

  it.each([
    ['a failover', 10107],
    ['a stepdown', 189],
    ['a write concern timeout', 64],
    ['an interrupted operation', 11601],
  ])('answers 5xx for %s, so the outbox retries instead of discarding', async (_label, code) => {
    process.env.NODE_ENV = 'test';
    const err = mongoError('MongoServerError', code);

    const res = await request(appWith(err)).get('/x');

    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it('answers 5xx for a MongoServerError carrying no code at all', async () => {
    process.env.NODE_ENV = 'test';
    const err = mongoError('MongoServerError', undefined);

    const res = await request(appWith(err)).get('/x');

    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it('answers 400 for code 11000 even when the driver names it something else', async () => {
    process.env.NODE_ENV = 'test';
    const err = mongoError('MongoBulkWriteError', 11000, { keyValue: { barcode: 'X1' } });

    const res = await request(appWith(err)).get('/x');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Barcode already exists');
  });
});
