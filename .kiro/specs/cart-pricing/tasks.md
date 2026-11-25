# Implementation Plan: cart-pricing

## Overview

Implement the pure TypeScript library in `src/` (types, errors, `percentOf`, validation, `priceCart`, public index) in dependency order, with Vitest and fast-check tests under `test/` next to each component. Language: TypeScript, erasable syntax only (no enums, namespaces, or parameter properties). Do not modify `package.json`, `tsconfig.json`, `vitest.config.ts`, or `test/setup.ts`. Property tests use the global fast-check config from `test/setup.ts` and carry the comment tag `Feature: cart-pricing, Property N: <title>`.

## Tasks

- [x] 1. Set up types, errors, and the percentage primitive
  - [x] 1.1 Create `src/types.ts` and `src/errors.ts`
    - Define `Line`, `PercentCoupon`, `FixedCoupon`, `Coupon`, `Cart`, `Breakdown` as type-only declarations, with the literal `kind` discriminant on coupons
    - Define `ValidationError` with a `readonly field: string` class field assigned in the constructor (no parameter property)
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 1.2 Implement `percentOf` in `src/percent.ts`
    - `Math.floor((amount * bps + 5000) / 10000)`, no validation, never throws
    - Add JSDoc stating the safe-integer contract
    - _Requirements: 2.1, 2.2, 2.3_

  - [x]* 1.3 Create `test/helpers/arbitraries.ts`
    - Arbitraries: `validLine`, boundary-biased line (quantity 9, 10, 11), `coupon`, `validCart` (0..20 lines), invalid-value generators for quantity, unit price, and `taxBps`
    - BigInt reference model: `refPercentOf` and an independent BigInt cart pricer
    - File name must not match `*.test.ts`
    - _Requirements: 8.1_

  - [x]* 1.4 Write property test for `percentOf` in `test/percent.test.ts`
    - **Property 1: percentOf is exact Round_Half_Up**
    - Compare against `refPercentOf` for non-negative integers within the safe range
    - **Validates: Requirements 2.1, 2.2**

  - [x]* 1.5 Write unit tests for `percentOf` in `test/percent.test.ts`
    - Exact halves: `(1,5000)=1`, `(5,1000)=1`, `(15,1000)=2`, `(14,1000)=1`, `(0,10000)=0`, `(1,4999)=0`
    - `percentOf(5, 10001)` does not throw
    - _Requirements: 2.3, 8.3_

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement validation
  - [x] 3.1 Implement `validateCart` in `src/validate.ts`
    - Check `taxBps` (0..10000), then each line's `quantity` (1..999) and `unitPriceCents` (0..1,000,000) using `Number.isInteger`
    - Throw `ValidationError` with field `taxBps`, `lines[i].quantity`, or `lines[i].unitPriceCents`
    - Do not inspect coupon fields
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x]* 3.2 Write property test for single invalid field in `test/validation.test.ts`
    - **Property 2: A single invalid field is reported by name**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x]* 3.3 Write property test for multiple invalid fields in `test/validation.test.ts`
    - **Property 3: Multiple invalid fields yield one of them**
    - Assert only membership in the set of invalid field names, never which one
    - **Validates: Requirements 3.4**

  - [x]* 3.4 Write unit tests for validation in `test/validation.test.ts`
    - Field names for `lines[0].quantity`, `lines[2].unitPriceCents`, `taxBps`
    - Boundaries: quantity 0, 1, 999, 1000; unit price 0, 1,000,000, 1,000,001; `taxBps` -1, 0, 10000, 10001
    - Multiple invalid fields: assert `instanceof ValidationError` and `field` in the invalid set only
    - Unusual coupon values do not throw `ValidationError`
    - _Requirements: 3.5, 8.2, 8.4_

