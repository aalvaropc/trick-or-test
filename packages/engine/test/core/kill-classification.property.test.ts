// Property 5: Attribution partition. Validates: Requirements 6.6, 6.7, 6.8, 6.9, 6.10
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ClassifiedTest } from "../../src/core/kill-classification.js";
import { computeKillClass } from "../../src/core/kill-classification.js";
import type { KillClass, MutantStatus } from "../../src/core/types.js";

const KILL_CLASSES: KillClass[] = ["examples-only", "properties-only", "both", "unattributed"];

type GeneratedMutant = { status: MutantStatus; killingTests: ClassifiedTest[] };

/** Kill class as the engine assigns it: only Killed mutants get one (6.10). */
const attribute = (m: GeneratedMutant): KillClass | undefined =>
  m.status === "Killed" ? computeKillClass(m.killingTests) : undefined;

const testArb: fc.Arbitrary<ClassifiedTest> = fc.record({
  kind: fc.constantFrom("example" as const, "property" as const),
});

const killedArb: fc.Arbitrary<GeneratedMutant> = fc.record({
  status: fc.constant<MutantStatus>("Killed"),
  killingTests: fc.array(testArb, { maxLength: 6 }),
});

const timeoutArb: fc.Arbitrary<GeneratedMutant> = fc.record({
  status: fc.constant<MutantStatus>("Timeout"),
  killingTests: fc.constant<ClassifiedTest[]>([]),
});

const otherArb: fc.Arbitrary<GeneratedMutant> = fc.record({
  status: fc.constantFrom<MutantStatus>(
    "Survived",
    "Ghost",
    "InvalidWitness",
    "CompileError",
    "NotApplicable",
  ),
  killingTests: fc.array(testArb, { maxLength: 3 }),
});

const mutantsArb = fc.array(fc.oneof(killedArb, timeoutArb, otherArb), { maxLength: 30 });

describe("kill-classification property", () => {
  it("6.6-6.9 each Killed mutant gets exactly one kill class and the four counts sum to the Killed total", () => {
    fc.assert(
      fc.property(mutantsArb, (mutants) => {
        const counts: Record<KillClass, number> = {
          "examples-only": 0,
          "properties-only": 0,
          both: 0,
          unattributed: 0,
        };
        for (const m of mutants) {
          const kc = attribute(m);
          if (m.status !== "Killed") continue;
          expect(kc).toBeDefined();
          expect(KILL_CLASSES).toContain(kc);
          counts[kc as KillClass] += 1;
        }
        const killed = mutants.filter((m) => m.status === "Killed").length;
        const sum = KILL_CLASSES.reduce((acc, k) => acc + counts[k], 0);
        expect(sum).toBe(killed);
      }),
    );
  });

  it("6.6-6.9 the kill class matches the kinds of the killing tests", () => {
    fc.assert(
      fc.property(fc.array(testArb, { maxLength: 8 }), (tests) => {
        const hasExample = tests.some((t) => t.kind === "example");
        const hasProperty = tests.some((t) => t.kind === "property");
        const expected: KillClass =
          hasExample && hasProperty
            ? "both"
            : hasExample
              ? "examples-only"
              : hasProperty
                ? "properties-only"
                : "unattributed";
        expect(computeKillClass(tests)).toBe(expected);
      }),
    );
  });

  it("6.10 a Timeout mutant gets no kill class and is not counted in the sum", () => {
    fc.assert(
      fc.property(mutantsArb, (mutants) => {
        const timeouts = mutants.filter((m) => m.status === "Timeout");
        for (const m of timeouts) expect(attribute(m)).toBeUndefined();

        const assigned = mutants.filter((m) => attribute(m) !== undefined);
        const killed = mutants.filter((m) => m.status === "Killed");
        expect(assigned.length).toBe(killed.length);
        expect(assigned.some((m) => m.status === "Timeout")).toBe(false);
      }),
    );
  });
});
