import redis from 'redis';

let redisClient = null;

// Redis is optional (CacheUtil no-ops when getRedisClient() is falsy), but
// node-redis's default reconnectStrategy retries an unreachable server
// forever with backoff, and neither that retry loop nor the initial
// connect() attempt is bounded by default. Both a bounded per-attempt
// timeout and a fail-fast reconnect strategy are set here so a missing or
// unreachable Redis can only ever delay startup by a few seconds — it must
// never hang it. connectRedis() is also called without being awaited on the
// server startup path (see server.js), so app.listen() is never gated on
// this resolving at all; the bounds below mainly stop the client from
// retrying/logging forever in the background.
const CONNECT_TIMEOUT_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 3;

const connectRedis = async () => {
  const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries) => {
        if (retries >= MAX_RECONNECT_ATTEMPTS) {
          console.error(
            `Redis: giving up after ${retries} failed connection attempts; continuing without cache.`
          );
          return new Error('Redis reconnect attempts exhausted');
        }
        return Math.min(retries * 100, 1000);
      },
    },
  });

  // Handle Redis errors. A listener must be attached before connect() is
  // called, or an unhandled 'error' event would crash the process.
  client.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  client.on('connect', () => {
    console.log('Redis connecting...');
  });

  client.on('ready', () => {
    console.log('Redis client ready');
  });

  client.on('end', () => {
    console.log('Redis client disconnected');
    // Only clear the shared reference if this is still the active client —
    // guards against a superseded client's late 'end' event clobbering a
    // newer connection's reference.
    if (redisClient === client) {
      redisClient = null;
    }
  });

  try {
    await client.connect();
    redisClient = client;
    console.log(`Redis Connected: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
    return redisClient;
  } catch (error) {
    console.error(`Error connecting to Redis: ${error.message}`);
    console.log('Continuing without Redis (cache disabled).');
    // A failed connect() must leave the shared reference falsy — CacheUtil's
    // `if (!client) return null/false` guards are dead otherwise, and every
    // cache call would instead fail per-operation against a broken client.
    redisClient = null;
    return null;
  }
};

// Helper function to get Redis client
const getRedisClient = () => {
  return redisClient;
};

// Graceful shutdown
process.on('SIGINT', async () => {
  if (redisClient) {
    await redisClient.quit();
    console.log('Redis connection closed through app termination');
  }
});

export { connectRedis, getRedisClient };
