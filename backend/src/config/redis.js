import redis from 'redis';
import logger from '../utils/logger.js';

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
          logger.error(
            { retries },
            'redis: giving up on reconnect, continuing without cache'
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
    logger.error({ err: { name: err.name, message: err.message } }, 'redis client error');
  });

  client.on('connect', () => {
    logger.info('redis connecting');
  });

  client.on('ready', () => {
    logger.info('redis ready');
  });

  client.on('end', () => {
    logger.warn('redis disconnected');
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
    logger.info({ url: process.env.REDIS_URL || 'redis://localhost:6379' }, 'redis connected');
    return redisClient;
  } catch (error) {
    logger.error({ err: { name: error.name, message: error.message } }, 'redis connection failed');
    logger.warn('continuing without redis, cache disabled');
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

/**
 * Close the Redis connection, if one was ever established.
 *
 * Called by server.js's shutdown sequence rather than from a SIGINT handler
 * here: two independent handlers raced, and the database one exited the process
 * before this one could finish.
 */
const disconnectRedis = async () => {
  if (!redisClient) return;
  try {
    await redisClient.quit();
    logger.info('redis connection closed');
  } catch (error) {
    logger.error({ err: { message: error.message } }, 'redis close failed');
  }
};

export { connectRedis, getRedisClient, disconnectRedis };
