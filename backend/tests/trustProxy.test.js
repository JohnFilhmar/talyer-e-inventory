import { resolveTrustProxy } from '../src/utils/trustProxy.js';

describe('resolveTrustProxy', () => {
  it('defaults to 0 when the value is undefined', () => {
    expect(resolveTrustProxy(undefined)).toBe(0);
  });

  it('defaults to 0 when the value is null', () => {
    expect(resolveTrustProxy(null)).toBe(0);
  });

  it('defaults to 0 when the value is an empty string', () => {
    expect(resolveTrustProxy('')).toBe(0);
  });

  it('defaults to 0 when the value is a non-numeric string', () => {
    expect(resolveTrustProxy('not-a-number')).toBe(0);
  });

  it('defaults to 0 when the value is negative', () => {
    expect(resolveTrustProxy('-1')).toBe(0);
    expect(resolveTrustProxy(-5)).toBe(0);
  });

  it('returns the parsed integer for a valid numeric string', () => {
    expect(resolveTrustProxy('1')).toBe(1);
    expect(resolveTrustProxy('2')).toBe(2);
  });

  it('returns 0 for the string "0"', () => {
    expect(resolveTrustProxy('0')).toBe(0);
  });

  it('accepts a numeric (non-string) value', () => {
    expect(resolveTrustProxy(3)).toBe(3);
  });
});
