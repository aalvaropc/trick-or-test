import { describe, expect, it } from "vitest";
import { historyRecordSchema, runMetadataSchema, runScopeSchema } from "../../src/core/report.js";
import * as reportSubpath from "../../src/report/index.js";

const metadata = (): Record<string, unknown> => ({
  gitCommit: "abc123",
  seed: 1,
  engineVersion: "0.0.0",
  nodeVersion: "v26.0.0",
  strykerVersion: "1.0.0",
  vitestVersion: "1.0.0",
  typescriptVersion: "7.0.0",
  timestamp: "2025-01-01T00:00:00.000Z",
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

const record = (): Record<string, unknown> => ({
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

describe("run scope schema", () => {
  it("8.29 run metadata without scope parses and the scope stays absent (a full run)", () => {
    const parsed = runMetadataSchema.safeParse(metadata());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scope).toBeUndefined();
  });

  it("8.29 a history record without scope parses and the scope stays absent (a full run)", () => {
    const parsed = historyRecordSchema.safeParse(record());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scope).toBeUndefined();
  });

  it.each(["full", "spec-only"])("8.28 run metadata with scope %s parses and keeps it", (scope) => {
    const parsed = runMetadataSchema.safeParse({ ...metadata(), scope });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scope).toBe(scope);
  });

  it.each(["full", "spec-only"])(
    "8.28 a history record with scope %s parses and keeps it",
    (scope) => {
      const parsed = historyRecordSchema.safeParse({ ...record(), scope });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.scope).toBe(scope);
    },
  );

  it.each(["spec_only", "Full", "", "mechanical", 1, null])(
    "8.28 run metadata with scope %j is rejected",
    (scope) => {
      expect(runMetadataSchema.safeParse({ ...metadata(), scope }).success).toBe(false);
    },
  );

  it.each(["spec_only", "Full", "", "mechanical", 1, null])(
    "8.28 a history record with scope %j is rejected",
    (scope) => {
      expect(historyRecordSchema.safeParse({ ...record(), scope }).success).toBe(false);
    },
  );

  it("8.28 the enum has exactly full and spec-only", () => {
    expect(runScopeSchema.options).toEqual(["full", "spec-only"]);
  });

  it("8.29 an unknown key in run metadata is still rejected", () => {
    expect(runMetadataSchema.safeParse({ ...metadata(), scope: "full", extra: 1 }).success).toBe(
      false,
    );
  });

  it("8.29 an unknown key in a history record is still rejected", () => {
    expect(historyRecordSchema.safeParse({ ...record(), scope: "full", extra: 1 }).success).toBe(
      false,
    );
  });

  it("8.28 the report subpath exports the scope schema", () => {
    expect(reportSubpath.runScopeSchema).toBe(runScopeSchema);
  });
});
