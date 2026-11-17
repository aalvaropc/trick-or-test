import { ValidationError } from './errors';
import type { Cart } from './types';

function isIntInRange(v: unknown, min: number, max: number): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

/**
 * Validates the cart's taxBps and each line's quantity and unitPriceCents.
 * Throws ValidationError naming one invalid field. Coupon fields are not inspected.
 */
export function validateCart(cart: Cart): void {
  if (!isIntInRange(cart.taxBps, 0, 10000)) {
    throw new ValidationError('taxBps');
  }
  for (let i = 0; i < cart.lines.length; i++) {
    const line = cart.lines[i];
    if (!isIntInRange(line.quantity, 1, 999)) {
      throw new ValidationError(`lines[${i}].quantity`);
    }
    if (!isIntInRange(line.unitPriceCents, 0, 1_000_000)) {
      throw new ValidationError(`lines[${i}].unitPriceCents`);
    }
  }
}
