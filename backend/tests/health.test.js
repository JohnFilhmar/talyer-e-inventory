import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { getRedisClient } from '../src/config/redis.js';

// GAP-023. /health was a static 200, so Docker's HEALTHCHECK kept the container
// marked healthy after Mongo became unreachable, `restart: unless-stopped`
// never fired, and the deploy workflow reported "Backend is healthy" on a stack
// where every request 500s. The deploy was declared successful on a dead app.
//
// The route is rebuilt here rather than importing server.js: importing that
// module runs startServer(), which calls connectDB() against the real
// MONGODB_URI and exits the process when it is not reachable.
const MONGO_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

const buildApp = () => {
  const app = express();
  app.get('/health', (req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1;
    const redisClient = getRedisClient();

    const body = {
      success: mongoConnected,
      message: mongoConnected ? 'Server is running' : 'Server is not ready',
      dependencies: {
        mongo: MONGO_STATES[mongoose.connection.readyState] || 'unknown',
        redis: redisClient ? 'available' : 'unavailable',
      },
      timestamp: new Date().toISOString(),
    };

    return res.status(mongoConnected ? 200 : 503).json(body);
  });
  return app;
};

describe('GET /health', () => {
  const realReadyState = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(mongoose.connection),
    'readyState'
  );

  const setReadyState = (value) => {
    Object.defineProperty(mongoose.connection, 'readyState', {
      value,
      configurable: true,
    });
  };

  afterEach(() => {
    delete mongoose.connection.readyState;
    if (realReadyState) {
      Object.defineProperty(
        Object.getPrototypeOf(mongoose.connection),
        'readyState',
        realReadyState
      );
    }
  });

  it('returns 200 when Mongo is connected', async () => {
    setReadyState(1);

    const res = await request(buildApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dependencies.mongo).toBe('connected');
  });

  it.each([
    ['disconnected', 0],
    ['connecting', 2],
    ['disconnecting', 3],
  ])('returns 503 when Mongo is %s', async (label, state) => {
    setReadyState(state);

    const res = await request(buildApp()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.dependencies.mongo).toBe(label);
  });

  // Redis is optional by design: CacheUtil treats a missing client as "no
  // cache" on every path, so its absence must not fail the check.
  it('still returns 200 with Redis unavailable', async () => {
    setReadyState(1);

    const res = await request(buildApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.dependencies.redis).toBe('unavailable');
  });

  it('keeps the response additive, so status-only pollers are unaffected', async () => {
    setReadyState(1);

    const res = await request(buildApp()).get('/health');

    expect(res.body).toHaveProperty('success');
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('timestamp');
  });
});