- [x] 4. Implement pricing and public API
  - [x] 4.1 Implement `priceCart` in `src/price.ts`
    - Internal helpers `lineTotal` (bulk at quantity >= 10 as `raw - percentOf(raw, 1000)`, so the discount amount is rounded half up), `couponDiscount` (clamped to `[0, subtotal]`), `shippingFor` (0 for empty cart, 1499 express, 799 or 0 standard at the 10000 threshold)
    - Call `validateCart` first; tax via `percentOf(discounted, taxBps)`; total = discounted + shipping + tax
    - Add JSDoc noting the supported cart size from the range budget
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4_

  - [x] 4.2 Create `src/index.ts`
    - Re-export `priceCart`, `percentOf`, `ValidationError` as values
    - Re-export types `Cart`, `Line`, `Coupon`, `Breakdown` with `export type`
    - _Requirements: 1.1, 1.2_

  - [x]* 4.3 Write property test for subtotal in `test/price.test.ts`
    - **Property 4: Subtotal equals the sum of line totals with bulk discount**
    - Line total is `raw - percentOf(raw, 1000)` at quantity >= 10, otherwise `raw`
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x]* 4.4 Write property test for empty carts in `test/price.test.ts`
    - **Property 5: Empty carts price to zero**
    - **Validates: Requirements 4.4, 6.1**

  - [x]* 4.5 Write property test for coupon discount in `test/price.test.ts`
    - **Property 6: Coupon discount matches the coupon rules**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**

  - [x]* 4.6 Write property test for shipping in `test/price.test.ts`
    - **Property 7: Shipping follows method and threshold**
    - **Validates: Requirements 6.2, 6.3, 6.4**

  - [x]* 4.7 Write property test for tax in `test/price.test.ts`
    - **Property 8: Tax is computed on the discounted subtotal only**
    - Include the check that changing only the shipping method leaves `taxCents` unchanged
    - **Validates: Requirements 7.1, 7.2**

  - [x]* 4.8 Write property test for Breakdown invariants in `test/price.test.ts`
    - **Property 9: Breakdown invariants**
    - Non-negative integer fields, `discountCents <= subtotalCents`, total identity
    - **Validates: Requirements 5.5, 7.3, 7.4**

  - [x]* 4.9 Write unit tests for `priceCart` in `test/price.test.ts`
    - Shipping thresholds: discounted 9999 gives 799, 10000 gives 0, express at 10000 gives 1499
    - Bulk boundary: quantity 9 vs 10 at unit price 5 (45 and 45), quantity 10 at price 1 gives 9
    - Exact-half bulk discount: quantity 11 at unit price 5 gives 49 (raw 55, discount `percentOf(55, 1000)` = 6)
    - Coupon below minimum gives 0; `minSubtotalCents` equal to subtotal applies
    - Empty cart with coupon, express, and nonzero `taxBps` yields all zeros
    - _Requirements: 4.1, 4.2, 4.4, 5.1, 5.2, 6.2, 6.3, 6.4_

  - [x]* 4.10 Write public API smoke test in `test/api.test.ts`
    - Import `priceCart`, `percentOf`, `ValidationError` from `../src/index` and assert they are defined
    - Type-only import of `Cart`, `Line`, `Coupon`, `Breakdown` and use them in a typed sample cart
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 5. Final checkpoint - Ensure all tests pass
  - Run `npm test` and `npm run typecheck`, then confirm `git diff --exit-code -- package.json tsconfig.json vitest.config.ts test/setup.ts` shows no changes.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 1.5, 8.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties; unit tests cover examples and edge cases
- Tasks 1.4 and 1.5 share `test/percent.test.ts`, tasks 3.2 to 3.4 share `test/validation.test.ts`, and tasks 4.3 to 4.9 share `test/price.test.ts`, so each group runs in separate waves
- The API smoke test lives in its own file `test/api.test.ts`, which adds one file to the layout in the design

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "3.1"] },
    { "id": 2, "tasks": ["1.4", "3.2", "4.1"] },
    { "id": 3, "tasks": ["1.5", "3.3", "4.2"] },
    { "id": 4, "tasks": ["3.4", "4.3", "4.10"] },
    { "id": 5, "tasks": ["4.4"] },
    { "id": 6, "tasks": ["4.5"] },
    { "id": 7, "tasks": ["4.6"] },
    { "id": 8, "tasks": ["4.7"] },
    { "id": 9, "tasks": ["4.8"] },
    { "id": 10, "tasks": ["4.9"] }
  ]
}
```
