import { getRedisClient } from '../config/redis.js';
import { CACHE_TTL } from '../config/constants.js';

class CacheUtil {
  /**
   * Get data from cache
   * @param {String} key - Cache key
   * @returns {Promise<Object|null>}
   */
  static async get(key) {
    try {
      const client = getRedisClient();
      if (!client) return null;

      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set data in cache
   * @param {String} key - Cache key
   * @param {Object} value - Data to cache
   * @param {Number} ttl - Time to live in seconds
   * @returns {Promise<Boolean>}
   */
  static async set(key, value, ttl = CACHE_TTL.MEDIUM) {
    try {
      const client = getRedisClient();
      if (!client) return false;

      await client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete data from cache
   * @param {String} key - Cache key or pattern
   * @returns {Promise<Boolean>}
   */
  static async del(key) {
    try {
      const client = getRedisClient();
      if (!client) return false;

      await client.del(key);
      return true;
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   * @param {String} pattern - Pattern to match (e.g., 'cache:products:*')
   * @returns {Promise<Boolean>}
   */
  static async delPattern(pattern) {
    try {
      const client = getRedisClient();
      if (!client) return false;

      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
      return true;
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   * @param {String} key - Cache key
   * @returns {Promise<Boolean>}
   */
  static async exists(key) {
    try {
      const client = getRedisClient();
      if (!client) return false;

      const exists = await client.exists(key);
      return exists === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Generate cache key
   * @param {String} prefix - Key prefix
   * @param {...String} parts - Key parts
   * @returns {String}
   */
  static generateKey(prefix, ...parts) {
    return `cache:${prefix}:${parts.filter(p => p).join(':')}`;
  }
}

export default CacheUtil;
