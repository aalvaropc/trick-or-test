// Property 26: Verdict carries criterion text and mutated outcome. Validates: Requirements 8.12, 8.17, 8.18, 8.19, 8.20
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { containsAbsolutePath } from "../../src/core/paths.js";
import {
  buildVerdict,
  serializeVerdict,
  type VerdictInput,
  verdictSchema,
} from "../../src/core/report.js";
import type {
  CriterionCoverage,
  CriterionId,
  MutantId,
  MutantResult,
  VerdictWitness,
} from "../../src/core/types.js";
import type { WitnessOutcome } from "../../src/core/witness-compare.js";

const ROOT = "/proj";

const metadata = {
  gitCommit: "abc123",
  seed: 42,
  engineVersion: "0.1.0",
  nodeVersion: "22.0.0",
  strykerVersion: "9.0.0",
  vitestVersion: "3.0.0",
  typescriptVersion: "5.6.0",
  timestamp: "2025-01-01T00:00:00.000Z",
};

// ---- criteria -------------------------------------------------------------

type TextMode = "none" | "plain" | "padded" | "under" | "outside";
const textModes: TextMode[] = ["none", "plain", "padded", "under", "outside"];

type CriterionCase = { input: CriterionCoverage; expectedText: string | undefined };

const makeCriterion = (index: number, mode: TextMode, n: number): CriterionCase => {
  const criterion = `${index + 1}.1` as CriterionId;
  switch (mode) {
    case "none":
      return { input: { criterion, status: "unattacked" }, expectedText: undefined };
    case "plain":
      return {
        input: { criterion, status: "guarded", text: `Rule ${n} holds.` },
        expectedText: `Rule ${n} holds.`,
      };
    case "padded":
      return {
        input: { criterion, status: "unguarded", text: ` \n\t Rule ${n} holds. \r\n ` },
        expectedText: `Rule ${n} holds.`,
      };
    case "under":
      return {
        input: { criterion, status: "guarded", text: `See ${ROOT}/src/f${n}.ts for the rule` },
        expectedText: `See src/f${n}.ts for the rule`,
      };
    case "outside":
      return {
        input: { criterion, status: "guarded", text: `  See /other/dir/f${n}.md now  ` },
        expectedText: `See <outside-project>/f${n}.md now`,
      };
  }
};

const criteriaArb = fc
  .array(fc.tuple(fc.constantFrom(...textModes), fc.nat({ max: 999 })), { maxLength: 6 })
  .map((random) => {
    // Every mode occurs in every run set, so no-text and with-text are always reached.
    const modes: [TextMode, number][] = [
      ...textModes.map((m): [TextMode, number] => [m, 7]),
      ...random,
    ];
    return modes.map(([mode, n], i) => makeCriterion(i, mode, n));
  });

// ---- witnesses ------------------------------------------------------------

type OutcomeKind = WitnessOutcome["kind"] | "absent";
const outcomeKinds: OutcomeKind[] = ["value", "error", "timeout", "no-outcome", "absent"];

type WitnessCase = { witness: VerdictWitness; expectedOutcome: WitnessOutcome | undefined };

const makeOutcome = (
  kind: Exclude<OutcomeKind, "absent">,
  variant: number,
  n: number,
): { input: WitnessOutcome; expected: WitnessOutcome } => {
  if (kind === "value") {
    return { input: { kind, value: n }, expected: { kind, value: n } };
  }
  if (kind === "error") {
    return [
      { input: { kind, className: `Err${n}` }, expected: { kind, className: `Err${n}` } },
      {
        input: { kind, className: `${ROOT}/src/E${n}` },
        expected: { kind, className: `src/E${n}` },
      },
      {
        input: { kind, className: `/other/dir/Boom${n}` },
        expected: { kind, className: `<outside-project>/Boom${n}` },
      },
    ][variant % 3] as { input: WitnessOutcome; expected: WitnessOutcome };
  }
  return [
    { input: { kind, message: `took ${n} ms` }, expected: { kind, message: `took ${n} ms` } },
    {
      input: { kind, message: `stuck in ${ROOT}/src/f${n}.ts` },
      expected: { kind, message: `stuck in src/f${n}.ts` },
    },
    {
      input: { kind, message: `cannot import /other/dir/f${n}.ts` },
      expected: { kind, message: `cannot import <outside-project>/f${n}.ts` },
    },
  ][variant % 3] as { input: WitnessOutcome; expected: WitnessOutcome };
};

const makeWitness = (
  kind: OutcomeKind,
  variant: number,
  n: number,
  withError: boolean,
): WitnessCase => {
  const base = { from: "src/price.ts", export: "price", args: [n] };
  const expectation = withError ? { expectedError: "RangeError" } : { expected: n };
  if (kind === "absent") {
    return { witness: { ...base, ...expectation } as VerdictWitness, expectedOutcome: undefined };
  }
  const outcome = makeOutcome(kind, variant, n);
  return {
    witness: { ...base, ...expectation, mutatedOutcome: outcome.input } as VerdictWitness,
    expectedOutcome: outcome.expected,
  };
};

const witnessCasesArb = fc
  .array(
    fc.tuple(
      fc.constantFrom(...outcomeKinds),
      fc.nat({ max: 2 }),
      fc.nat({ max: 999 }),
      fc.boolean(),
    ),
    { maxLength: 6 },
  )
  .map((random) => {
    // Every outcome kind and the no-outcome case occur in every run set, with and without a path.
    const forced: [OutcomeKind, number, number, boolean][] = outcomeKinds.flatMap((k) => [
      [k, 0, 3, false],
      [k, 1, 4, true],
      [k, 2, 5, false],
    ]);
    return [...forced, ...random].map(([k, v, n, e]) => makeWitness(k, v, n, e));
  });

