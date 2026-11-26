// Property 29: One set of mutant ids and agreeing totals. Validates: Requirements 8.15, 8.21, 8.22, 8.28, 9.18
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildHistoryRecord,
  buildMutationReport,
  buildVerdict,
  type MutantChange,
  type ReportMutantInput,
  type SpecReportMutantInput,
} from "../../src/core/report.js";
import { dropTwins, type ReportableMutant } from "../../src/core/twins.js";
import type {
  CriterionId,
  EngineConfig,
  MutantId,
  MutantResult,
  MutantStatus,
  RunMetadata,
  RunScope,
} from "../../src/core/types.js";

const ROOT = "/proj";
const FILE = "src/a.ts";

const STATUSES: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];

const metadata: RunMetadata = {
  gitCommit: "abc123",
  seed: 42,
  engineVersion: "0.1.0",
  nodeVersion: "22.0.0",
  strykerVersion: "9.0.0",
  vitestVersion: "3.0.0",
  typescriptVersion: "5.6.0",
  timestamp: "2025-01-01T00:00:00.000Z",
};

const config: EngineConfig = {
  specDir: "specs",
  sourceGlobs: ["src/**/*.ts"],
  testGlobs: ["test/**/*.test.ts"],
  propertyTestGlobs: ["test/**/*.property.test.ts"],
  mutantsDir: "mutants",
  outputDir: ".trickortest",
};

type Raw = {
  id: string;
  kind: "spec" | "mechanical";
  status: MutantStatus;
  line: number;
  replacement: string;
  twin: boolean;
};

const at = (line: number) => ({
  start: { line, column: 1 },
  end: { line, column: 5 },
});

const statusArb = fc.constantFrom(...STATUSES);

// Each slot owns one line, so only the intended pairs make the same change.
const slotArb = fc.record({
  spec: fc.option(statusArb, { nil: undefined }),
  twin: fc.option(statusArb, { nil: undefined }),
  mech: fc.option(statusArb, { nil: undefined }),
  order: fc.nat(1000),
  order2: fc.nat(1000),
});

const rawArb = (scope: RunScope): fc.Arbitrary<Raw[]> =>
  fc.array(slotArb, { maxLength: 12 }).map((slots) => {
    const raw: (Raw & { order: number })[] = [];
    for (const [i, s] of slots.entries()) {
      const line = i + 1;
      if (s.spec !== undefined) {
        raw.push({
          id: `oath-1.1-s${i}`,
          kind: "spec",
          status: s.spec,
          line,
          replacement: `r${i}`,
          twin: false,
          order: s.order,
        });
      }
      if (scope === "spec-only") continue;
      if (s.spec !== undefined && s.twin !== undefined) {
        raw.push({
          id: `twin-${i}`,
          kind: "mechanical",
          status: s.twin,
          line,
          replacement: `r${i}`,
          twin: true,
          order: s.order2,
        });
      }
      if (s.mech !== undefined) {
        raw.push({
          id: `mech-${i}`,
          kind: "mechanical",
          status: s.mech,
          line,
          replacement: `other${i}`,
          twin: false,
          order: s.order2 + 7,
        });
      }
    }
    // The shuffled order comes from the generated keys. `sort` is stable.
    return raw.sort((a, b) => a.order - b.order);
  });

const build = (raw: Raw[], scope: RunScope) => {
  const mechanical: ReportMutantInput[] = raw
    .filter((r) => r.kind === "mechanical")
    .map((r) => ({
      id: r.id as MutantId,
      file: FILE,
      location: at(r.line),
      replacement: r.replacement,
      status: r.status,
    }));
  const spec: SpecReportMutantInput[] = raw
    .filter((r) => r.kind === "spec")
    .map((r) => ({
      id: r.id as MutantId,
      file: FILE,
      location: at(r.line),
      replacement: r.replacement,
      status: r.status,
      requirement: "1.1" as CriterionId,
    }));
  const report = buildMutationReport({
    files: { [FILE]: { language: "typescript", source: "" } },
    mechanical,
    spec,
    projectRoot: ROOT,
  });
  const results: MutantResult[] = raw.map((r) => ({
    id: r.id as MutantId,
    species: r.kind === "spec" ? "Oathbreaker" : "Borderling",
    status: r.status,
    ...(r.kind === "spec" ? { requirement: "1.1" as CriterionId } : {}),
    killingTests: [],
    ...(r.status === "Killed" ? { killClass: "both" as const } : {}),
  }));
  const changes: Record<MutantId, MutantChange> = Object.fromEntries(
    raw.map((r) => [
      r.id as MutantId,
      { file: FILE, location: at(r.line), replacement: r.replacement },
    ]),
  );
  const verdictResult = buildVerdict({
    coverage: [],
    mutants: results,
    witnesses: {},
    ignoreStaticRetried: false,
    metadata,
    projectRoot: ROOT,
    changes,
    scope,
  });
  if (!verdictResult.ok) throw new Error(verdictResult.error);
  const historyResult = buildHistoryRecord(verdictResult.value, undefined, config, ROOT, changes);
  if (!historyResult.ok) throw new Error(historyResult.error);
  return { report, verdict: verdictResult.value, history: historyResult.value };
};

const sorted = (ids: string[]): string[] => [...ids].sort();
const sum = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((a, b) => a + b, 0);

