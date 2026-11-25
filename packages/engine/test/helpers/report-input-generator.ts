import fc from "fast-check";
import type { ReportInput, ReportMutantInput } from "../../src/core/report.js";
import type { CriterionId, MutantId, MutantStatus, TestId } from "../../src/core/types.js";

export const ALL_STATUSES: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];

const FILES = ["src/a.ts", "src/b.ts", "src/c/d.ts"];

const mutantArb = (index: number, kind: "mech" | "spec") =>
  fc
    .record({
      file: fc.constantFrom(...FILES),
      col: fc.integer({ min: 1, max: 80 }),
      width: fc.integer({ min: 0, max: 20 }),
      replacement: fc.string({ maxLength: 12 }),
      status: fc.constantFrom(...ALL_STATUSES),
      description: fc.option(fc.string({ maxLength: 16 }), { nil: undefined }),
      killedBy: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 3 }), {
        nil: undefined,
      }),
      durationMs: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined }),
      n: fc.integer({ min: 1, max: 9 }),
      k: fc.integer({ min: 1, max: 9 }),
    })
    .map((r) => {
      // The index is the line, so no two mutants make the same change and none is deduplicated.
      const line = index + 1;
      const base: ReportMutantInput = {
        id: `${kind}-${index}` as MutantId,
        file: r.file,
        location: {
          start: { line, column: r.col },
          end: { line, column: r.col + r.width },
        },
        replacement: r.replacement,
        status: r.status,
        ...(r.description === undefined ? {} : { description: r.description }),
        ...(r.killedBy === undefined ? {} : { killedBy: r.killedBy as TestId[] }),
        ...(r.durationMs === undefined ? {} : { durationMs: r.durationMs }),
      };
      return { ...base, requirement: `${r.n}.${r.k}` as CriterionId };
    });

/** A report input with unique mechanical and spec mutants spread over a few files. */
export const reportInputArb: fc.Arbitrary<ReportInput> = fc
  .record({ mech: fc.integer({ min: 0, max: 8 }), spec: fc.integer({ min: 0, max: 8 }) })
  .chain(({ mech, spec }) =>
    fc.record({
      mechanical: fc.tuple(...Array.from({ length: mech }, (_, i) => mutantArb(i, "mech"))),
      spec: fc.tuple(...Array.from({ length: spec }, (_, i) => mutantArb(mech + i, "spec"))),
      source: fc.string({ maxLength: 30 }),
    }),
  )
  .map(({ mechanical, spec, source }) => ({
    files: Object.fromEntries(FILES.map((f) => [f, { language: "typescript", source }])),
    mechanical: mechanical.map(({ requirement: _requirement, ...m }) => m),
    spec,
    projectRoot: "/proj",
  }));
