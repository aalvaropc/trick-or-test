import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { priceCart } from '../src/price';
import { ValidationError } from '../src/errors';
import type { Cart } from '../src/types';
import {
  validCart,
  validLine,
  invalidQuantity,
  invalidUnitPrice,
  invalidTaxBps,
} from './helpers/arbitraries';

function thrownError(cart: Cart): unknown {
  try {
    priceCart(cart);
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('validation properties', () => {
  // Feature: cart-pricing, Property 2: A single invalid field is reported by name
  // **Validates: Requirements 3.1, 3.2, 3.3**
  it('reports a single invalid field by name', () => {
    const nonEmptyCart = fc
      .tuple(validCart, validLine)
      .map(([c, l]): Cart => ({ ...c, lines: [...c.lines, l] }));

    fc.assert(
      fc.property(
        nonEmptyCart,
        fc.nat(),
        fc.constantFrom('taxBps', 'quantity', 'unitPriceCents'),
        invalidTaxBps,
        invalidQuantity,
        invalidUnitPrice,
        (cart, idxSeed, which, badTax, badQty, badPrice) => {
          const i = idxSeed % cart.lines.length;
          const lines = cart.lines.map((l) => ({ ...l }));
          let expected: string;
          let mutated: Cart;
          if (which === 'taxBps') {
            expected = 'taxBps';
            mutated = { ...cart, lines, taxBps: badTax };
          } else if (which === 'quantity') {
            expected = `lines[${i}].quantity`;
            lines[i].quantity = badQty;
            mutated = { ...cart, lines };
          } else {
            expected = `lines[${i}].unitPriceCents`;
            lines[i].unitPriceCents = badPrice;
            mutated = { ...cart, lines };
          }
          const err = thrownError(mutated);
          expect(err).toBeInstanceOf(ValidationError);
          expect((err as ValidationError).field).toBe(expected);
        },
      ),
    );
  });
});

describe('validation properties: multiple invalid fields', () => {
  // Feature: cart-pricing, Property 3: Multiple invalid fields yield one of them
  // **Validates: Requirements 3.4**
  it('throws a ValidationError naming one of the invalid fields', () => {
    const nonEmptyCart = fc
      .tuple(validCart, validLine)
      .map(([c, l]): Cart => ({ ...c, lines: [...c.lines, l] }));

    // Slot 0 is taxBps; slots 1 + 2i and 2 + 2i are lines[i].quantity and lines[i].unitPriceCents.
    const scenario = nonEmptyCart.chain((cart) => {
      const slots = Array.from({ length: 1 + 2 * cart.lines.length }, (_, k) => k);
      return fc.tuple(
        fc.constant(cart),
        fc.shuffledSubarray(slots, { minLength: 2 }),
        invalidTaxBps,
        invalidQuantity,
        invalidUnitPrice,
      );
    });

    fc.assert(
      fc.property(scenario, ([cart, chosen, badTax, badQty, badPrice]) => {
        const lines = cart.lines.map((l) => ({ ...l }));
        let taxBps = cart.taxBps;
        const invalid = new Set<string>();
        for (const slot of chosen) {
          if (slot === 0) {
            taxBps = badTax;
            invalid.add('taxBps');
          } else {
            const i = Math.floor((slot - 1) / 2);
            if ((slot - 1) % 2 === 0) {
              lines[i].quantity = badQty;
              invalid.add(`lines[${i}].quantity`);
            } else {
              lines[i].unitPriceCents = badPrice;
              invalid.add(`lines[${i}].unitPriceCents`);
            }
          }
        }
        const err = thrownError({ ...cart, lines, taxBps });
        expect(err).toBeInstanceOf(ValidationError);
        expect(invalid.has((err as ValidationError).field)).toBe(true);
      }),
    );
  });
});

describe('validation unit tests', () => {
  const base = (over: Partial<Cart> = {}): Cart => ({
    lines: [{ quantity: 1, unitPriceCents: 100 }],
    shipping: 'standard',
    taxBps: 0,
    ...over,
  });
  const lineCart = (quantity: number, unitPriceCents: number): Cart =>
    base({ lines: [{ quantity, unitPriceCents }] });

  function fieldOf(cart: Cart): string | undefined {
    const err = thrownError(cart);
    return err instanceof ValidationError ? err.field : undefined;
  }

  it('names lines[0].quantity', () => {
    expect(fieldOf(lineCart(0, 100))).toBe('lines[0].quantity');
  });

  it('names lines[2].unitPriceCents', () => {
    const cart = base({
      lines: [
        { quantity: 1, unitPriceCents: 1 },
        { quantity: 1, unitPriceCents: 1 },
        { quantity: 1, unitPriceCents: -1 },
      ],
    });
    expect(fieldOf(cart)).toBe('lines[2].unitPriceCents');
  });

  it('names taxBps', () => {
    expect(fieldOf(base({ taxBps: -1 }))).toBe('taxBps');
  });

  it.each([
    [0, false],
    [1, true],
    [999, true],
    [1000, false],
  ])('quantity %i valid=%s', (q, valid) => {
    expect(fieldOf(lineCart(q, 100)) === undefined).toBe(valid);
    if (!valid) expect(fieldOf(lineCart(q, 100))).toBe('lines[0].quantity');
  });

  it.each([
    [0, true],
    [1_000_000, true],
    [1_000_001, false],
  ])('unit price %i valid=%s', (p, valid) => {
    expect(fieldOf(lineCart(1, p)) === undefined).toBe(valid);
    if (!valid) expect(fieldOf(lineCart(1, p))).toBe('lines[0].unitPriceCents');
  });

  it.each([
    [-1, false],
    [0, true],
    [10000, true],
    [10001, false],
  ])('taxBps %i valid=%s', (t, valid) => {
    expect(fieldOf(base({ taxBps: t })) === undefined).toBe(valid);
    if (!valid) expect(fieldOf(base({ taxBps: t }))).toBe('taxBps');
  });

  it('reports one of several invalid fields', () => {
    const cart = base({
      taxBps: 10001,
      lines: [{ quantity: 0, unitPriceCents: 2_000_000 }],
    });
    const err = thrownError(cart);
    expect(err).toBeInstanceOf(ValidationError);
    expect([
      'taxBps',
      'lines[0].quantity',
      'lines[0].unitPriceCents',
    ]).toContain((err as ValidationError).field);
  });

  it('does not throw ValidationError for unusual coupon values', () => {
    const coupons = [
      { kind: 'percent', bps: -5, maxDiscountCents: -1, minSubtotalCents: -1 },
      { kind: 'percent', bps: 20000, maxDiscountCents: 0, minSubtotalCents: 1e9 },
      { kind: 'fixed', amountCents: -100, minSubtotalCents: 0 },
      { kind: 'fixed', amountCents: 1e9, minSubtotalCents: -5 },
    ] as const;
    for (const coupon of coupons) {
      expect(thrownError(base({ coupon }))).not.toBeInstanceOf(ValidationError);
    }
  });
});
