import { expect, it } from "vitest";
import { quadruple } from "../src/calc";

it("quadruples", () => {
  expect(quadruple(2)).toBe(8);
});
