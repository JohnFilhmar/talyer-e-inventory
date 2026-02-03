const CacheUtil = require('../utils/cache');
const { CACHE_TTL } = require('../config/constants');

/**
 * Middleware to cache GET responses
 * @param {String} keyPrefix - Cache key prefix
 * @param {Number} ttl - Time to live in seconds
 * @returns {Function} Express middleware
 */
const cacheMiddleware = (keyPrefix, ttl = CACHE_TTL.MEDIUM) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      // Generate cache key from URL and query params
      const cacheKey = CacheUtil.generateKey(
        keyPrefix,
        req.originalUrl
      );

      // Try to get from cache
      const cachedData = await CacheUtil.get(cacheKey);

      if (cachedData) {
        console.log(`Cache HIT: ${cacheKey}`);
        return res.json(cachedData);
      }

      console.log(`Cache MISS: ${cacheKey}`);

      // Store original res.json
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = (data) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          CacheUtil.set(cacheKey, data, ttl).catch(err => {
            console.error('Cache set error:', err);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

module.exports = cacheMiddleware;
