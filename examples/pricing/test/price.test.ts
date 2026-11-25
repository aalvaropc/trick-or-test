import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { priceCart } from '../src/price';
import { percentOf } from '../src/percent';
import { coupon, shippingMethod, validTaxBps, validCart, refLineTotal } from './helpers/arbitraries';

describe('priceCart properties', () => {
  // Feature: cart-pricing, Property 4: Subtotal equals the sum of line totals with bulk discount
  // **Validates: Requirements 4.1, 4.2, 4.3**
  it('subtotalCents is the sum of line totals with bulk discount', () => {
    fc.assert(
      fc.property(validCart, (cart) => {
        let expected = 0;
        let expectedRef = 0;
        for (const line of cart.lines) {
          const raw = line.quantity * line.unitPriceCents;
          expected += line.quantity >= 10 ? raw - percentOf(raw, 1000) : raw;
          expectedRef += refLineTotal(line);
        }
        const { subtotalCents } = priceCart(cart);
        expect(subtotalCents).toBe(expected);
        expect(subtotalCents).toBe(expectedRef);
      }),
    );
  });

  // Feature: cart-pricing, Property 5: Empty carts price to zero
  // **Validates: Requirements 4.4, 6.1**
  it('empty carts price to all zeros', () => {
    fc.assert(
      fc.property(
        fc.option(coupon, { nil: undefined }),
        shippingMethod,
        validTaxBps,
        (c, shipping, taxBps) => {
          const result = priceCart({ lines: [], coupon: c, shipping, taxBps });
          expect(result).toEqual({
            subtotalCents: 0,
            discountCents: 0,
            shippingCents: 0,
            taxCents: 0,
            totalCents: 0,
          });
        },
      ),
    );
  });
});

describe('priceCart coupon discount', () => {
  // Feature: cart-pricing, Property 6: Coupon discount matches the coupon rules
  // **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
  it('discountCents follows the coupon rules and is clamped to the subtotal', () => {
    fc.assert(
      fc.property(validCart, (cart) => {
        const { subtotalCents, discountCents } = priceCart(cart);
        const c = cart.coupon;
        let expected = 0;
        if (c !== undefined && subtotalCents >= c.minSubtotalCents) {
          const raw =
            c.kind === 'percent'
              ? Math.min(percentOf(subtotalCents, c.bps), c.maxDiscountCents)
              : c.amountCents;
          expected = Math.min(raw, subtotalCents);
        }
        expect(discountCents).toBe(expected);
      }),
    );
  });
});

describe('priceCart shipping', () => {
  // Feature: cart-pricing, Property 7: Shipping follows method and threshold
  // **Validates: Requirements 6.2, 6.3, 6.4**
  it('shippingCents follows method and the discounted subtotal threshold', () => {
    fc.assert(
      fc.property(
        validCart.filter((c) => c.lines.length > 0),
        (cart) => {
          const { subtotalCents, discountCents, shippingCents } = priceCart(cart);
          const discounted = subtotalCents - discountCents;
          let expected: number;
          if (cart.shipping === 'express') expected = 1499;
          else expected = discounted >= 10000 ? 0 : 799;
          expect(shippingCents).toBe(expected);
        },
      ),
    );
  });
});

describe('priceCart tax', () => {
  // Feature: cart-pricing, Property 8: Tax is computed on the discounted subtotal only
  // **Validates: Requirements 7.1, 7.2**
  it('taxCents is percentOf the discounted subtotal and ignores shipping method', () => {
    fc.assert(
      fc.property(validCart, (cart) => {
        const result = priceCart(cart);
        expect(result.taxCents).toBe(
          percentOf(result.subtotalCents - result.discountCents, cart.taxBps),
        );
        const other = cart.shipping === 'standard' ? 'express' : 'standard';
        const swapped = priceCart({ ...cart, shipping: other });
        expect(swapped.taxCents).toBe(result.taxCents);
      }),
    );
  });
});

describe('priceCart breakdown invariants', () => {
  // Feature: cart-pricing, Property 9: Breakdown invariants
  // **Validates: Requirements 5.5, 7.3, 7.4**
  it('fields are non-negative integers, discount <= subtotal, and total identity holds', () => {
    fc.assert(
      fc.property(validCart, (cart) => {
        const b = priceCart(cart);
        for (const v of Object.values(b)) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
        expect(b.discountCents).toBeLessThanOrEqual(b.subtotalCents);
        expect(b.totalCents).toBe(
          b.subtotalCents - b.discountCents + b.shippingCents + b.taxCents,
        );
      }),
    );
  });
});

