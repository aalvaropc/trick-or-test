import { double } from "./helper";

export class NotPositiveError extends Error {}

export const quadruple = (n: number): number => double(double(n));

export const mustBePositive = (n: number): number => {
  if (n <= 0) throw new NotPositiveError("not positive");
  return n;
};
