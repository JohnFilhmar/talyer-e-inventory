import { describe, expect, it } from 'vitest';
import { calculateOrderTotals } from './sales';

describe('calculateOrderTotals', () => {
  it('charges VAT after the order discount, matching the server (GAP-029)', () => {
    const totals = calculateOrderTotals([{ quantity: 1, unitPrice: 1000 }], 12, 100);
    expect(totals.subtotal).toBe(1000);
    expect(totals.taxAmount).toBeCloseTo(108, 10);
    expect(totals.total).toBeCloseTo(1008, 10);
  });

  it('never goes below zero when the discount covers the subtotal', () => {
    const totals = calculateOrderTotals([{ quantity: 1, unitPrice: 50 }], 12, 50);
    expect(totals.taxAmount).toBe(0);
    expect(totals.total).toBe(0);
  });
});
