import jwt from 'jsonwebtoken';
import { userOrIpKey } from '../src/middleware/rateLimit.js';

/**
 * The rate limiter is skipped under NODE_ENV=test, so its key function cannot
 * be exercised through a mounted route. It is tested directly instead — the
 * logic that matters (verify, don't merely decode) is entirely in here.
 */

const requestWith = (authorization, ip = '203.0.113.7') => ({
  headers: authorization ? { authorization } : {},
  ip,
});

const signFor = (id, secret = process.env.JWT_SECRET) =>
  jwt.sign({ id }, secret, { expiresIn: '15m' });

describe('rate limit key generation', () => {
  it('keys an authenticated request by user, so one office IP is not one bucket', () => {
    const key = userOrIpKey(requestWith(`Bearer ${signFor('user-a')}`));
    expect(key).toBe('user:user-a');
  });

  it('gives two users behind the same IP separate buckets', () => {
    const ip = '198.51.100.4';
    const a = userOrIpKey(requestWith(`Bearer ${signFor('user-a')}`, ip));
    const b = userOrIpKey(requestWith(`Bearer ${signFor('user-b')}`, ip));

    expect(a).not.toBe(b);
  });

  it('keys an anonymous request by IP', () => {
    expect(userOrIpKey(requestWith(undefined, '203.0.113.9'))).toBe('ip:203.0.113.9');
  });

  it('falls back to IP for a token signed with the wrong secret', () => {
    // The whole point of verifying rather than decoding: an attacker who can
    // mint accepted keys gets a fresh bucket per request and is not limited at
    // all. This must land in the IP bucket, not a user one.
    const forged = jwt.sign({ id: 'attacker' }, 'not-the-real-secret');
    const key = userOrIpKey(requestWith(`Bearer ${forged}`, '203.0.113.5'));

    expect(key).toBe('ip:203.0.113.5');
    expect(key).not.toContain('attacker');
  });

  it('falls back to IP for an expired token', () => {
    const expired = jwt.sign({ id: 'user-a' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    expect(userOrIpKey(requestWith(`Bearer ${expired}`, '203.0.113.6'))).toBe('ip:203.0.113.6');
  });

  it('falls back to IP for a malformed Authorization header', () => {
    expect(userOrIpKey(requestWith('Bearer notatoken', '203.0.113.8'))).toBe('ip:203.0.113.8');
    expect(userOrIpKey(requestWith('Basic abc123', '203.0.113.8'))).toBe('ip:203.0.113.8');
  });

  it('truncates IPv6 so a client cannot mint buckets from its own subnet', () => {
    // A /128 key would let one client vary the low bits and get an unlimited
    // number of fresh buckets. ipKeyGenerator collapses these to one /56.
    const first = userOrIpKey(requestWith(undefined, '2001:db8:1234:5600::1'));
    const second = userOrIpKey(requestWith(undefined, '2001:db8:1234:5600::abcd'));

    expect(first).toBe(second);
  });
});
