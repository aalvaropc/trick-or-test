import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { percentOf } from '../src/percent';
import { refPercentOf } from './helpers/arbitraries';

// Non-negative integer pairs satisfying amount * bps + 5000 <= MAX_SAFE_INTEGER.
const safePair = fc
  .oneof(
    fc.integer({ min: 0, max: 10000 }),
    fc.integer({ min: 0, max: 1_000_000 }),
  )
  .chain((bps) => {
    const maxAmount =
      bps === 0
        ? Number.MAX_SAFE_INTEGER
        : Math.floor((Number.MAX_SAFE_INTEGER - 5000) / bps);
    return fc
      .oneof(
        fc.integer({ min: 0, max: Math.min(maxAmount, 10_000_000) }),
        fc.integer({ min: 0, max: maxAmount }),
      )
      .map((amount) => [amount, bps] as const);
  });

describe('percentOf', () => {
  // Feature: cart-pricing, Property 1: percentOf is exact Round_Half_Up
  // **Validates: Requirements 2.1, 2.2**
  it('matches the BigInt Round_Half_Up reference for safe non-negative integers', () => {
    fc.assert(
      fc.property(safePair, ([amount, bps]) => {
        expect(percentOf(amount, bps)).toBe(refPercentOf(amount, bps));
      }),
    );
  });
});

describe('percentOf examples', () => {
  it.each([
    [1, 5000, 1],
    [5, 1000, 1],
    [15, 1000, 2],
    [14, 1000, 1],
    [0, 10000, 0],
    [1, 4999, 0],
  ])('percentOf(%i, %i) = %i', (amount, bps, expected) => {
    expect(percentOf(amount, bps)).toBe(expected);
  });

  it('does not throw for bps above 10000', () => {
    expect(() => percentOf(5, 10001)).not.toThrow();
  });
});
