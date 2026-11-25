const BPS_DENOMINATOR = 10000;
const HALF = 5000;

/**
 * Computes `amount * bps / 10000`, rounded to the nearest integer with exact
 * halves rounded up (Round_Half_Up).
 *
 * Contract: `amount` and `bps` are non-negative integers and
 * `amount * bps + 5000 <= Number.MAX_SAFE_INTEGER`. Within that range the
 * result is exact. Outside it the result is unspecified. The function performs
 * no validation and never throws.
 */
export function percentOf(amount: number, bps: number): number {
  return Math.floor((amount * bps + HALF) / BPS_DENOMINATOR);
}
