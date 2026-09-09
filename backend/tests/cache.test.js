import CacheUtil from '../src/utils/cache.js';
import * as redisConfig from '../src/config/redis.js';

// GAP-048. delPattern used KEYS, which walks the whole keyspace in one blocking
// call, on every mutation hot path: a restock, a sale and a product edit each
// trigger one. No database and no Redis: the client is mocked, the way
// redis.test.js does it.
describe('CacheUtil.delPattern', () => {
  let spy;

  const mockClient = (scanReplies, overrides = {}) => {
    const client = {
      scan: jest.fn(),
      unlink: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      ...overrides,
    };
    scanReplies.forEach((reply) => client.scan.mockResolvedValueOnce(reply));
    spy = jest.spyOn(redisConfig, 'getRedisClient').mockReturnValue(client);
    return client;
  };

  afterEach(() => {
    if (spy) spy.mockRestore();
    spy = undefined;
  });

  it('returns false and touches nothing when there is no client', async () => {
    spy = jest.spyOn(redisConfig, 'getRedisClient').mockReturnValue(null);

    await expect(CacheUtil.delPattern('cache:stock:*')).resolves.toBe(false);
  });

  it('follows the cursor until it returns to zero', async () => {
    const client = mockClient([
      { cursor: '17', keys: ['cache:stock:a'] },
      { cursor: '42', keys: ['cache:stock:b'] },
      { cursor: '0', keys: ['cache:stock:c'] },
    ]);

    await expect(CacheUtil.delPattern('cache:stock:*')).resolves.toBe(true);

    expect(client.scan).toHaveBeenCalledTimes(3);
    expect(client.unlink).toHaveBeenCalledTimes(3);
  });

  // A SCAN page can legitimately be empty while the cursor is non-zero; that
  // must not end the loop or trigger a delete of nothing.
  it('keeps iterating through an empty page', async () => {
    const client = mockClient([
      { cursor: '9', keys: [] },
      { cursor: '0', keys: ['cache:stock:z'] },
    ]);

    await CacheUtil.delPattern('cache:stock:*');

    expect(client.scan).toHaveBeenCalledTimes(2);
    expect(client.unlink).toHaveBeenCalledTimes(1);
    expect(client.unlink).toHaveBeenCalledWith(['cache:stock:z']);
  });

  it('accepts the older [cursor, keys] tuple shape', async () => {
    const client = mockClient([['0', ['cache:stock:t']]]);

    await expect(CacheUtil.delPattern('cache:stock:*')).resolves.toBe(true);
    expect(client.unlink).toHaveBeenCalledWith(['cache:stock:t']);
  });

  it('falls back to DEL when the client has no UNLINK', async () => {
    const client = mockClient([{ cursor: '0', keys: ['cache:stock:k'] }], { unlink: undefined });

    await CacheUtil.delPattern('cache:stock:*');

    expect(client.del).toHaveBeenCalledWith(['cache:stock:k']);
  });

  it('passes the pattern through as the MATCH argument', async () => {
    const client = mockClient([{ cursor: '0', keys: [] }]);

    await CacheUtil.delPattern('cache:sales:*');

    expect(client.scan).toHaveBeenCalledWith('0', expect.objectContaining({ MATCH: 'cache:sales:*' }));
  });

  it('returns false and does not throw when SCAN fails', async () => {
    spy = jest.spyOn(redisConfig, 'getRedisClient').mockReturnValue({
      scan: jest.fn().mockRejectedValue(new Error('connection lost')),
    });

    await expect(CacheUtil.delPattern('cache:stock:*')).resolves.toBe(false);
  });
});
