import { describe, expect, it } from "vitest";
import { computeKillClass } from "../../src/core/kill-classification.js";

const example = { kind: "example" } as const;
const property = { kind: "property" } as const;

describe("computeKillClass", () => {
  it("6.6 only example tests killing the mutant gives examples-only", () => {
    expect(computeKillClass([example, example])).toBe("examples-only");
  });

  it("6.7 only property tests killing the mutant gives properties-only", () => {
    expect(computeKillClass([property, property])).toBe("properties-only");
  });

  it("6.8 both kinds of test killing the mutant gives both", () => {
    expect(computeKillClass([example, property])).toBe("both");
    expect(computeKillClass([property, example, property])).toBe("both");
  });

  it("6.9 an empty killing-test list gives unattributed", () => {
    expect(computeKillClass([])).toBe("unattributed");
  });

  it("6.6 a single example test gives examples-only", () => {
    expect(computeKillClass([example])).toBe("examples-only");
  });

  it("6.7 a single property test gives properties-only", () => {
    expect(computeKillClass([property])).toBe("properties-only");
  });
});
