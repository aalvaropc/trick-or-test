// Guard_Test for requirement 7.4 of cart-pricing. It runs only inside the throwaway copy that
// `npm run demo` makes (as extra/guard-7.4.test.ts), where ../src resolves.
import { describe, expect, it } from "vitest";
import { type Breakdown, type Coupon, priceCart } from "../src/index";

// One line of 1000 cents, standard shipping (799 below 10000), no tax.
function price(coupon: Coupon): Breakdown {
  return priceCart({
    lines: [{ quantity: 1, unitPriceCents: 1000 }],
    coupon,
    shipping: "standard",
    taxBps: 0,
  });
}

function fixed(amountCents: number): Coupon {
  return { kind: "fixed", amountCents, minSubtotalCents: 0 };
}

describe("7.4 a discount never makes a Breakdown field negative", () => {
  it("7.4 a fixed coupon of -1 cent (just below zero) gives no discount", () => {
    expect(price(fixed(-1))).toEqual({
      subtotalCents: 1000,
      discountCents: 0,
      shippingCents: 799,
      taxCents: 0,
      totalCents: 1799,
    });
  });

  it("7.4 a fixed coupon of 0 cents (at zero) gives no discount", () => {
    expect(price(fixed(0))).toEqual({
      subtotalCents: 1000,
      discountCents: 0,
      shippingCents: 799,
      taxCents: 0,
      totalCents: 1799,
    });
  });

  it("7.4 a fixed coupon of 1 cent (just above zero) takes 1 cent off", () => {
    expect(price(fixed(1))).toEqual({
      subtotalCents: 1000,
      discountCents: 1,
      shippingCents: 799,
      taxCents: 0,
      totalCents: 1798,
    });
  });

  it("7.4 a fixed coupon far below zero gives no discount", () => {
    expect(price(fixed(-1000000))).toEqual({
      subtotalCents: 1000,
      discountCents: 0,
      shippingCents: 799,
      taxCents: 0,
      totalCents: 1799,
    });
  });

  it("7.4 a percent coupon with negative bps gives no discount", () => {
    const breakdown = price({
      kind: "percent",
      bps: -10000,
      maxDiscountCents: 5000,
      minSubtotalCents: 0,
    });
    expect(breakdown).toEqual({
      subtotalCents: 1000,
      discountCents: 0,
      shippingCents: 799,
      taxCents: 0,
      totalCents: 1799,
    });
  });

  it("7.4 a fixed coupon 1 cent under the subtotal leaves 1 cent to pay for goods", () => {
    expect(price(fixed(999))).toEqual({
      subtotalCents: 1000,
      discountCents: 999,
      shippingCents: 799,
      taxCents: 0,
      totalCents: 800,
    });
  });

  it("7.4 a fixed coupon equal to the subtotal leaves nothing to pay for goods", () => {
    expect(price(fixed(1000))).toEqual({
      subtotalCents: 1000,
      discountCents: 1000,
      shippingCents: 799,
      taxCents: 0,
      totalCents: 799,
    });
  });

  it("7.4 a fixed coupon 1 cent over the subtotal is capped at the subtotal", () => {
    expect(price(fixed(1001))).toEqual({
      subtotalCents: 1000,
      discountCents: 1000,
      shippingCents: 799,
      taxCents: 0,
      totalCents: 799,
    });
  });
});
