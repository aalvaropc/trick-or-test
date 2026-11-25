import { expect, it } from "vitest";

throw new Error("boom at import");

it("never registered", () => {
  expect(1).toBe(1);
});
