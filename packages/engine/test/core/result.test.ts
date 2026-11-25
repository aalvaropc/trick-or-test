import { describe, expect, it } from "vitest";
import { err, ok, type Result } from "../../src/core/result.js";

describe("Result helpers", () => {
  it("10.3 ok wraps a value in a successful Result", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("10.3 err wraps an error in a failed Result", () => {
    expect(err({ filePath: "a.md" })).toEqual({ ok: false, error: { filePath: "a.md" } });
  });

  it("10.3 a Result can be narrowed on its ok discriminant", () => {
    const parse = (n: number): Result<number, string> => (n >= 0 ? ok(n) : err("negative"));
    const good = parse(1);
    const bad = parse(-1);
    expect(good.ok && good.value).toBe(1);
    expect(!bad.ok && bad.error).toBe("negative");
  });
});
