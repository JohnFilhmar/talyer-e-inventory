const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {
  try {
    // Create Redis client
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    // Handle Redis errors
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis connecting...');
    });

    redisClient.on('ready', () => {
      console.log('Redis client ready');
    });

    redisClient.on('end', () => {
      console.log('Redis client disconnected');
    });

    // Connect to Redis
    await redisClient.connect();
    console.log(`Redis Connected: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);

    return redisClient;
  } catch (error) {
    console.error(`Error connecting to Redis: ${error.message}`);
    console.log('Continuing without Redis...');
    // Don't exit process, Redis is optional
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

module.exports = { connectRedis, getRedisClient };
