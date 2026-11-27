import { describe, expect, it } from "vitest";
import { verdictSchema } from "../../src/core/report.js";
import * as reportSubpath from "../../src/report/index.js";

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

const baseVerdict = (): Record<string, unknown> => ({
  coverage: [],
  mutants: [],
  witnesses: {},
  ignoreStaticRetried: false,
  metadata,
});

const withClaim = (claim: Record<string, unknown>): Record<string, unknown> => ({
  ...baseVerdict(),
  baselineTests: [{ id: "test/cart.test.ts::a test", kind: "example", claims: [claim] }],
});

const counts = (): Record<string, unknown> => ({
  total: 4,
  held: 1,
  notHeld: 1,
  unchecked: 1,
  unknownCriterion: 1,
  notHeldOthersKilledAll: 1,
  notHeldOthersDidNot: 0,
});

describe("claims schema", () => {
  it("8.29 a verdict without claims and claimCounts parses", () => {
    expect(
      verdictSchema.safeParse({
        ...baseVerdict(),
        baselineTests: [{ id: "test/a.test.ts::t", kind: "example" }],
      }).success,
    ).toBe(true);
    expect(verdictSchema.safeParse(baseVerdict()).success).toBe(true);
  });

  it("11.11 a held claim parses", () => {
    expect(verdictSchema.safeParse(withClaim({ criterion: "4.1", outcome: "held" })).success).toBe(
      true,
    );
  });

  it("11.11 a not-held claim with otherTestsKilledAll parses, true and false", () => {
    for (const flag of [true, false]) {
      expect(
        verdictSchema.safeParse(
          withClaim({ criterion: "4.1", outcome: "not-held", otherTestsKilledAll: flag }),
        ).success,
      ).toBe(true);
    }
  });

  it("11.11 an unchecked claim parses", () => {
    expect(
      verdictSchema.safeParse(withClaim({ criterion: "2.2", outcome: "unchecked" })).success,
    ).toBe(true);
  });

  it("11.11 an unknown-criterion claim parses", () => {
    expect(
      verdictSchema.safeParse(withClaim({ criterion: "99.9", outcome: "unknown-criterion" }))
        .success,
    ).toBe(true);
  });

  it("11.11 otherTestsKilledAll on a held claim is rejected", () => {
    expect(
      verdictSchema.safeParse(
        withClaim({ criterion: "4.1", outcome: "held", otherTestsKilledAll: true }),
      ).success,
    ).toBe(false);
  });

  it("11.11 otherTestsKilledAll on an unchecked claim is rejected", () => {
    expect(
      verdictSchema.safeParse(
        withClaim({ criterion: "4.1", outcome: "unchecked", otherTestsKilledAll: false }),
      ).success,
    ).toBe(false);
  });

  it("11.11 otherTestsKilledAll on an unknown-criterion claim is rejected", () => {
    expect(
      verdictSchema.safeParse(
        withClaim({ criterion: "9.9", outcome: "unknown-criterion", otherTestsKilledAll: true }),
      ).success,
    ).toBe(false);
  });

  it("11.11 a not-held claim without otherTestsKilledAll is rejected", () => {
    expect(
      verdictSchema.safeParse(withClaim({ criterion: "4.1", outcome: "not-held" })).success,
    ).toBe(false);
  });

  it("11.12 an unknown outcome is rejected", () => {
    expect(verdictSchema.safeParse(withClaim({ criterion: "4.1", outcome: "maybe" })).success).toBe(
      false,
    );
  });

  it("11.12 an unknown key in a claim is rejected", () => {
    expect(
      verdictSchema.safeParse(withClaim({ criterion: "4.1", outcome: "held", extra: 1 })).success,
    ).toBe(false);
  });

  it("11.12 claimCounts parses and is kept", () => {
    const parsed = verdictSchema.safeParse({ ...baseVerdict(), claimCounts: counts() });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.claimCounts?.total).toBe(4);
    }
  });

  it("11.12 a negative count is rejected", () => {
    expect(
      verdictSchema.safeParse({ ...baseVerdict(), claimCounts: { ...counts(), held: -1 } }).success,
    ).toBe(false);
  });

  it("11.12 an unknown key in claimCounts is rejected", () => {
    expect(
      verdictSchema.safeParse({ ...baseVerdict(), claimCounts: { ...counts(), extra: 1 } }).success,
    ).toBe(false);
  });

  it("11.12 the report subpath exports the claim schemas", () => {
    expect(typeof reportSubpath.claimSchema.safeParse).toBe("function");
    expect(typeof reportSubpath.claimCountsSchema.safeParse).toBe("function");
    expect(typeof reportSubpath.claimOutcomeSchema.safeParse).toBe("function");
  });
});
