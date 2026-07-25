import request from 'supertest';
import express from 'express';
import { authLimiter, apiLimiter } from '../src/middleware/rateLimit.js';

/**
 * Both limiters `skip` whenever NODE_ENV === 'test' (see rateLimit.js), which
 * is exactly the value tests/setup/testEnv.js sets before every suite. That
 * keeps the rest of the test base free of rate-limit noise, but it also means
 * these specific tests must flip NODE_ENV to something else to observe the
 * limiters actually limiting, then restore it so no other suite is affected.
 */
const buildApp = () => {
  const app = express();
  app.get('/broad', apiLimiter, (req, res) => res.status(200).json({ ok: true }));
  app.get('/strict', authLimiter, (req, res) => res.status(200).json({ ok: true }));
  return app;
};

describe('rate limiters', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('does not 429 an apiLimiter-guarded route by the 11th sequential request', async () => {
    // This is the property that broke: authRoutes such as GET /me and
    // POST /refresh-token are called automatically by the SPA and must be
    // covered by the broad 300-request limiter, not the strict one.
    const app = buildApp();
    const statuses = [];

    for (let i = 0; i < 11; i++) {
      const res = await request(app).get('/broad');
      statuses.push(res.status);
    }

    expect(statuses).toEqual(Array(11).fill(200));
  });

  it('429s an authLimiter-guarded route after 10 sequential requests', async () => {
    const app = buildApp();
    const statuses = [];

    for (let i = 0; i < 12; i++) {
      const res = await request(app).get('/strict');
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
    expect(statuses[11]).toBe(429);
  });
});
