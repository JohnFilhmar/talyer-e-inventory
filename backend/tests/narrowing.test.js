import { asCount, asDate, asEnum, asObjectId } from '../src/utils/narrowing.js';

// No database: these are pure functions, so this suite runs anywhere.
describe('asObjectId', () => {
  it('accepts a 24-character hex id and returns it as a plain string', () => {
    expect(asObjectId('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
  });

  it('rejects anything that is not one', () => {
    expect(asObjectId('not-an-id')).toBeNull();
    expect(asObjectId('507f1f77bcf86cd79943901')).toBeNull();
    expect(asObjectId('507f1f77bcf86cd7994390111')).toBeNull();
    expect(asObjectId('')).toBeNull();
    expect(asObjectId(undefined)).toBeNull();
  });

  // The whole point: Express parses `?x=1&x=2` into an array, and Mongoose
  // rewrites `{field: [...]}` into `{field: {$in: [...]}}` rather than raising,
  // so an array reaching a filter widens it.
  it('rejects an array and an operator object', () => {
    expect(asObjectId(['507f1f77bcf86cd799439011'])).toBeNull();
    expect(asObjectId({ $ne: null })).toBeNull();
  });

  // A one-element array stringifies to its element, so `String(x)` is not a
  // type check: `String(['507f1f77bcf86cd799439011'])` is that id exactly.
  // branchScope.js carried exactly that shape while claiming an array could not
  // slip past it.
  it('rejects anything that only stringifies into shape', () => {
    const id = '507f1f77bcf86cd799439011';

    expect(asObjectId([id])).toBeNull();
    expect(asObjectId({ toString: () => id })).toBeNull();
    expect(asObjectId(new String(id))).toBeNull(); // eslint-disable-line no-new-wrappers
  });
});

describe('asEnum', () => {
  const STATUSES = ['pending', 'in-transit', 'completed'];

  it('returns the entry from the allowed list, not the input that matched', () => {
    const input = 'completed';
    const result = asEnum(input, STATUSES);

    expect(result).toBe('completed');
    // Same value, and specifically the one from the list.
    expect(STATUSES).toContain(result);
  });

  it('rejects a value outside the list', () => {
    expect(asEnum('shipped', STATUSES)).toBeNull();
    expect(asEnum('', STATUSES)).toBeNull();
  });

  it('rejects an array and an object', () => {
    expect(asEnum(['completed'], STATUSES)).toBeNull();
    expect(asEnum({ $ne: 'x' }, STATUSES)).toBeNull();
  });
});

describe('asDate', () => {
  it('parses a real date', () => {
    const parsed = asDate('2026-09-09');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.getTime()).toBe(new Date('2026-09-09').getTime());
  });

  // `new Date('nonsense')` is Invalid Date, which Mongoose casts into a filter
  // as null rather than rejecting, so a range query silently changes meaning.
  it('rejects an unparseable value rather than producing Invalid Date', () => {
    expect(asDate('nonsense')).toBeNull();
    expect(asDate(undefined)).toBeNull();
    expect(asDate({})).toBeNull();
  });
});

describe('asCount', () => {
  it('parses a non-negative integer', () => {
    expect(asCount('25', 10)).toBe(25);
    expect(asCount('0', 10)).toBe(0);
  });

  it('falls back on anything else', () => {
    expect(asCount('abc', 10)).toBe(10);
    expect(asCount('-5', 10)).toBe(10);
    expect(asCount(undefined, 10)).toBe(10);
    expect(asCount([], 10)).toBe(10);
  });
});
