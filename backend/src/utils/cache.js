import { getRedisClient } from '../config/redis.js';
import { CACHE_TTL } from '../config/constants.js';

/**
 * Longest key fragment worth putting in a log line. A key is built from caller
 * text that can be arbitrarily long (a 2000-character search term is a valid
 * request), and a single Redis hiccup should not write a screenful.
 */
const MAX_LOGGED_KEY_LENGTH = 200;

/**
 * Makes a cache key safe to log.
 *
 * Keys embed caller-supplied text — a product search term, a motorcycle filter
 * value — so by the time one reaches a log line it is user-controlled data.
 * Newlines are stripped first and explicitly, because that is the whole of the
 * log-injection trick: a search for "x\n2026-01-01 INFO admin deleted nothing"
 * would otherwise write a second, entirely fabricated log line. The remaining
 * control characters go too, since a terminal reading the log will happily
 * interpret escape sequences.
 *
 * Sanitising here rather than in each caller means every current and future
 * `CacheUtil` user is covered, including the pre-existing category and product
 * reads that build keys the same way.
 */
const forLog = (key) =>
  String(key)
    .replace(/[\r\n]/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, MAX_LOGGED_KEY_LENGTH);

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
      console.error('Cache get error for key %s:', forLog(key), error);
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
      console.error('Cache set error for key %s:', forLog(key), error);
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
      console.error('Cache delete error for key %s:', forLog(key), error);
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
      console.error('Cache delete pattern error for %s:', forLog(pattern), error);
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
      console.error('Cache exists error for key %s:', forLog(key), error);
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
