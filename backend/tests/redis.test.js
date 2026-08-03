// Regression tests for src/config/redis.js.
//
// This module cannot be exercised through a real Redis connection in CI, and
// importing src/server.js is off-limits for tests (see CLAUDE.md / user.test.js
// history), so these tests mock the `redis` package directly and assert on the
// two behaviors that were previously broken:
//
//   1. A failed initial connect() must leave getRedisClient() falsy — the
//      original code assigned `redisClient = redis.createClient(...)` before
//      calling connect(), so a failed connect left a broken, non-null client
//      behind and every CacheUtil `if (!client) return null` guard was dead.
//   2. The client is configured to fail fast (bounded connectTimeout, a
//      reconnectStrategy that gives up after a few attempts) instead of
//      node-redis's default of retrying an unreachable server forever — the
//      behavior that hung `await connectRedis()` past the docker-build smoke
//      test's 30s window.
//
// jest.resetModules() + a dynamic import per test gives each test a fresh
// copy of the module's `redisClient` closure variable.

const createMockClient = () => {
  const handlers = {};
  return {
    on: jest.fn((event, cb) => {
      handlers[event] = cb;
      return undefined;
    }),
    connect: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
    __handlers: handlers,
  };
};

describe('config/redis', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('resolves and exposes the client when the initial connection succeeds', async () => {
    const client = createMockClient();
    client.connect.mockResolvedValue(undefined);

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => client),
    }));

    const { connectRedis, getRedisClient } = await import('../src/config/redis.js');

    const result = await connectRedis();

    expect(result).toBe(client);
    expect(getRedisClient()).toBe(client);
  });

  it('leaves getRedisClient() falsy when the initial connection fails', async () => {
    const client = createMockClient();
    client.connect.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'));

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => client),
    }));

    const { connectRedis, getRedisClient } = await import('../src/config/redis.js');

    const result = await connectRedis();

    expect(result).toBeFalsy();
    // This is the regression check: before the fix, the module assigned
    // redisClient = client before connect() settled, so a failed connect
    // still left a truthy (but broken) client behind.
    expect(getRedisClient()).toBeFalsy();
  });

  it('configures a bounded connect timeout and a reconnect strategy that gives up', async () => {
    const client = createMockClient();
    client.connect.mockResolvedValue(undefined);
    const createClient = jest.fn(() => client);

    jest.doMock('redis', () => ({ createClient }));

    const { connectRedis } = await import('../src/config/redis.js');
    await connectRedis();

    expect(createClient).toHaveBeenCalledTimes(1);
    const options = createClient.mock.calls[0][0];

    // A bounded per-attempt timeout — not left to node-redis's/OS default,
    // which can exceed the smoke test's polling window on some networks.
    expect(typeof options.socket.connectTimeout).toBe('number');
    expect(options.socket.connectTimeout).toBeGreaterThan(0);
    expect(options.socket.connectTimeout).toBeLessThanOrEqual(10000);

    // The reconnect strategy must eventually give up (return an Error/false)
    // rather than retrying forever like node-redis's default strategy does.
    const strategy = options.socket.reconnectStrategy;
    expect(typeof strategy).toBe('function');

    const earlyResult = strategy(0);
    expect(typeof earlyResult).toBe('number');

    let gaveUp = false;
    for (let retries = 0; retries <= 20; retries += 1) {
      const outcome = strategy(retries);
      if (outcome === false || outcome instanceof Error) {
        gaveUp = true;
        break;
      }
    }
    expect(gaveUp).toBe(true);
  });
});
