import { expect, it, describe } from "vitest";

it("top level", () => {
  expect(1).toBe(1);
});

describe("outer", () => {
  it("inside one", () => {
    expect(1).toBe(1);
  });

  describe("inner", () => {
    it("inside two", () => {
      expect(1).toBe(1);
    });
  });
});

it("a > b", () => {
  expect(1).toBe(1);
});
