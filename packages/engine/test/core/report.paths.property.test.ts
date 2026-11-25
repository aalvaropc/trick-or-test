// Property 20: No absolute path in any report field. Validates: Requirements 8.17
import { posix } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { containsAbsolutePath, relativizePath } from "../../src/core/paths.js";
import {
  buildHistoryRecord,
  buildMutationReport,
  buildVerdict,
  type ReportMutantInput,
} from "../../src/core/report.js";
import type {
  CriterionId,
  EngineConfig,
  MutantId,
  MutantResult,
  MutantStatus,
  TestId,
  Witness,
} from "../../src/core/types.js";

const STATUSES: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];

const segment = fc.stringMatching(/^[a-z][a-z0-9_-]{0,7}$/);
const word = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,8}$/);

const rootArb = fc.array(segment, { minLength: 1, maxLength: 3 }).map((s) => `/${s.join("/")}`);

type Scenario = { root: string; under: string[]; outside: string[] };

const scenarioArb: fc.Arbitrary<Scenario> = rootArb.chain((root) =>
  fc.record({
    root: fc.constant(root),
    under: fc.array(
      fc
        .tuple(fc.array(segment, { minLength: 1, maxLength: 3 }), segment)
        .map(([dirs, name]) => `${root}/${dirs.join("/")}/${name}.ts`),
      { minLength: 1, maxLength: 3 },
    ),
    outside: fc.array(
      fc.oneof(
        fc
          .tuple(fc.array(segment, { minLength: 1, maxLength: 3 }), segment)
          .map(([dirs, name]) => `/outside-${dirs.join("/")}/${name}.ts`),
        fc.tuple(segment, segment).map(([d, n]) => `C:\\${d}\\${n}.ts`),
        fc.tuple(segment, segment, segment).map(([h, s, n]) => `\\\\${h}\\${s}\\${n}.ts`),
      ),
      { minLength: 1, maxLength: 3 },
    ),
  }),
);

// A free-text field that holds one absolute path, or is a bare path.
const textWith = (paths: string[]): fc.Arbitrary<string> =>
  fc
    .tuple(word, fc.constantFrom(...paths), word, fc.constantFrom("", ".", " done"))
    .map(([a, p, b, tail]) => `${a} ${p} ${b}${tail}`);

const bareOrText = (paths: string[]): fc.Arbitrary<string> =>
  fc.oneof(fc.constantFrom(...paths), textWith(paths));

type Run = {
  scenario: Scenario;
  verdictMutants: MutantResult[];
  witnesses: Record<MutantId, Witness>;
  skipReasons: string[];
  mechanical: ReportMutantInput[];
  spec: (ReportMutantInput & { requirement: CriterionId })[];
  config: EngineConfig;
};

const location = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 2 },
};

