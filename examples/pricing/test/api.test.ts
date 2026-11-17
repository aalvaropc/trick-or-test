import { describe, expect, it } from 'vitest';
import { priceCart, percentOf, ValidationError } from '../src/index';
import type { Cart, Line, Coupon, Breakdown } from '../src/index';

describe('public API', () => {
  it('exports priceCart, percentOf and ValidationError', () => {
    expect(priceCart).toBeDefined();
    expect(percentOf).toBeDefined();
    expect(ValidationError).toBeDefined();
  });

  it('accepts typed carts and returns a typed Breakdown', () => {
    const line: Line = { quantity: 2, unitPriceCents: 500 };
    const coupon: Coupon = {
      kind: 'fixed',
      amountCents: 100,
      minSubtotalCents: 0,
    };
    const cart: Cart = {
      lines: [line],
      coupon,
      shipping: 'standard',
      taxBps: 0,
    };
    const result: Breakdown = priceCart(cart);
    expect(result.subtotalCents).toBe(1000);
    expect(result.discountCents).toBe(100);
    expect(result.shippingCents).toBe(799);
    expect(result.taxCents).toBe(0);
    expect(result.totalCents).toBe(1699);
  });

  it('throws ValidationError carrying the field name', () => {
    const cart: Cart = {
      lines: [{ quantity: 0, unitPriceCents: 1 }],
      shipping: 'standard',
      taxBps: 0,
    };
    expect(() => priceCart(cart)).toThrow(ValidationError);
    try {
      priceCart(cart);
    } catch (e) {
      expect((e as ValidationError).field).toBe('lines[0].quantity');
    }
  });
});
