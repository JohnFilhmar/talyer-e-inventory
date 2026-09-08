import CacheUtil from '../utils/cache.js';
import { CACHE_TTL } from '../config/constants.js';

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
      // Generate cache key from the caller's role, the URL and query params.
      //
      // The role is part of the key because responses on these routes vary by
      // it: getBranches omits the manager sub-document for a customer. Keying
      // on the URL alone served whichever shape was cached first to everyone,
      // so one staff request would hand every customer the manager's name and
      // email for the rest of the TTL, and one customer request would blank the
      // manager out for staff.
      //
      // 'anonymous' covers a route mounted without `protect`. There is none
      // today, but the key must not silently collapse to a shared bucket if one
      // is added later.
      const cacheKey = CacheUtil.generateKey(
        keyPrefix,
        req.user?.role || 'anonymous',
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

export default cacheMiddleware;