// ---- whole input ----------------------------------------------------------

const inputArb = fc.tuple(criteriaArb, witnessCasesArb).map(([criteria, witnessCases]) => {
  const ids = witnessCases.map((_, i) => `oath-${i + 1}.1-m${i}` as MutantId);
  const input: VerdictInput = {
    coverage: criteria.map((c) => c.input),
    mutants: ids.map(
      (id, i): MutantResult => ({
        id,
        species: "Oathbreaker",
        status: "Survived",
        requirement: `${(i % 3) + 1}.1` as CriterionId,
        killingTests: [],
      }),
    ),
    witnesses: Object.fromEntries(
      ids.map((id, i) => [id, (witnessCases[i] as WitnessCase).witness]),
    ) as Record<MutantId, VerdictWitness>,
    ignoreStaticRetried: false,
    metadata,
    projectRoot: ROOT,
  };
  return { input, criteria, witnessCases, ids };
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

const build = (input: VerdictInput) => {
  const r = buildVerdict(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("Property 26: Verdict carries criterion text and mutated outcome", () => {
  it("8.18 every coverage entry carries its trimmed, path-free text, and an entry without text has no text key", () => {
    fc.assert(
      fc.property(inputArb, ({ input, criteria }) => {
        const verdict = build(input);
        expect(verdict.coverage).toHaveLength(criteria.length);
        expect(criteria.some((c) => c.expectedText === undefined)).toBe(true);
        expect(criteria.some((c) => c.expectedText !== undefined)).toBe(true);
        criteria.forEach((c, i) => {
          const entry = verdict.coverage[i] as CriterionCoverage;
          if (c.expectedText === undefined) {
            expect(Object.hasOwn(entry, "text")).toBe(false);
          } else {
            expect(entry.text).toBe(c.expectedText);
          }
        });
      }),
    );
  });

  it("8.19 8.20 every witness with a mutated outcome keeps it scrubbed, and every witness without one has no mutatedOutcome key", () => {
    fc.assert(
      fc.property(inputArb, ({ input, witnessCases, ids }) => {
        const verdict = build(input);
        const kinds = new Set(witnessCases.map((w) => w.expectedOutcome?.kind ?? "absent"));
        expect(kinds).toEqual(new Set(outcomeKinds));
        witnessCases.forEach((w, i) => {
          const out = verdict.witnesses[ids[i] as MutantId] as VerdictWitness;
          if (w.expectedOutcome === undefined) {
            expect(Object.hasOwn(out, "mutatedOutcome")).toBe(false);
          } else {
            expect(out.mutatedOutcome).toEqual(w.expectedOutcome);
          }
        });
      }),
    );
  });

  it("8.12 8.18 8.19 the verdict passes the schema, still parses without both fields, and rejects an unknown field next to either", () => {
    fc.assert(
      fc.property(inputArb, ({ input }) => {
        const verdict = build(input);
        expect(verdictSchema.safeParse(verdict).success).toBe(true);

        const json = JSON.parse(serializeVerdict(verdict)) as {
          coverage: Record<string, unknown>[];
          witnesses: Record<string, Record<string, unknown>>;
        };

        const stripped = structuredClone(json);
        for (const c of stripped.coverage) delete c.text;
        for (const w of Object.values(stripped.witnesses)) delete w.mutatedOutcome;
        expect(verdictSchema.safeParse(stripped).success).toBe(true);

        const textIndex = json.coverage.findIndex((c) => "text" in c);
        expect(textIndex).toBeGreaterThanOrEqual(0);
        const extraCoverage = structuredClone(json);
        (extraCoverage.coverage[textIndex] as Record<string, unknown>).textt = "x";
        expect(verdictSchema.safeParse(extraCoverage).success).toBe(false);

        const withOutcome = Object.keys(json.witnesses).find(
          (k) => "mutatedOutcome" in (json.witnesses[k] ?? {}),
        );
        expect(withOutcome).toBeDefined();
        const extraWitness = structuredClone(json);
        (extraWitness.witnesses[withOutcome as string] as Record<string, unknown>).mutatedOutcomes =
          1;
        expect(verdictSchema.safeParse(extraWitness).success).toBe(false);

        const extraInOutcome = structuredClone(json);
        (
          (extraInOutcome.witnesses[withOutcome as string] as Record<string, unknown>)
            .mutatedOutcome as Record<string, unknown>
        ).extra = 1;
        expect(verdictSchema.safeParse(extraInOutcome).success).toBe(false);
      }),
    );
  });

  it("8.12 serialize, parse, validate and serialize again gives identical text", () => {
    fc.assert(
      fc.property(inputArb, ({ input }) => {
        const first = serializeVerdict(build(input));
        const parsed = verdictSchema.parse(JSON.parse(first));
        expect(serializeVerdict(parsed)).toBe(first);
      }),
    );
  });

  it("8.17 no string in the verdict satisfies containsAbsolutePath", () => {
    fc.assert(
      fc.property(inputArb, ({ input }) => {
        for (const s of collectStrings(build(input))) {
          expect(containsAbsolutePath(s), s).toBe(false);
        }
      }),
    );
  });
});
