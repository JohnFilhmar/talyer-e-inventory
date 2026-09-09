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
 * Newlines go first, because that is the whole of the log-injection trick: a
 * search for "x\n2026-01-01 INFO admin deleted nothing" would otherwise write a
 * second, entirely fabricated log line. The remaining control characters go too,
 * since a terminal reading the log will happily interpret escape sequences.
 *
 * CR and LF are removed one constant pattern at a time, and replaced with the
 * empty string rather than a space, because that is the shape static analysis
 * recognises as a log-injection barrier — a combined `[\r\n]` class replaced
 * with ' ' is equally safe at runtime but reads to the analyser as an unrelated
 * transformation. The trailing sweep would catch both anyway; keeping them
 * explicit is what makes the intent legible to a reader and a scanner alike.
 *
 * Sanitising here rather than in each caller means every current and future
 * `CacheUtil` user is covered, including the pre-existing category and product
 * reads that build keys the same way.
 */
const forLog = (key) =>
  String(key)
    .replace(/\r/g, '')
    .replace(/\n/g, '')
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

      // SCAN, not KEYS. KEYS walks the entire keyspace in one blocking call, and
      // this runs on every mutation hot path: a restock, a sale and a product
      // edit each trigger one. On a shared Redis that stalls every other client
      // for the duration, and the cost grows with total keys rather than with
      // the number actually matching.
      //
      // COUNT is a hint, not a page size: a SCAN cursor can return more or
      // fewer, and only a zero cursor means the iteration is finished.
      let cursor = '0';
      do {
        const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });

        // node-redis v4 returns { cursor, keys }; older shapes returned a
        // [cursor, keys] tuple. Accept both so a client upgrade cannot silently
        // turn this into a no-op that leaves stale entries served.
        const nextCursor = Array.isArray(reply) ? reply[0] : reply?.cursor;
        const keys = Array.isArray(reply) ? reply[1] : reply?.keys;

        if (keys && keys.length > 0) {
          // UNLINK reclaims memory on a background thread; DEL blocks. Fall
          // back for a server or client without it.
          if (typeof client.unlink === 'function') {
            await client.unlink(keys);
          } else {
            await client.del(keys);
          }
        }

        cursor = String(nextCursor ?? '0');
      } while (cursor !== '0');

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
