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
