import { describe, expect, it } from "vitest";
import { buildVerdict, type VerdictInput } from "../../src/core/report.js";
import type { BaselineTest, Verdict } from "../../src/core/types.js";

const root = "/work/project";

const metadata = {
  gitCommit: "abc123",
  seed: 1,
  engineVersion: "0.0.0",
  nodeVersion: "v26.0.0",
  strykerVersion: "1.0.0",
  vitestVersion: "1.0.0",
  typescriptVersion: "7.0.0",
  timestamp: "2025-01-01T00:00:00.000Z",
};

const verdictOf = (extra: Partial<VerdictInput>): Verdict => {
  const built = buildVerdict({
    coverage: [],
    mutants: [],
    witnesses: {},
    ignoreStaticRetried: false,
    metadata,
    projectRoot: root,
    ...extra,
  });
  if (!built.ok) throw new Error(built.error);
  return built.value;
};

const testWithClaim = (criterion: string): BaselineTest =>
  ({
    id: "test/cart.test.ts > a",
    kind: "example",
    claims: [{ criterion, outcome: "held" }],
  }) as unknown as BaselineTest;

describe("8.17 new fields carry no absolute path", () => {
  it("8.17 a spec name under the project root is written relative", () => {
    const v = verdictOf({ specName: "/work/project/.kiro/specs/cart" });
    expect(v.metadata.specName).toBe(".kiro/specs/cart");
  });

  it("8.17 a spec name outside the project root keeps only its last segment", () => {
    const v = verdictOf({ specName: "/elsewhere/specs/cart" });
    expect(v.metadata.specName).toBe("<outside-project>/cart");
  });

  it("8.17 a plain spec name is written unchanged", () => {
    expect(verdictOf({ specName: "cart-pricing" }).metadata.specName).toBe("cart-pricing");
  });

  it("8.31 a claim criterion with an absolute path is scrubbed", () => {
    const v = verdictOf({ baselineTests: [testWithClaim("see /work/project/src/cart.ts now")] });
    expect(v.baselineTests?.[0]?.claims?.[0]?.criterion).toBe("see src/cart.ts now");
  });

  it("8.31 a plain claim criterion is written unchanged", () => {
    const v = verdictOf({ baselineTests: [testWithClaim("4.1")] });
    expect(v.baselineTests?.[0]?.claims?.[0]?.criterion).toBe("4.1");
  });
});
