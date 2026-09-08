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
