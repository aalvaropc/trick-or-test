# Requirements Document

## Introduction

Cart_Pricing_Library is a pure TypeScript library that computes a price breakdown for a shopping cart. All monetary amounts are integer cents. The library exposes `priceCart`, `percentOf`, and `ValidationError` from `src/index.ts`, along with the types `Cart`, `Line`, `Coupon`, and `Breakdown`. Tests use Vitest and fast-check under `test/`. Source uses erasable TypeScript syntax only (no enums, no namespaces). The files `package.json`, `tsconfig.json`, `vitest.config.ts`, and `test/setup.ts` remain unchanged.

## Glossary

- **Cart_Pricing_Library**: The pure TypeScript library in `src/` that exports `priceCart`, `percentOf`, and `ValidationError`.
- **Price_Calculator**: The `priceCart` function, which converts a Cart into a Breakdown.
- **Percent_Calculator**: The `percentOf` function, which computes a basis-point percentage of an integer amount.
- **Validator**: The input validation logic within the Price_Calculator.
- **ValidationError**: An error class with a `field` property naming the offending input field.
- **Cart**: Input object containing lines, an optional coupon, a shipping method, and a tax rate in basis points (`taxBps`).
- **Line**: A cart entry with `quantity` and `unitPriceCents`.
- **Coupon**: Either a percent coupon (`bps`, `maxDiscountCents`, `minSubtotalCents`) or a fixed coupon (`amountCents`, `minSubtotalCents`).
- **Breakdown**: Output object with `subtotalCents`, `discountCents`, `shippingCents`, `taxCents`, `totalCents`.
- **Basis_Point (bps)**: One hundredth of one percent; 10000 bps equals 100%.
- **Bulk_Discount**: A 10% reduction of a Line total applied when the Line quantity is 10 or more.
- **Line_Total**: `quantity` multiplied by `unitPriceCents`, after Bulk_Discount if applicable.
- **Subtotal**: The sum of all Line_Total values.
- **Discounted_Subtotal**: The Subtotal minus the coupon discount.
- **Shipping_Method**: Either `standard` or `express`.
- **Round_Half_Up**: Rounding of a fractional result to the nearest integer, with exact halves rounded upward, using integer arithmetic only.

## Requirements

### Requirement 1: Public API Surface

**User Story:** As a library consumer, I want a single entry point exporting the pricing API, so that I can import everything from one module.

#### Acceptance Criteria

1. THE Cart_Pricing_Library SHALL export `priceCart`, `percentOf`, and `ValidationError` as values from `src/index.ts`.
2. THE Cart_Pricing_Library SHALL export the types `Cart`, `Line`, `Coupon`, and `Breakdown` from `src/index.ts`.
3. THE Cart_Pricing_Library SHALL define the Coupon type as a union of a percent variant with `bps`, `maxDiscountCents`, and `minSubtotalCents`, and a fixed variant with `amountCents` and `minSubtotalCents`.
4. THE Cart_Pricing_Library SHALL define the Breakdown type with the fields `subtotalCents`, `discountCents`, `shippingCents`, `taxCents`, and `totalCents`.
5. THE Cart_Pricing_Library SHALL use only erasable TypeScript syntax, excluding enums and namespaces.

### Requirement 2: Percentage Calculation

**User Story:** As a developer, I want a shared percentage helper, so that all percentage computations round consistently.

#### Acceptance Criteria

1. WHEN `percentOf` is called with a non-negative integer amount and a non-negative integer bps, THE Percent_Calculator SHALL return the amount multiplied by bps divided by 10000, using Round_Half_Up.
2. THE Percent_Calculator SHALL compute results using integer arithmetic only.
3. THE Percent_Calculator SHALL accept inputs without performing validation.

### Requirement 3: Input Validation

**User Story:** As a library consumer, I want invalid cart inputs rejected with a clear error, so that I can identify and fix the offending field.

#### Acceptance Criteria

1. IF a Line `quantity` is not an integer between 1 and 999 inclusive, THEN THE Validator SHALL throw a ValidationError whose `field` is `lines[i].quantity`, where `i` is the zero-based index of the Line.
2. IF a Line `unitPriceCents` is not an integer between 0 and 1,000,000 inclusive, THEN THE Validator SHALL throw a ValidationError whose `field` is `lines[i].unitPriceCents`, where `i` is the zero-based index of the Line.
3. IF `taxBps` is not an integer between 0 and 10000 inclusive, THEN THE Validator SHALL throw a ValidationError whose `field` is `taxBps`.
4. WHEN a Cart contains multiple invalid fields, THE Validator SHALL throw a ValidationError naming one of the invalid fields.
5. THE Validator SHALL accept Coupon field values without validation.

