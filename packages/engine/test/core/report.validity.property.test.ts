// Property 7: Report validity. Validates: Requirements 8.1, 8.2, 8.3, 8.4
import { Ajv } from "ajv";
import fc from "fast-check";
import { schema } from "mutation-testing-report-schema";
import { describe, expect, it } from "vitest";
import { buildMutationReport } from "../../src/core/report.js";
import type { MutantStatus } from "../../src/core/types.js";
import { reportInputArb } from "../helpers/report-input-generator.js";

const validate = new Ajv({ strict: false }).compile(schema);
const IGNORED = new Set<MutantStatus>(["Ghost", "InvalidWitness", "NotApplicable"]);

describe("Property 7: Report validity", () => {
  it("8.1 every built report validates against mutation-testing-report-schema", () => {
    fc.assert(
      fc.property(reportInputArb, (input) => {
        const ok = validate(buildMutationReport(input));
        expect(validate.errors ?? []).toEqual([]);
        expect(ok).toBe(true);
      }),
    );
  });

  it("8.1 parsing the written report back equals the built report", () => {
    fc.assert(
      fc.property(reportInputArb, (input) => {
        const report = buildMutationReport(input);
        expect(JSON.parse(JSON.stringify(report))).toEqual(report);
      }),
    );
  });

  it("8.2 the report contains every mechanical and spec mutant", () => {
    fc.assert(
      fc.property(reportInputArb, (input) => {
        const report = buildMutationReport(input);
        const ids = Object.values(report.files)
          .flatMap((f) => f.mutants)
          .map((m) => m.id)
          .sort();
        const expected = [...input.mechanical, ...input.spec].map((m) => m.id as string).sort();
        expect(ids).toEqual(expected);
      }),
    );
  });

  it("8.3 8.4 every engine status maps to the specified schema status", () => {
    fc.assert(
      fc.property(reportInputArb, (input) => {
        const report = buildMutationReport(input);
        const byId = new Map(
          Object.values(report.files).flatMap((f) => f.mutants.map((m) => [m.id, m] as const)),
        );
        for (const m of [...input.mechanical, ...input.spec]) {
          const out = byId.get(m.id);
          expect(out).toBeDefined();
          if (IGNORED.has(m.status)) {
            expect(out?.status).toBe("Ignored");
            expect(out?.statusReason).toContain(m.status);
          } else {
            expect(out?.status).toBe(m.status);
            expect(out?.statusReason).toBeUndefined();
          }
        }
      }),
    );
  });
});