describe("Property 29: One set of mutant ids and agreeing totals", () => {
  it("8.21 the report, the verdict and the history list the same ids and no Twin id", () => {
    fc.assert(
      fc.property(rawArb("full"), (raw) => {
        const { report, verdict, history } = build(raw, "full");
        const expected = sorted(raw.filter((r) => !r.twin).map((r) => r.id));
        const inReport = Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.id));
        expect(sorted(inReport)).toEqual(expected);
        expect(sorted(verdict.mutants.map((m) => m.id))).toEqual(expected);
        expect(sorted(history.mutants.map((m) => m.id))).toEqual(expected);
      }),
    );
  });

  it("8.22 the verdict counts equal the listed mutants per kind and status, and twinsMerged equals the dropped Twins", () => {
    fc.assert(
      fc.property(rawArb("full"), (raw) => {
        const { verdict } = build(raw, "full");
        const listed = raw.filter((r) => !r.twin);
        const specListed = listed.filter((r) => r.kind === "spec");
        const mechListed = listed.filter((r) => r.kind === "mechanical");
        const counts = verdict.mutantCounts;
        expect(counts).toBeDefined();
        expect(counts?.twinsMerged).toBe(raw.filter((r) => r.twin).length);
        expect(sum(counts?.spec ?? {})).toBe(specListed.length);
        expect(sum(counts?.mechanical ?? {})).toBe(mechListed.length);
        for (const status of STATUSES) {
          expect(counts?.spec[status]).toBe(specListed.filter((r) => r.status === status).length);
          expect(counts?.mechanical?.[status]).toBe(
            mechListed.filter((r) => r.status === status).length,
          );
        }
      }),
    );
  });

  it("8.28 a spec-only input has no mechanical counts, no strykerCounts and no stray, and the three outputs agree", () => {
    fc.assert(
      fc.property(rawArb("spec-only"), (raw) => {
        const { report, verdict, history } = build(raw, "spec-only");
        expect(verdict.mutantCounts).toBeDefined();
        expect(verdict.mutantCounts?.mechanical).toBeUndefined();
        expect(verdict.strykerCounts).toBeUndefined();
        expect(verdict.mutantCounts?.twinsMerged).toBe(0);
        expect(verdict.mutants.every((m) => m.species === "Oathbreaker")).toBe(true);
        expect(sum(verdict.mutantCounts?.spec ?? {})).toBe(raw.length);
        const expected = sorted(raw.map((r) => r.id));
        const inReport = Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.id));
        expect(sorted(inReport)).toEqual(expected);
        expect(sorted(verdict.mutants.map((m) => m.id))).toEqual(expected);
        expect(sorted(history.mutants.map((m) => m.id))).toEqual(expected);
      }),
    );
  });

  it("8.15 dropTwins keeps every Spec_Mutant and every Mechanical_Mutant that differs in one field, whatever the ids", () => {
    const VARIATIONS = [
      "file",
      "startLine",
      "startColumn",
      "endLine",
      "endColumn",
      "replacement",
    ] as const;
    const vary = (m: ReportableMutant, how: (typeof VARIATIONS)[number]): ReportableMutant => {
      const { start, end } = m.location;
      switch (how) {
        case "file":
          return { ...m, file: `${m.file}x` };
        case "startLine":
          return { ...m, location: { start: { ...start, line: start.line + 1 }, end } };
        case "startColumn":
          return { ...m, location: { start: { ...start, column: start.column + 1 }, end } };
        case "endLine":
          return { ...m, location: { start, end: { ...end, line: end.line + 1 } } };
        case "endColumn":
          return { ...m, location: { start, end: { ...end, column: end.column + 1 } } };
        case "replacement":
          return { ...m, replacement: `${m.replacement}x` };
      }
    };
    const baseArb = fc.record({
      file: fc.constantFrom("src/a.ts", "src/b.ts"),
      line: fc.integer({ min: 1, max: 30 }),
      column: fc.integer({ min: 1, max: 30 }),
      replacement: fc.string({ maxLength: 5 }),
      how: fc.constantFrom(...VARIATIONS),
      ids: fc.tuple(fc.string(), fc.string(), fc.string(), fc.string()),
    });
    fc.assert(
      fc.property(baseArb, ({ file, line, column, replacement, how, ids }) => {
        const specBase: ReportableMutant = {
          kind: "spec",
          file,
          location: { start: { line, column }, end: { line: line + 1, column: column + 1 } },
          replacement,
        };
        const twin: ReportableMutant = { ...specBase, kind: "mechanical" };
        const different: ReportableMutant = { ...vary(specBase, how), kind: "mechanical" };
        const withIds = (a: string, b: string, c: string) => [
          { ...specBase, id: a },
          { ...twin, id: b },
          { ...different, id: c },
        ];
        const first = dropTwins(withIds(ids[0], ids[1], ids[2]));
        const second = dropTwins(withIds(ids[3], ids[3], ids[0]));
        expect(first.twinsMerged).toBe(1);
        expect(first.kept.map((m) => m.kind)).toEqual(["spec", "mechanical"]);
        expect(first.kept[1]?.id).toBe(ids[2]);
        expect(second.twinsMerged).toBe(1);
        expect(second.kept.map((m) => m.kind)).toEqual(["spec", "mechanical"]);
        expect(second.kept[1]?.id).toBe(ids[0]);
      }),
    );
  });
});
