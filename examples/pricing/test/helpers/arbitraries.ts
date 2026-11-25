import fc from 'fast-check';
import type { Breakdown, Cart, Coupon, Line } from '../../src/types';

// ---------------------------------------------------------------------------
// Valid-value arbitraries
// ---------------------------------------------------------------------------

export const validQuantity: fc.Arbitrary<number> = fc.integer({ min: 1, max: 999 });

export const validUnitPrice: fc.Arbitrary<number> = fc.integer({
  min: 0,
  max: 1_000_000,
});

export const validTaxBps: fc.Arbitrary<number> = fc.integer({ min: 0, max: 10000 });

export const validLine: fc.Arbitrary<Line> = fc.record({
  quantity: validQuantity,
  unitPriceCents: validUnitPrice,
});

/** Line whose quantity is biased toward the bulk boundary (9, 10, 11). */
export const boundaryLine: fc.Arbitrary<Line> = fc.record({
  quantity: fc.oneof(fc.constantFrom(9, 10, 11), validQuantity),
  unitPriceCents: validUnitPrice,
});

export const coupon: fc.Arbitrary<Coupon> = fc.oneof(
  fc.record({
    kind: fc.constant('percent' as const),
    bps: fc.integer({ min: 0, max: 10000 }),
    maxDiscountCents: fc.integer({ min: 0, max: 10_000_000 }),
    minSubtotalCents: fc.integer({ min: 0, max: 10_000_000 }),
  }),
  fc.record({
    kind: fc.constant('fixed' as const),
    amountCents: fc.integer({ min: 0, max: 10_000_000 }),
    minSubtotalCents: fc.integer({ min: 0, max: 10_000_000 }),
  }),
);

export const shippingMethod: fc.Arbitrary<Cart['shipping']> = fc.constantFrom(
  'standard',
  'express',
);

/** Valid cart: 0..20 lines, optional coupon, either shipping method. */
export const validCart: fc.Arbitrary<Cart> = fc
  .record({
    lines: fc.array(fc.oneof(validLine, boundaryLine), { minLength: 0, maxLength: 20 }),
    coupon: fc.option(coupon, { nil: undefined }),
    shipping: shippingMethod,
    taxBps: validTaxBps,
  })
  .map((c): Cart => {
    const cart: Cart = { lines: c.lines, shipping: c.shipping, taxBps: c.taxBps };
    if (c.coupon !== undefined) cart.coupon = c.coupon;
    return cart;
  });

// ---------------------------------------------------------------------------
// Invalid-value generators
// ---------------------------------------------------------------------------

export const invalidQuantity: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(0, 1000, -1, 1.5, NaN, Infinity, -Infinity),
  fc.integer({ min: -1000, max: 0 }),
  fc.integer({ min: 1000, max: 100000 }),
);

export const invalidUnitPrice: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(-1, 1_000_001, 0.5, NaN, Infinity, -Infinity),
  fc.integer({ min: -1_000_000, max: -1 }),
  fc.integer({ min: 1_000_001, max: 10_000_000 }),
);

export const invalidTaxBps: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(-1, 10001, 0.5, NaN, Infinity, -Infinity),
  fc.integer({ min: -100000, max: -1 }),
  fc.integer({ min: 10001, max: 1_000_000 }),
);

// ---------------------------------------------------------------------------
// BigInt reference model (independent of the floating-point implementation)
// ---------------------------------------------------------------------------

/** Round_Half_Up of amount * bps / 10000 for non-negative integers. */
export function refPercentOf(amount: number, bps: number): number {
  return Number((BigInt(amount) * BigInt(bps) * 2n + 10000n) / 20000n);
}

function refPercentOfBig(amount: bigint, bps: bigint): bigint {
  return (amount * bps * 2n + 10000n) / 20000n;
}

function clampBig(v: bigint, lo: bigint, hi: bigint): bigint {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Line total in cents. Bulk (quantity >= 10): raw - round_half_up(raw * 10%). */
export function refLineTotal(line: Line): number {
  const raw = BigInt(line.quantity) * BigInt(line.unitPriceCents);
  const total =
    line.quantity >= 10 ? raw - refPercentOfBig(raw, 1000n) : raw;
  return Number(total);
}

/** Independent BigInt pricer for valid carts. */
export function refPriceCart(cart: Cart): Breakdown {
  let subtotal = 0n;
  for (const line of cart.lines) subtotal += BigInt(refLineTotal(line));

  let discount = 0n;
  const c = cart.coupon;
  if (c !== undefined && subtotal >= BigInt(c.minSubtotalCents)) {
    const raw =
      c.kind === 'percent'
        ? (() => {
            const pct = refPercentOfBig(subtotal, BigInt(c.bps));
            const cap = BigInt(c.maxDiscountCents);
            return pct < cap ? pct : cap;
          })()
        : BigInt(c.amountCents);
    discount = clampBig(raw, 0n, subtotal);
  }

  const discounted = subtotal - discount;

  let shipping = 0n;
  if (cart.lines.length > 0) {
    if (cart.shipping === 'express') shipping = 1499n;
    else shipping = discounted >= 10000n ? 0n : 799n;
  }

  const tax = refPercentOfBig(discounted, BigInt(cart.taxBps));
  const total = discounted + shipping + tax;

  return {
    subtotalCents: Number(subtotal),
    discountCents: Number(discount),
    shippingCents: Number(shipping),
    taxCents: Number(tax),
    totalCents: Number(total),
  };
}