const runArb: fc.Arbitrary<Run> = scenarioArb.chain((scenario) => {
  const all = [...scenario.under, ...scenario.outside];
  const text = bareOrText(all);
  const path = fc.constantFrom(...all);
  const status = fc.constantFrom(...STATUSES);
  const id = (prefix: string, n: number): MutantId => `${prefix}-${n}` as MutantId;

  const mutantInput = fc.record({
    file: path,
    status,
    mutatorName: text,
    description: text,
    killedBy: fc.array(
      text.map((t) => t as TestId),
      { maxLength: 2 },
    ),
    coveredBy: fc.array(
      text.map((t) => t as TestId),
      { maxLength: 2 },
    ),
  });

  const witnessArb: fc.Arbitrary<Witness> = fc.oneof(
    fc.record({
      from: path,
      export: word,
      args: fc.constant([] as unknown[]),
      expected: fc.integer(),
    }),
    fc.record({
      from: path,
      export: word,
      args: fc.constant([] as unknown[]),
      expectedError: text,
    }),
  );

  const invalidArb = fc.record({
    expected: fc.oneof(fc.record({ expected: fc.integer() }), fc.record({ expectedError: text })),
    originalOutcome: fc.oneof(
      fc.record({ kind: fc.constant("timeout" as const), message: text }),
      fc.record({ kind: fc.constant("no-outcome" as const), message: text }),
      fc.record({ kind: fc.constant("error" as const), className: text }),
      fc.record({ kind: fc.constant("value" as const), value: fc.integer() }),
    ),
  });

  return fc.record({
    scenario: fc.constant(scenario),
    verdictMutants: fc
      .array(
        fc.record({
          status,
          killingTests: fc.array(
            text.map((t) => t as TestId),
            { maxLength: 2 },
          ),
          invalidWitness: invalidArb,
        }),
        { maxLength: 4 },
      )
      .map((ms) =>
        ms.map(
          (m, i): MutantResult => ({
            id: id("m", i),
            species: "Oathbreaker",
            status: m.status,
            requirement: "8.17" as CriterionId,
            killingTests: m.killingTests,
            ...(m.status === "InvalidWitness" ? { invalidWitness: m.invalidWitness } : {}),
          }),
        ),
      ),
    witnesses: fc
      .array(witnessArb, { maxLength: 3 })
      .map(
        (ws) => Object.fromEntries(ws.map((w, i) => [id("w", i), w])) as Record<MutantId, Witness>,
      ),
    skipReasons: fc.array(text, { maxLength: 2 }),
    mechanical: fc
      .array(mutantInput, { maxLength: 3 })
      .map((ms) =>
        ms.map(
          (m, i): ReportMutantInput => ({ ...m, id: id("mech", i), location, replacement: "x" }),
        ),
      ),
    spec: fc.array(mutantInput, { maxLength: 3 }).map((ms) =>
      ms.map((m, i) => ({
        ...m,
        id: id("oath", i),
        location: { start: { line: 5, column: 1 }, end: { line: 5, column: 2 } },
        replacement: "y",
        requirement: "8.17" as CriterionId,
      })),
    ),
    config: fc.record({
      specDir: path,
      sourceGlobs: fc.array(path, { maxLength: 2 }),
      testGlobs: fc.array(path, { maxLength: 2 }),
      propertyTestGlobs: fc.array(path, { maxLength: 2 }),
      mutantsDir: path,
      outputDir: path,
    }),
  });
});

const collectStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      collectStrings(v, out);
    }
  }
  return out;
};

describe("Property 20: No absolute path in any report field", () => {
  it("8.17 no string in the report, the verdict or the history record is an absolute path", () => {
    fc.assert(
      fc.property(runArb, (run) => {
        const root = run.scenario.root;
        const files = Object.fromEntries(
          [...run.mechanical, ...run.spec].map((m) => [
            m.file,
            { language: "typescript", source: "const a = 1;" },
          ]),
        );
        const report = buildMutationReport({
          files,
          mechanical: run.mechanical,
          spec: run.spec,
          projectRoot: root,
        });
        const verdictResult = buildVerdict({
          coverage: run.skipReasons.map((reason, i) => ({
            criterion: `8.${i}` as CriterionId,
            status: "skipped" as const,
            reason,
          })),
          mutants: run.verdictMutants,
          witnesses: run.witnesses,
          ignoreStaticRetried: false,
          metadata: {
            gitCommit: "abc",
            seed: 1,
            engineVersion: "1.0.0",
            nodeVersion: "26.0.0",
            strykerVersion: "1.0.0",
            vitestVersion: "1.0.0",
            typescriptVersion: "7.0.0",
            timestamp: "2025-01-01T00:00:00.000Z",
          },
          projectRoot: root,
        });
        expect(verdictResult.ok).toBe(true);
        if (!verdictResult.ok) return;
        const historyResult = buildHistoryRecord(verdictResult.value, undefined, run.config, root);
        expect(historyResult.ok).toBe(true);
        if (!historyResult.ok) return;

        const strings = [
          ...collectStrings(report),
          ...collectStrings(verdictResult.value),
          ...collectStrings(historyResult.value),
        ];
        for (const s of strings) {
          expect(containsAbsolutePath(s), s).toBe(false);
        }
      }),
    );
  });

  it("8.17 a path under the root round-trips through relativizePath", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        for (const p of scenario.under) {
          const rel = relativizePath(scenario.root, p);
          expect(containsAbsolutePath(rel)).toBe(false);
          expect(posix.join(scenario.root, rel)).toBe(p);
        }
      }),
    );
  });
});
