import { describe, expect, it } from "vitest";
import { buildMutationReport, type ReportMutantInput } from "../../src/core/report.js";
import type { CriterionId, MutantId } from "../../src/core/types.js";

const mech = (over: Partial<ReportMutantInput> = {}): ReportMutantInput => ({
  id: "m1" as MutantId,
  file: "src/a.ts",
  location: { start: { line: 3, column: 5 }, end: { line: 4, column: 9 } },
  replacement: "x",
  status: "Survived",
  ...over,
});

const build = (
  mechanical: ReportMutantInput[],
  spec: Array<ReportMutantInput & { requirement: CriterionId }> = [],
) =>
  Object.values(
    buildMutationReport({
      projectRoot: "/proj",
      files: { "src/a.ts": { language: "typescript", source: "a" } },
      mechanical,
      spec,
    }).files,
  ).flatMap((f) => f.mutants);

describe("report location", () => {
  it("3.16 writes the start and end line and column of a Mechanical_Mutant into the report", () => {
    const [m] = build([mech()]);
    expect(m?.location).toEqual({
      start: { line: 3, column: 5 },
      end: { line: 4, column: 9 },
    });
  });

  it("8.15 gives one mutant, the Spec_Mutant, when start and end location and replacement are equal", () => {
    const r = build(
      [mech()],
      [{ ...mech({ id: "oath-2.1-s" as MutantId }), requirement: "2.1" as CriterionId }],
    );
    expect(r.map((m) => m.id)).toEqual(["oath-2.1-s"]);
  });

  it("8.15 gives two mutants when the pair differs only in the end column", () => {
    const other = { start: { line: 3, column: 5 }, end: { line: 4, column: 10 } };
    const r = build(
      [mech()],
      [
        {
          ...mech({ id: "oath-2.1-s" as MutantId, location: other }),
          requirement: "2.1" as CriterionId,
        },
      ],
    );
    expect(r).toHaveLength(2);
  });
});