### Requirement 4: Subtotal and Bulk Discount

**User Story:** As a shopper, I want bulk purchases discounted, so that I pay less for larger quantities.

#### Acceptance Criteria

1. WHEN a Line has a `quantity` of 10 or more, THE Price_Calculator SHALL compute the bulk discount amount as `percentOf(raw, 1000)`, where `raw` is the Line's `quantity` multiplied by `unitPriceCents`, with the discount amount rounded using Round_Half_Up, and SHALL set the Line_Total to `raw` minus that bulk discount amount. For example, a Line with `quantity` 11 and `unitPriceCents` 5 has `raw` 55, a bulk discount amount of 6, and a Line_Total of 49.
2. WHEN a Line has a `quantity` below 10, THE Price_Calculator SHALL set the Line_Total to `quantity` multiplied by `unitPriceCents`.
3. THE Price_Calculator SHALL set `subtotalCents` to the sum of all Line_Total values.
4. WHEN the Cart contains zero Lines, THE Price_Calculator SHALL return a Breakdown in which every field equals 0.

### Requirement 5: Coupon Discount

**User Story:** As a shopper, I want coupons applied to my cart, so that I receive the advertised savings.

#### Acceptance Criteria

1. WHEN a Coupon is present and the Subtotal is greater than or equal to the Coupon `minSubtotalCents`, THE Price_Calculator SHALL apply the Coupon discount.
2. IF a Coupon is present and the Subtotal is less than the Coupon `minSubtotalCents`, THEN THE Price_Calculator SHALL set `discountCents` to 0.
3. WHEN a percent Coupon applies, THE Price_Calculator SHALL compute the discount as `percentOf(subtotal, bps)` and limit the discount to `maxDiscountCents`.
4. WHEN a fixed Coupon applies, THE Price_Calculator SHALL set the discount to `amountCents`.
5. THE Price_Calculator SHALL limit `discountCents` to a value less than or equal to `subtotalCents`.
6. WHEN no Coupon is present, THE Price_Calculator SHALL set `discountCents` to 0.

### Requirement 6: Shipping

**User Story:** As a shopper, I want shipping charged by method with a free-shipping threshold, so that costs are predictable.

#### Acceptance Criteria

1. WHEN the Cart contains zero Lines, THE Price_Calculator SHALL set `shippingCents` to 0.
2. WHERE the Shipping_Method is `standard` and the Cart contains at least one Line, THE Price_Calculator SHALL set `shippingCents` to 799 when the Discounted_Subtotal is below 10000.
3. WHERE the Shipping_Method is `standard` and the Cart contains at least one Line, THE Price_Calculator SHALL set `shippingCents` to 0 when the Discounted_Subtotal is 10000 or more.
4. WHERE the Shipping_Method is `express` and the Cart contains at least one Line, THE Price_Calculator SHALL set `shippingCents` to 1499.

### Requirement 7: Tax and Total

**User Story:** As a shopper, I want tax and total computed correctly, so that the final amount is accurate.

#### Acceptance Criteria

1. THE Price_Calculator SHALL set `taxCents` to `percentOf(Discounted_Subtotal, taxBps)`.
2. THE Price_Calculator SHALL exclude `shippingCents` from the tax base.
3. THE Price_Calculator SHALL set `totalCents` to the Discounted_Subtotal plus `shippingCents` plus `taxCents`.
4. THE Price_Calculator SHALL return every Breakdown field as a non-negative integer.

### Requirement 8: Test Coverage

**User Story:** As a maintainer, I want automated tests covering the rules, so that regressions are detected.

#### Acceptance Criteria

1. THE Cart_Pricing_Library SHALL include Vitest tests under `test/` that use fast-check property tests for the Breakdown invariants: non-negative integer fields, `discountCents` not exceeding `subtotalCents`, and `totalCents` equal to the Discounted_Subtotal plus `shippingCents` plus `taxCents`.
2. THE Cart_Pricing_Library SHALL include tests that assert the `field` value of each ValidationError case in Requirement 3.
3. THE Cart_Pricing_Library SHALL include tests for Round_Half_Up behavior at exact-half boundaries of `percentOf`.
4. THE Cart_Pricing_Library SHALL include tests that avoid asserting which ValidationError is thrown first when multiple fields are invalid.
5. THE Cart_Pricing_Library SHALL leave `package.json`, `tsconfig.json`, `vitest.config.ts`, and `test/setup.ts` unchanged.
