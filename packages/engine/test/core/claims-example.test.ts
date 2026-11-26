import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  attachClaims,
  extractLeadingComments,
  parseClaimComments,
  resolveClaimRefs,
} from "../../src/core/claims.js";
import { parseRequirements } from "../../src/core/requirements.js";
import type { BaselineTest, Claim, MutantResult, TestId } from "../../src/core/types.js";

// Requirement 11.16: the claims of the committed example, read from the real test files of
// `examples/pricing/test/` and a fixture captured from the committed run (see PROVENANCE.md).

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const projectRoot = join(repoRoot, "examples", "pricing");
const fixtureRoot = join(here, "..", "fixtures", "cart-pricing-24");

type FixtureBaseline = {
  testResults: {
    name: string;
    assertionResults: { fullName: string; status: string; location: { line: number } }[];
  }[];
};
type FixtureMutant = { id: string; requirement: string; status: string; killingTests: string[] };

function readClaims() {
  const requirementsPath = join(repoRoot, ".kiro", "specs", "cart-pricing", "requirements.md");
  const parsed = parseRequirements(readFileSync(requirementsPath, "utf8"), requirementsPath);
  if (!parsed.ok) throw new Error("requirements.md of cart-pricing does not parse");
  const criteria = parsed.value;

  const baseline = JSON.parse(
    readFileSync(join(fixtureRoot, "baseline.json"), "utf8"),
  ) as FixtureBaseline;
  const mutants = JSON.parse(
    readFileSync(join(fixtureRoot, "mutants.json"), "utf8"),
  ) as FixtureMutant[];
  const results = mutants.map(
    (m): MutantResult =>
      ({
        id: m.id,
        species: "Oathbreaker",
        status: m.status,
        requirement: m.requirement,
        killingTests: m.killingTests,
      }) as MutantResult,
  );

  const tests: BaselineTest[] = [];
  const claimIds = new Map<TestId, string[]>();
  for (const file of baseline.testResults) {
    const text = readFileSync(join(projectRoot, file.name), "utf8");
    for (const test of file.assertionResults) {
      if (test.status !== "passed") continue;
      const id = `${file.name}::${test.fullName}` as TestId;
      tests.push({ id, kind: "example" });
      const refs = parseClaimComments(
        extractLeadingComments(text, test.location.line),
        "cart-pricing",
      );
      claimIds.set(id, resolveClaimRefs(refs, criteria));
    }
  }
  return attachClaims(tests, claimIds, criteria, results);
}

const PROPERTY_TESTS: Record<string, string> = {
  "Property 1":
    "test/percent.test.ts::percentOf matches the BigInt Round_Half_Up reference for safe non-negative integers",
  "Property 6":
    "test/price.test.ts::priceCart coupon discount discountCents follows the coupon rules and is clamped to the subtotal",
  "Property 7":
    "test/price.test.ts::priceCart shipping shippingCents follows method and the discounted subtotal threshold",
  "Property 9":
    "test/price.test.ts::priceCart breakdown invariants fields are non-negative integers, discount <= subtotal, and total identity holds",
};

describe("claims of the committed cart-pricing example", () => {
  const { baselineTests, claimCounts } = readClaims();
  const claimsOf = (property: string): Claim[] =>
    baselineTests.find((t) => t.id === PROPERTY_TESTS[property])?.claims ?? [];
  const all = baselineTests.flatMap((t) => (t.claims ?? []).map((c) => ({ test: t.id, claim: c })));

  it("11.16 reads 25 claims: 16 held, 7 not-held, 2 unchecked, 0 unknown-criterion", () => {
    expect(claimCounts).toMatchObject({
      total: 25,
      held: 16,
      notHeld: 7,
      unchecked: 2,
      unknownCriterion: 0,
    });
  });

  it("11.16 the two unchecked claims are 2.2 and 3.4", () => {
    const unchecked = all.filter((x) => x.claim.outcome === "unchecked");
    expect(unchecked.map((x) => x.claim.criterion).sort()).toEqual(["2.2", "3.4"]);
  });

  it("11.16 the seven not-held claims are the expected criteria of Properties 1, 6, 7 and 9", () => {
    const notHeld = (property: string): string[] =>
      claimsOf(property)
        .filter((c) => c.outcome === "not-held")
        .map((c) => c.criterion)
        .sort();
    expect(notHeld("Property 1")).toEqual(["2.1"]);
    expect(notHeld("Property 6")).toEqual(["5.1", "5.5"]);
    expect(notHeld("Property 7")).toEqual(["6.2", "6.3"]);
    expect(notHeld("Property 9")).toEqual(["5.5", "7.4"]);
    expect(all.filter((x) => x.claim.outcome === "not-held")).toHaveLength(7);
  });

  it("11.16 otherTestsKilledAll is true for six not-held claims and false for 7.4 of Property 9", () => {
    const flags = all.flatMap(({ test, claim }) =>
      claim.outcome === "not-held"
        ? [{ test, criterion: claim.criterion, others: claim.otherTestsKilledAll }]
        : [],
    );
    expect(flags.filter((f) => f.others)).toHaveLength(6);
    const notOthers = flags.filter((f) => !f.others);
    expect(notOthers).toEqual([
      { test: PROPERTY_TESTS["Property 9"], criterion: "7.4", others: false },
    ]);
    expect(claimCounts.notHeldOthersKilledAll).toBe(6);
    expect(claimCounts.notHeldOthersDidNot).toBe(1);
  });
});
