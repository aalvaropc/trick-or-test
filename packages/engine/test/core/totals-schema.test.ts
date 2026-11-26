import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mutantCountsSchema,
  statusCountsSchema,
  strykerCountsSchema,
  verdictSchema,
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

const statusCounts = (): Record<string, number> => ({
  Killed: 3,
  Survived: 1,
  Timeout: 0,
  Ghost: 0,
  InvalidWitness: 0,
  CompileError: 0,
  NotApplicable: 0,
});

const baseVerdict = (): Record<string, unknown> => ({
  coverage: [],
  mutants: [],
  witnesses: {},
  ignoreStaticRetried: false,
  metadata,
});

const fullMutantCounts = (): Record<string, unknown> => ({
  spec: statusCounts(),
  mechanical: statusCounts(),
  twinsMerged: 1,
});

const strykerCounts = (): Record<string, unknown> => ({ detected: 5, undetected: 2, total: 9 });

describe("verdict totals schema", () => {
  it("8.29 a verdict without mutantCounts and strykerCounts parses", () => {
    expect(verdictSchema.safeParse(baseVerdict()).success).toBe(true);
  });

  it("8.22 8.23 a verdict with both fields parses and keeps them", () => {
    const parsed = verdictSchema.safeParse({
      ...baseVerdict(),
      mutantCounts: fullMutantCounts(),
      strykerCounts: strykerCounts(),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.mutantCounts?.twinsMerged).toBe(1);
      expect(parsed.data.strykerCounts).toEqual({ detected: 5, undetected: 2, total: 9 });
    }
  });

  it("8.22 a mutantCounts without mechanical parses", () => {
    const parsed = verdictSchema.safeParse({
      ...baseVerdict(),
      mutantCounts: { spec: statusCounts(), twinsMerged: 0 },
    });
    expect(parsed.success).toBe(true);
  });

  it("8.22 a missing status key in spec is rejected", () => {
    const { Ghost: _ghost, ...spec } = statusCounts();
    expect(
      verdictSchema.safeParse({
        ...baseVerdict(),
        mutantCounts: { spec, twinsMerged: 0 },
      }).success,
    ).toBe(false);
  });

  it("8.22 an unknown key in a status count object is rejected", () => {
    expect(statusCountsSchema.safeParse({ ...statusCounts(), Extra: 1 }).success).toBe(false);
  });

  it("8.22 an unknown key in mutantCounts is rejected", () => {
    expect(mutantCountsSchema.safeParse({ ...fullMutantCounts(), extra: 1 }).success).toBe(false);
  });

  it("8.23 an unknown key in strykerCounts is rejected", () => {
    expect(strykerCountsSchema.safeParse({ ...strykerCounts(), extra: 1 }).success).toBe(false);
  });

  it.each([-1, 1.5])("8.22 a status count of %s is rejected", (bad) => {
    expect(statusCountsSchema.safeParse({ ...statusCounts(), Killed: bad }).success).toBe(false);
  });

  it.each([-1, 0.5])("8.22 a twinsMerged of %s is rejected", (bad) => {
    expect(mutantCountsSchema.safeParse({ ...fullMutantCounts(), twinsMerged: bad }).success).toBe(
      false,
    );
  });

  it.each(["detected", "undetected", "total"])("8.23 a negative %s is rejected", (key) => {
    expect(strykerCountsSchema.safeParse({ ...strykerCounts(), [key]: -1 }).success).toBe(false);
  });

  it.each(["detected", "undetected", "total"])("8.23 a fractional %s is rejected", (key) => {
    expect(strykerCountsSchema.safeParse({ ...strykerCounts(), [key]: 1.5 }).success).toBe(false);
  });

  it("8.24 the documentation of strykerCounts.total says Twins are included and total is not the files count", () => {
    const text = strykerCountsSchema.shape.total.description ?? "";
    expect(text).toContain("Twins included");
    expect(text).toContain("detected + undetected");
  });

  it("8.24 the documentation of mutantCounts.twinsMerged says Twins are in no file", () => {
    const text = mutantCountsSchema.shape.twinsMerged.description ?? "";
    expect(text).toContain("Twins");
    expect(text).toContain("strykerCounts.total");
  });

  it("8.22 8.23 the report subpath exports the three schemas", () => {
    expect(reportSubpath.statusCountsSchema).toBe(statusCountsSchema);
    expect(reportSubpath.mutantCountsSchema).toBe(mutantCountsSchema);
    expect(reportSubpath.strykerCountsSchema).toBe(strykerCountsSchema);
  });

  it("10.4 the report subpath index has no node: import", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "../../src/report/index.ts"), "utf8");
    expect(source).not.toMatch(/["']node:/);
  });
});