describe('priceCart unit tests', () => {
  const one = (unitPriceCents: number, quantity = 1) => [{ quantity, unitPriceCents }];

  describe('shipping thresholds', () => {
    it('standard shipping is 799 when discounted subtotal is 9999', () => {
      const b = priceCart({ lines: one(9999), shipping: 'standard', taxBps: 0 });
      expect(b.shippingCents).toBe(799);
    });

    it('standard shipping is free when discounted subtotal is 10000', () => {
      const b = priceCart({ lines: one(10000), shipping: 'standard', taxBps: 0 });
      expect(b.shippingCents).toBe(0);
    });

    it('express shipping is 1499 at discounted subtotal 10000', () => {
      const b = priceCart({ lines: one(10000), shipping: 'express', taxBps: 0 });
      expect(b.shippingCents).toBe(1499);
    });

    it('uses the discounted subtotal for the free-shipping threshold', () => {
      const b = priceCart({
        lines: one(10000),
        coupon: { kind: 'fixed', amountCents: 1, minSubtotalCents: 0 },
        shipping: 'standard',
        taxBps: 0,
      });
      expect(b.discountCents).toBe(1);
      expect(b.shippingCents).toBe(799);
    });
  });

  describe('bulk discount boundary', () => {
    it('quantity 9 at unit price 5 has line total 45', () => {
      const b = priceCart({ lines: one(5, 9), shipping: 'standard', taxBps: 0 });
      expect(b.subtotalCents).toBe(45);
    });

    it('quantity 10 at unit price 5 has line total 45', () => {
      const b = priceCart({ lines: one(5, 10), shipping: 'standard', taxBps: 0 });
      expect(b.subtotalCents).toBe(45);
    });

    it('quantity 10 at unit price 1 has line total 9', () => {
      const b = priceCart({ lines: one(1, 10), shipping: 'standard', taxBps: 0 });
      expect(b.subtotalCents).toBe(9);
    });

    it('exact-half bulk discount: quantity 11 at unit price 5 gives 49', () => {
      // raw 55, discount percentOf(55, 1000) = 6 (5.5 rounds up), total 49
      expect(percentOf(55, 1000)).toBe(6);
      const b = priceCart({ lines: one(5, 11), shipping: 'standard', taxBps: 0 });
      expect(b.subtotalCents).toBe(49);
    });
  });

  describe('coupon minimum subtotal', () => {
    it('gives discount 0 when subtotal is below minSubtotalCents', () => {
      const b = priceCart({
        lines: one(1000),
        coupon: { kind: 'percent', bps: 1000, maxDiscountCents: 10000, minSubtotalCents: 1001 },
        shipping: 'standard',
        taxBps: 0,
      });
      expect(b.discountCents).toBe(0);
    });

    it('applies when minSubtotalCents equals the subtotal', () => {
      const b = priceCart({
        lines: one(1000),
        coupon: { kind: 'percent', bps: 1000, maxDiscountCents: 10000, minSubtotalCents: 1000 },
        shipping: 'standard',
        taxBps: 0,
      });
      expect(b.discountCents).toBe(100);
    });

    it('fixed coupon below minimum gives 0 and at minimum applies', () => {
      const fixed = (min: number) =>
        priceCart({
          lines: one(1000),
          coupon: { kind: 'fixed', amountCents: 250, minSubtotalCents: min },
          shipping: 'standard',
          taxBps: 0,
        });
      expect(fixed(1001).discountCents).toBe(0);
      expect(fixed(1000).discountCents).toBe(250);
    });
  });

  describe('empty cart', () => {
    it('yields all zeros with coupon, express shipping, and nonzero taxBps', () => {
      const b = priceCart({
        lines: [],
        coupon: { kind: 'fixed', amountCents: 500, minSubtotalCents: 0 },
        shipping: 'express',
        taxBps: 2000,
      });
      expect(b).toEqual({
        subtotalCents: 0,
        discountCents: 0,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 0,
      });
    });
  });
});
