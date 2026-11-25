import fc from "fast-check";
import type {
  CriterionCoverage,
  CriterionId,
  MutantId,
  MutantResult,
  TestId,
  Verdict,
  Witness,
} from "../../src/core/types.js";

const text = fc.string({ maxLength: 12 });
const criterionIdArb = fc
  .tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 }))
  .map(([a, b]) => `${a}.${b}` as CriterionId);
const testIdArb = fc.string({ minLength: 1, maxLength: 10 }).map((s) => s as TestId);
const mutantIdArb = fc.string({ minLength: 1, maxLength: 10 }).map((s) => s as MutantId);

const coverageArb = fc.record(
  {
    criterion: criterionIdArb,
    status: fc.constantFrom("guarded", "unguarded", "unattacked", "skipped"),
    reason: text,
  },
  { requiredKeys: ["criterion", "status"] },
) as fc.Arbitrary<CriterionCoverage>;

const mutantResultArb = fc.record(
  {
    id: mutantIdArb,
    species: fc.constantFrom(
      "Borderling",
      "Miscount",
      "Two-Face",
      "Hollow",
      "Impostor",
      "Oathbreaker",
      "Unclassified",
    ),
    status: fc.constantFrom(
      "Killed",
      "Survived",
      "Timeout",
      "Ghost",
      "InvalidWitness",
      "CompileError",
      "NotApplicable",
    ),
    requirement: criterionIdArb,
    killingTests: fc.array(testIdArb, { maxLength: 3 }),
    killClass: fc.constantFrom("examples-only", "properties-only", "both", "unattributed"),
  },
  { requiredKeys: ["id", "species", "status", "killingTests"] },
) as fc.Arbitrary<MutantResult>;

const argsArb = fc.array(fc.jsonValue(), { maxLength: 3 });
const witnessArb = fc.oneof(
  fc.record({ from: text, export: text, args: argsArb, expected: fc.jsonValue() }),
  fc.record({ from: text, export: text, args: argsArb, expectedError: text }),
) as fc.Arbitrary<Witness>;

/** Verdicts that satisfy verdictSchema. Witness values are JSON values so they survive JSON text. */
export const verdictArb: fc.Arbitrary<Verdict> = fc.record({
  coverage: fc.array(coverageArb, { maxLength: 5 }),
  mutants: fc.array(mutantResultArb, { maxLength: 5 }),
  witnesses: fc.dictionary(mutantIdArb, witnessArb, { maxKeys: 4 }),
  ignoreStaticRetried: fc.boolean(),
  metadata: fc.record({
    gitCommit: text,
    seed: fc.integer(),
    engineVersion: text,
    nodeVersion: text,
    strykerVersion: text,
    vitestVersion: text,
    typescriptVersion: text,
    timestamp: text,
  }),
}) as fc.Arbitrary<Verdict>;
