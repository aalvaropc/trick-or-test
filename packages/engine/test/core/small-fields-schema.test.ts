import { describe, expect, it } from "vitest";
import { historyRecordSchema, runMetadataSchema, verdictSchema } from "../../src/core/report.js";
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

const counts = (): Record<string, number> => ({
  Killed: 0,
  Survived: 0,
  Timeout: 0,
  Ghost: 0,
  InvalidWitness: 0,
  CompileError: 0,
  NotApplicable: 0,
});

const baseRecord = (): Record<string, unknown> => ({
  time: "2025-01-01T00:00:00.000Z",
  gitCommit: "abc123",
  seed: 1,
  config: {
    specDir: ".kiro/specs/x",
    sourceGlobs: ["src/**/*.ts"],
    testGlobs: ["test/**/*.test.ts"],
    propertyTestGlobs: ["test/**/*.property.test.ts"],
    mutantsDir: "mutants/x",
    outputDir: ".trickortest",
  },
  mutants: [],
  statusCounts: counts(),
  coverageCounts: { guarded: 1, unguarded: 0, unattacked: 0, skipped: 0 },
  newlyKilledIds: [],
});

const requirements = (): unknown[] => [
  { requirement: 1, title: "Cart totals" },
  { requirement: 2, title: "Shipping" },
];

const rows = (): unknown[] => [
  { criterion: "1.1", status: "guarded" },
  { criterion: "1.2", status: "unattacked" },
];

describe("small fields schema", () => {
  it("8.29 a verdict without specName and requirements parses", () => {
    expect(verdictSchema.safeParse(baseVerdict()).success).toBe(true);
  });

  it("8.29 a history record without coverageByCriterion parses", () => {
    expect(historyRecordSchema.safeParse(baseRecord()).success).toBe(true);
  });

  it("8.25 a verdict with metadata.specName parses and keeps it", () => {
    const parsed = verdictSchema.safeParse({
      ...baseVerdict(),
      metadata: { ...metadata, specName: "cart-pricing" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.metadata.specName).toBe("cart-pricing");
  });

  it("8.25 an unknown key in the run metadata is still rejected", () => {
    expect(runMetadataSchema.safeParse({ ...metadata, extra: 1 }).success).toBe(false);
  });

  it("8.26 a verdict with requirements parses and keeps them", () => {
    const parsed = verdictSchema.safeParse({ ...baseVerdict(), requirements: requirements() });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.requirements).toEqual(requirements());
  });

  it("8.26 an unknown key inside a requirements entry is rejected", () => {
    expect(
      verdictSchema.safeParse({
        ...baseVerdict(),
        requirements: [{ requirement: 1, title: "Cart totals", extra: true }],
      }).success,
    ).toBe(false);
  });

  it("8.26 an empty title is rejected", () => {
    expect(
      verdictSchema.safeParse({
        ...baseVerdict(),
        requirements: [{ requirement: 1, title: "" }],
      }).success,
    ).toBe(false);
  });

  it.each([1.5, 0, -1])("8.26 a requirement number of %s is rejected", (bad) => {
    expect(
      verdictSchema.safeParse({
        ...baseVerdict(),
        requirements: [{ requirement: bad, title: "Cart totals" }],
      }).success,
    ).toBe(false);
  });

  it("8.27 a history record with coverageByCriterion parses and keeps it", () => {
    const parsed = historyRecordSchema.safeParse({
      ...baseRecord(),
      coverageByCriterion: rows(),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.coverageByCriterion).toEqual(rows());
  });

  it("8.27 an unknown key inside a coverageByCriterion row is rejected", () => {
    expect(
      historyRecordSchema.safeParse({
        ...baseRecord(),
        coverageByCriterion: [{ criterion: "1.1", status: "guarded", extra: 1 }],
      }).success,
    ).toBe(false);
  });

  it("8.27 an unknown Coverage_Status is rejected", () => {
    expect(
      historyRecordSchema.safeParse({
        ...baseRecord(),
        coverageByCriterion: [{ criterion: "1.1", status: "haunted" }],
      }).success,
    ).toBe(false);
  });

  it("8.29 an unknown top-level key in a verdict is still rejected", () => {
    expect(verdictSchema.safeParse({ ...baseVerdict(), extra: 1 }).success).toBe(false);
  });

  it("8.29 the report subpath exports the same schemas", () => {
    expect(reportSubpath.verdictSchema).toBe(verdictSchema);
    expect(reportSubpath.historyRecordSchema).toBe(historyRecordSchema);
    expect(reportSubpath.runMetadataSchema).toBe(runMetadataSchema);
  });
});
