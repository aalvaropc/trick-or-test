import { describe, expect, it } from "vitest";
import {
  buildHistoryRecord,
  buildMutationReport,
  buildVerdict,
  type MutantChange,
  type ReportInput,
  serializeVerdict,
} from "../../src/core/report.js";
import type {
  CriterionId,
  EngineConfig,
  MutantId,
  MutantResult,
  RunMetadata,
  RunScope,
} from "../../src/core/types.js";

const root = "/proj";
const config: EngineConfig = {
  specDir: ".kiro/specs/x",
  sourceGlobs: ["src/**/*.ts"],
  testGlobs: ["test/**/*.test.ts"],
  propertyTestGlobs: ["test/**/*.property.test.ts"],
  mutantsDir: "mutants",
  outputDir: "out",
};
const metadata: RunMetadata = {
  gitCommit: "abc123",
  seed: 1,
  engineVersion: "0.1.0",
  nodeVersion: "22.0.0",
  strykerVersion: "9.0.0",
  vitestVersion: "2.0.0",
  typescriptVersion: "5.0.0",
  timestamp: "2025-01-01T00:00:00.000Z",
};
const specResult: MutantResult = {
  id: "oath-1.1-a" as MutantId,
  species: "Oathbreaker",
  status: "Killed",
  requirement: "1.1" as CriterionId,
  killingTests: [],
};
const strayResult: MutantResult = {
  id: "m1" as MutantId,
  species: "Borderling",
  status: "Survived",
  killingTests: [],
};
const pos = (line: number) => ({ line, column: 1 });
const changes: Record<MutantId, MutantChange> = {
  ["oath-1.1-a" as MutantId]: {
    file: "/proj/src/a.ts",
    location: { start: pos(1), end: pos(2) },
    replacement: "x",
  },
  ["m1" as MutantId]: {
    file: "/proj/src/a.ts",
    location: { start: pos(3), end: pos(4) },
    replacement: "y",
  },
};
const verdictFor = (scope?: RunScope) => {
  const r = buildVerdict({
    coverage: [{ criterion: "1.1" as CriterionId, status: "guarded" }],
    mutants: scope === "spec-only" ? [specResult] : [specResult, strayResult],
    witnesses: {},
    ignoreStaticRetried: false,
    metadata,
    projectRoot: root,
    changes,
    ...(scope === undefined ? {} : { scope }),
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const reportFor = (scope?: RunScope) => {
  const input: ReportInput = {
    files: { "/proj/src/a.ts": { language: "typescript", source: "a\nb\nc\nd\n" } },
    mechanical:
      scope === "spec-only"
        ? []
        : [
            {
              id: "m1" as MutantId,
              file: "/proj/src/a.ts",
              location: { start: pos(3), end: pos(4) },
              replacement: "y",
              status: "Survived",
            },
          ],
    spec: [
      {
        id: "oath-1.1-a" as MutantId,
        file: "/proj/src/a.ts",
        location: { start: pos(1), end: pos(2) },
        replacement: "x",
        status: "Killed",
        requirement: "1.1" as CriterionId,
      },
    ],
    projectRoot: root,
    ...(scope === undefined ? {} : { scope }),
  };
  return buildMutationReport(input);
};
const historyFor = (scope?: RunScope) => {
  const r = buildHistoryRecord(verdictFor(scope), undefined, config, root, changes);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("scope in the builders", () => {
  it("8.28 a spec-only run writes the scope in the three outputs", () => {
    expect(verdictFor("spec-only").metadata.scope).toBe("spec-only");
    expect(historyFor("spec-only").scope).toBe("spec-only");
    expect(reportFor("spec-only").config?.scope).toBe("spec-only");
  });

  it("8.28 a full run writes scope full in the three outputs", () => {
    expect(verdictFor("full").metadata.scope).toBe("full");
    expect(historyFor("full").scope).toBe("full");
    expect(reportFor("full").config?.scope).toBe("full");
  });

  it("8.28 a run without a given scope writes no scope key, which means full", () => {
    expect(Object.hasOwn(verdictFor().metadata, "scope")).toBe(false);
    expect(Object.hasOwn(historyFor(), "scope")).toBe(false);
    expect(Object.hasOwn(reportFor().config ?? {}, "scope")).toBe(false);
  });

  it("8.23 a spec-only verdict has no strykerCounts key and no mechanical key", () => {
    const v = verdictFor("spec-only");
    expect(Object.hasOwn(v, "strykerCounts")).toBe(false);
    expect(v.mutantCounts).toBeDefined();
    expect(Object.hasOwn(v.mutantCounts ?? {}, "mechanical")).toBe(false);
    expect(v.mutants.every((m) => m.species === "Oathbreaker")).toBe(true);
  });

  it("8.22 a full verdict keeps strykerCounts and mechanical counts", () => {
    const v = verdictFor("full");
    expect(Object.hasOwn(v, "strykerCounts")).toBe(true);
    expect(Object.hasOwn(v.mutantCounts ?? {}, "mechanical")).toBe(true);
  });

  it("8.13 a spec-only mutation report holds Spec_Mutants only", () => {
    const report = reportFor("spec-only");
    const all = Object.values(report.files).flatMap((f) => f.mutants);
    expect(all.length).toBe(1);
    expect(all.every((m) => m.species === "Oathbreaker")).toBe(true);
  });

  it("9.18 the output is byte-identical for equal input", () => {
    for (const scope of ["full", "spec-only"] as const) {
      expect(serializeVerdict(verdictFor(scope))).toBe(serializeVerdict(verdictFor(scope)));
      expect(JSON.stringify(reportFor(scope))).toBe(JSON.stringify(reportFor(scope)));
      expect(JSON.stringify(historyFor(scope))).toBe(JSON.stringify(historyFor(scope)));
    }
  });
});
