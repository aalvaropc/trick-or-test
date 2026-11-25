import { describe, expect, it } from "vitest";
import { selectSpec } from "../../src/core/select-spec.js";

const failure = (names: string[], requested?: string): string => {
  const result = selectSpec(names, requested);
  if (result.ok) throw new Error(`expected an error, got ${result.value}`);
  return result.error.message;
};

describe("selectSpec", () => {
  it("9.5 returns the requested name when it is the only listed spec", () => {
    expect(selectSpec(["cart"], "cart")).toEqual({ ok: true, value: "cart" });
  });

  it("9.5 returns the requested name when it is listed among several", () => {
    expect(selectSpec(["cart", "pricing", "viewer"], "pricing")).toEqual({
      ok: true,
      value: "pricing",
    });
  });

  it("9.16 returns the single name of a one-name list without a requested name", () => {
    expect(selectSpec(["cart"])).toEqual({ ok: true, value: "cart" });
  });

  it("9.16 several specs without a requested name list every name sorted and ask for --spec <name>", () => {
    const message = failure(["pricing", "cart", "alpha"]);
    expect(message).toContain("alpha, cart, pricing");
    expect(message).toContain("--spec <name>");
  });

  it("9.16 two specs without a requested name is already an error", () => {
    expect(selectSpec(["b", "a"]).ok).toBe(false);
  });

  it("9.5 an unlisted requested name is named in the error with the available names", () => {
    const message = failure(["pricing", "cart"], "ghost");
    expect(message).toContain("ghost");
    expect(message).toContain("cart, pricing");
  });

  it("9.5 a requested name that differs only by case is not listed", () => {
    expect(selectSpec(["cart"], "Cart").ok).toBe(false);
  });

  it("9.5 an empty list without a requested name says no spec was found", () => {
    expect(failure([])).toContain("no spec found");
  });

  it("9.5 an empty list with a requested name says no spec was found", () => {
    expect(failure([], "cart")).toContain("no spec found");
  });

  it("9.16 the input order does not change the message", () => {
    expect(failure(["a", "b", "c"])).toBe(failure(["c", "a", "b"]));
    expect(failure(["a", "b", "c"], "x")).toBe(failure(["b", "c", "a"], "x"));
  });

  it("9.16 does not reorder the caller's list", () => {
    const names = ["b", "a"];
    selectSpec(names);
    expect(names).toEqual(["b", "a"]);
  });
});
