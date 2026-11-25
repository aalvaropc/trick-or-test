import { Ajv } from "ajv";
import { schema } from "mutation-testing-report-schema";
import { describe, expect, it } from "vitest";
import {
  buildMutationReport,
  mutationReportSchema,
  type ReportInput,
  type ReportMutantInput,
  type SpecReportMutantInput,
} from "../../src/core/report.js";
import type { CriterionId, MutantId, MutantStatus, TestId } from "../../src/core/types.js";

const loc = (line: number, col = 1) => ({
  start: { line, column: col },
  end: { line, column: col + 3 },
});

const mech = (
  id: string,
  status: MutantStatus,
  over: Partial<ReportMutantInput> = {},
): ReportMutantInput => ({
  id: id as MutantId,
  file: "src/a.ts",
  location: loc(1),
  replacement: "x",
  status,
  mutatorName: "ArithmeticOperator",
  ...over,
});

const spec = (
  id: string,
  status: MutantStatus,
  over: Partial<SpecReportMutantInput> = {},
): SpecReportMutantInput => ({
  ...mech(id, status, over),
  requirement: "2.1" as CriterionId,
  ...over,
});

const build = (mechanical: ReportInput["mechanical"], specs: ReportInput["spec"] = []) =>
  buildMutationReport({
    files: { "src/a.ts": { language: "typescript", source: "a + b" } },
    mechanical,
    spec: specs,
  });

const all = (r: ReturnType<typeof build>) => Object.values(r.files).flatMap((f) => f.mutants);

describe("buildMutationReport", () => {
  it.each(["Ghost", "InvalidWitness", "NotApplicable"] as const)(
    "8.3 maps %s to Ignored with a statusReason naming the engine status",
    (status) => {
      const [m] = all(build([mech("m1", status)]));
      expect(m?.status).toBe("Ignored");
      expect(m?.statusReason).toContain(status);
    },
  );

  it("8.4 maps CompileError to CompileError", () => {
    const [m] = all(build([mech("m1", "CompileError")]));
    expect(m?.status).toBe("CompileError");
    expect(m?.statusReason).toBeUndefined();
  });

  it("8.4 maps Timeout to Timeout", () => {
    const [m] = all(build([mech("m1", "Timeout")]));
    expect(m?.status).toBe("Timeout");
  });

  it("8.1 keeps Killed and Survived unchanged", () => {
    const r = all(
      build([
        mech("m1", "Killed", { killedBy: ["t" as TestId] }),
        mech("m2", "Survived", { location: loc(2) }),
      ]),
    );
    expect(r.map((m) => m.status)).toEqual(["Killed", "Survived"]);
    expect(r[0]?.killedBy).toEqual(["t"]);
  });

  it("8.2 includes both Mechanical_Mutants and Spec_Mutants", () => {
    const r = all(
      build([mech("hash1", "Killed")], [spec("oath-2.1-x", "Survived", { location: loc(5) })]),
    );
    expect(r.map((m) => m.id).sort()).toEqual(["hash1", "oath-2.1-x"]);
  });

  it("8.14 assigns Oathbreaker to every Spec_Mutant and not to mechanical ones", () => {
    const r = all(
      build(
        [mech("hash1", "Killed")],
        [
          spec("oath-2.1-x", "Survived", { location: loc(5) }),
          spec("oath-2.1-y", "Killed", { location: loc(6) }),
        ],
      ),
    );
    expect(r.filter((m) => m.species === "Oathbreaker").map((m) => m.id)).toEqual([
      "oath-2.1-x",
      "oath-2.1-y",
    ]);
    expect(r.find((m) => m.id === "hash1")?.species).toBeUndefined();
  });

  it("8.15 keeps only the Spec_Mutant when ids differ but file, span and replacement match", () => {
    const r = all(build([mech("deadbeef", "Survived")], [spec("oath-2.1-same", "Killed")]));
    expect(r).toHaveLength(1);
    expect(r[0]?.id).toBe("oath-2.1-same");
    expect(r[0]?.requirement).toBe("2.1");
    expect(r[0]?.species).toBe("Oathbreaker");
  });

  it("8.15 keeps both mutants when the replacement differs", () => {
    const r = all(
      build([mech("m1", "Survived", { replacement: "y" })], [spec("oath-2.1-s", "Killed")]),
    );
    expect(r).toHaveLength(2);
  });

  it("8.15 keeps both mutants when the span differs", () => {
    const r = all(
      build([mech("m1", "Survived", { location: loc(1, 2) })], [spec("oath-2.1-s", "Killed")]),
    );
    expect(r).toHaveLength(2);
  });

  it("8.15 keeps both mutants when the file differs", () => {
    const r = all(
      build([mech("m1", "Survived", { file: "src/b.ts" })], [spec("oath-2.1-s", "Killed")]),
    );
    expect(r).toHaveLength(2);
  });

  it.each([true, false])("3.5 records ignoreStaticRetried=%s in the report config", (retried) => {
    const report = buildMutationReport({
      files: { "src/a.ts": { language: "typescript", source: "a + b" } },
      mechanical: [mech("m1", "Killed")],
      spec: [],
      ignoreStaticRetried: retried,
    });
    expect(report.config).toEqual({ ignoreStaticRetried: retried });
    const validate = new Ajv({ strict: false }).compile(schema);
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  });

  it("3.5 records no retry when the flag is not given", () => {
    expect(build([mech("m1", "Killed")]).config).toEqual({ ignoreStaticRetried: false });
  });

  it("8.1 validates one built report against mutation-testing-report-schema", () => {
    const report = build(
      [
        mech("h1", "Killed", { killedBy: ["t1" as TestId], location: loc(1) }),
        mech("h2", "Ghost", { location: loc(2) }),
        mech("h3", "Timeout", { location: loc(3) }),
        mech("h4", "CompileError", { location: loc(4) }),
      ],
      [
        spec("oath-2.1-a", "Survived", { location: loc(5) }),
        spec("oath-2.1-b", "InvalidWitness", { location: loc(6) }),
      ],
    );
    const validate = new Ajv({ strict: false }).compile(schema);
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    expect(mutationReportSchema.parse(report)).toEqual(report);
  });
});
