export type Line = {
  quantity: number; // integer 1..999
  unitPriceCents: number; // integer 0..1_000_000
};

export type PercentCoupon = {
  kind: 'percent';
  bps: number;
  maxDiscountCents: number;
  minSubtotalCents: number;
};

export type FixedCoupon = {
  kind: 'fixed';
  amountCents: number;
  minSubtotalCents: number;
};

export type Coupon = PercentCoupon | FixedCoupon;

export type Cart = {
  lines: Line[];
  coupon?: Coupon;
  shipping: 'standard' | 'express';
  taxBps: number; // integer 0..10000
};

export type Breakdown = {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
};
