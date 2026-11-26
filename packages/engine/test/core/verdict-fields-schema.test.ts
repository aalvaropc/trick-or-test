import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  criterionCoverageSchema,
  verdictSchema,
  verdictWitnessSchema,
  witnessSchema,
} from "../../src/core/report.js";
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

const baseWitness = { from: "src/price.ts", export: "price", args: [1], expected: 2 };

type Json = Record<string, unknown>;

const verdict = (coverage: Json, witness: Json): unknown => ({
  coverage: [coverage],
  mutants: [],
  witnesses: { "oath-4.1-x": witness },
  ignoreStaticRetried: false,
  metadata,
});

const plainCoverage = { criterion: "4.1", status: "guarded" };

describe("verdict optional fields schema", () => {
  it("8.20 a verdict without text and without mutatedOutcome parses", () => {
    expect(verdictSchema.safeParse(verdict(plainCoverage, baseWitness)).success).toBe(true);
  });

  it("8.20 a verdict with text and mutatedOutcome parses and keeps both", () => {
    const input = verdict(
      { ...plainCoverage, text: "Bulk discount applies" },
      { ...baseWitness, mutatedOutcome: { kind: "value", value: 3 } },
    );
    const parsed = verdictSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.coverage[0]?.text).toBe("Bulk discount applies");
      expect(parsed.data.witnesses).toEqual({
        "oath-4.1-x": { ...baseWitness, mutatedOutcome: { kind: "value", value: 3 } },
      });
    }
  });

  it.each([
    { kind: "value", value: 3 },
    { kind: "error", className: "RangeError" },
    { kind: "timeout", message: "too slow" },
    { kind: "no-outcome", message: "nothing ran" },
  ])("8.20 mutatedOutcome of kind $kind parses", (mutatedOutcome) => {
    const input = verdict(plainCoverage, { ...baseWitness, mutatedOutcome });
    expect(verdictSchema.safeParse(input).success).toBe(true);
  });

  it("8.20 mutatedOutcome parses next to an expectedError witness", () => {
    const witness = {
      from: "src/price.ts",
      export: "price",
      args: [],
      expectedError: "RangeError",
      mutatedOutcome: { kind: "value", value: 0 },
    };
    expect(verdictWitnessSchema.safeParse(witness).success).toBe(true);
  });

  it("8.20 an unknown field next to text is rejected", () => {
    expect(
      criterionCoverageSchema.safeParse({ ...plainCoverage, text: "t", extra: 1 }).success,
    ).toBe(false);
    expect(
      verdictSchema.safeParse(verdict({ ...plainCoverage, text: "t", extra: 1 }, baseWitness))
        .success,
    ).toBe(false);
  });

  it("8.20 an unknown field next to mutatedOutcome is rejected", () => {
    const witness = { ...baseWitness, mutatedOutcome: { kind: "value", value: 3 }, extra: 1 };
    expect(verdictWitnessSchema.safeParse(witness).success).toBe(false);
    expect(verdictSchema.safeParse(verdict(plainCoverage, witness)).success).toBe(false);
  });

  it("8.20 an unknown field inside mutatedOutcome is rejected", () => {
    const witness = { ...baseWitness, mutatedOutcome: { kind: "value", value: 3, extra: 1 } };
    expect(verdictWitnessSchema.safeParse(witness).success).toBe(false);
  });

  it("8.20 an invalid mutatedOutcome kind is rejected", () => {
    const witness = { ...baseWitness, mutatedOutcome: { kind: "crash", message: "x" } };
    expect(verdictSchema.safeParse(verdict(plainCoverage, witness)).success).toBe(false);
  });

  it("8.20 a non-string text is rejected", () => {
    expect(criterionCoverageSchema.safeParse({ ...plainCoverage, text: 5 }).success).toBe(false);
  });

  it("8.20 witnessSchema still rejects mutatedOutcome", () => {
    const witness = { ...baseWitness, mutatedOutcome: { kind: "value", value: 3 } };
    expect(witnessSchema.safeParse(witness).success).toBe(false);
    expect(witnessSchema.safeParse(baseWitness).success).toBe(true);
  });

  it("8.20 the schemas are exported from the report subpath", () => {
    expect(reportSubpath.verdictWitnessSchema).toBe(verdictWitnessSchema);
    expect(reportSubpath.criterionCoverageSchema).toBe(criterionCoverageSchema);
    expect(reportSubpath.verdictSchema).toBe(verdictSchema);
  });

  it("8.20 the report subpath index has no node: import", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "../../src/report/index.ts"), "utf8");
    expect(source).not.toMatch(/["']node:/);
  });
});
