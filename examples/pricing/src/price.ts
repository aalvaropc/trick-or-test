import { percentOf } from './percent';
import { validateCart } from './validate';
import type { Breakdown, Cart, Coupon, Line } from './types';

const BULK_THRESHOLD = 10;
const BULK_DISCOUNT_BPS = 1000; // 10%
const FREE_SHIPPING_THRESHOLD = 10000;
const STANDARD_SHIPPING = 799;
const EXPRESS_SHIPPING = 1499;

function lineTotal(line: Line): number {
  const raw = line.quantity * line.unitPriceCents;
  return line.quantity >= BULK_THRESHOLD
    ? raw - percentOf(raw, BULK_DISCOUNT_BPS)
    : raw;
}

function couponDiscount(coupon: Coupon | undefined, subtotal: number): number {
  if (coupon === undefined || subtotal < coupon.minSubtotalCents) return 0;
  const raw =
    coupon.kind === 'percent'
      ? Math.min(percentOf(subtotal, coupon.bps), coupon.maxDiscountCents)
      : coupon.amountCents;
  return Math.max(0, Math.min(raw, subtotal));
}

function shippingFor(
  method: Cart['shipping'],
  lineCount: number,
  discounted: number,
): number {
  if (lineCount === 0) return 0;
  if (method === 'express') return EXPRESS_SHIPPING;
  return discounted >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;
}

/**
 * Prices a cart in integer cents. Validates first and throws
 * `ValidationError` on invalid lines or `taxBps`.
 *
 * Supported size: the tax numerator (discounted subtotal * taxBps) must stay
 * within the safe integer range. With per-line maximums (999 * 1,000,000)
 * that allows roughly 900 maximum-value lines; larger carts are out of scope.
 */
export function priceCart(cart: Cart): Breakdown {
  validateCart(cart);
  let subtotalCents = 0;
  for (const line of cart.lines) subtotalCents += lineTotal(line);
  const discountCents = couponDiscount(cart.coupon, subtotalCents);
  const discounted = subtotalCents - discountCents;
  const shippingCents = shippingFor(cart.shipping, cart.lines.length, discounted);
  const taxCents = percentOf(discounted, cart.taxBps);
  const totalCents = discounted + shippingCents + taxCents;
  return { subtotalCents, discountCents, shippingCents, taxCents, totalCents };
}
