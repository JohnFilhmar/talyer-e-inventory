import { roundCurrency, sumCurrency } from '../src/utils/currency.js';

// No database: this is pure arithmetic, so the suite runs anywhere.
describe('roundCurrency', () => {
  it('rounds the multiplication error out of a line total', () => {
    // Three units at PHP 8.10.
    expect(3 * 8.1).toBe(24.299999999999997);
    expect(roundCurrency(3 * 8.1)).toBe(24.3);
  });

  it('produces the total a receipt would print', () => {
    const subtotal = roundCurrency(3 * 8.1);
    const tax = roundCurrency(subtotal * 0.12);
    expect(roundCurrency(subtotal + tax)).toBe(27.22);
  });

  it('turns the negative epsilon of a full discount into zero', () => {
    // Three units at 8.10 discounted by the 24.30 the screen showed. The
    // arithmetic lands just below zero, which tripped the schema's `min: 0`
    // and rejected the sale.
    const total = 3 * 8.1 - 24.3;
    expect(total).toBeLessThan(0);
    expect(Object.is(roundCurrency(total), 0)).toBe(true);
  });

  it('rounds a half centavo away from zero, in both directions', () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(2.675)).toBe(2.68);
    expect(roundCurrency(-0.005)).toBe(-0.01);
  });

  // `value * 100` is the obvious implementation and it gets this wrong:
  // 1.005 * 100 is 100.49999999999999, which rounds down.
  it('does not lose the half centavo the naive scaling loses', () => {
    expect(Math.round(1.005 * 100) / 100).toBe(1);
    expect(roundCurrency(1.005)).toBe(1.01);
  });

  it('handles values already written in exponential notation', () => {
    expect(roundCurrency(-3.55e-15)).toBe(0);
    expect(roundCurrency(1e-3)).toBe(0);
    expect(roundCurrency(1.234e3)).toBe(1234);
  });

  it('returns zero rather than propagating a non-finite amount', () => {
    // A NaN total compares false against every threshold, so it would leave an
    // order neither paid nor unpaid forever.
    expect(roundCurrency(NaN)).toBe(0);
    expect(roundCurrency(Infinity)).toBe(0);
    expect(roundCurrency(undefined)).toBe(0);
  });

  it('leaves an exact amount alone', () => {
    expect(roundCurrency(0)).toBe(0);
    expect(roundCurrency(150)).toBe(150);
    expect(roundCurrency(27.22)).toBe(27.22);
  });
});

describe('sumCurrency', () => {
  it('rounds once at the end rather than per addend', () => {
    expect(sumCurrency([8.1, 8.1, 8.1])).toBe(24.3);
  });

  it('treats missing values as zero', () => {
    expect(sumCurrency([10, undefined, null, 5.005])).toBe(15.01);
  });

  it('is zero for an empty receipt', () => {
    expect(sumCurrency([])).toBe(0);
  });
});
