// Property 32: New fields are optional, strict and clean. Validates: Requirements 8.12, 8.13, 8.17, 8.22, 8.25, 8.26, 8.27, 8.28, 8.29, 8.31
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { containsAbsolutePath } from "../../src/core/paths.js";
import {
  buildHistoryRecord,
  buildVerdict,
  historyRecordSchema,
  type MutantChange,
  parseHistoryLines,
  serializeHistoryRecord,
  serializeVerdict,
  type VerdictInput,
  verdictSchema,
} from "../../src/core/report.js";
import type {
  BaselineTest,
  Claim,
  ClaimCounts,
  CriterionId,
  EngineConfig,
  HistoryRecord,
  MutantId,
  MutantResult,
  RequirementTitle,
  RunScope,
  TestId,
  Verdict,
  VerdictWitness,
} from "../../src/core/types.js";

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

// ---- field presence -------------------------------------------------------

type Presence = {
  baselineTests: "absent" | "plain" | "claims";
  claimCounts: boolean;
  counts: boolean; // changes given: mutantCounts and strykerCounts
  requirements: boolean;
  specName: boolean;
  scope: RunScope | "absent";
  dropCoverageByCriterion: boolean;
};

const ALL_OFF: Presence = {
  baselineTests: "absent",
  claimCounts: false,
  counts: false,
  requirements: false,
  specName: false,
  scope: "absent",
  dropCoverageByCriterion: true,
};
const ALL_ON: Presence = {
  baselineTests: "claims",
  claimCounts: true,
  counts: true,
  requirements: true,
  specName: true,
  scope: "full",
  dropCoverageByCriterion: false,
};

const forcedPresence: Presence[] = [
  ALL_OFF,
  ALL_ON,
  { ...ALL_ON, scope: "spec-only" },
  { ...ALL_OFF, baselineTests: "plain" },
  { ...ALL_OFF, baselineTests: "claims" },
  { ...ALL_OFF, claimCounts: true },
  { ...ALL_OFF, counts: true },
  { ...ALL_OFF, counts: true, scope: "spec-only" },
  { ...ALL_OFF, requirements: true },
  { ...ALL_OFF, specName: true },
  { ...ALL_OFF, scope: "full" },
  { ...ALL_OFF, scope: "spec-only" },
  { ...ALL_OFF, dropCoverageByCriterion: false },
];

const presenceArb: fc.Arbitrary<Presence> = fc.record({
  baselineTests: fc.constantFrom("absent", "plain", "claims"),
  claimCounts: fc.boolean(),
  counts: fc.boolean(),
  requirements: fc.boolean(),
  specName: fc.boolean(),
  scope: fc.constantFrom("absent", "full", "spec-only"),
  dropCoverageByCriterion: fc.boolean(),
});

// ---- generated values, with absolute paths on purpose ----------------------

const pathy = (n: number): string[] => [
  `plain ${n}`,
  `${ROOT}/src/f${n}.ts`,
  `/other/dir/f${n}.md`,
  `see ${ROOT}/docs/r${n}.md now`,
  `C:\\Users\\dev\\f${n}.ts`,
  ` \t padded /other/x${n} \n`,
];

const names = fc.nat({ max: 999 }).chain((n) => fc.constantFrom(...pathy(n)));

const testIdArb: fc.Arbitrary<TestId> = fc
  .tuple(
    fc.constantFrom(`${ROOT}/test/a.test.ts`, "/other/dir/b.test.ts", "test/c.test.ts"),
    fc.nat({ max: 99 }),
  )
  .map(([file, n]) => `${file}::case ${n}` as TestId);

const claimArb: fc.Arbitrary<Claim> = fc
  .tuple(names, fc.constantFrom("held", "not-held", "unchecked", "unknown-criterion"), fc.boolean())
  .map(([criterion, outcome, others]) =>
    outcome === "not-held"
      ? { criterion, outcome, otherTestsKilledAll: others }
      : { criterion, outcome },
  );

const countArb = fc.nat({ max: 50 });

const claimCountsArb: fc.Arbitrary<ClaimCounts> = fc
  .tuple(countArb, countArb, countArb, countArb, countArb, countArb)
  .map(([total, held, notHeld, unchecked, unknownCriterion, others]) => ({
    total,
    held,
    notHeld,
    unchecked,
    unknownCriterion,
    notHeldOthersKilledAll: others,
    notHeldOthersDidNot: notHeld,
  }));

const requirementsArb: fc.Arbitrary<RequirementTitle[]> = fc
  .array(names, { minLength: 1, maxLength: 4 })
  .map((titles) => titles.map((title, i) => ({ requirement: i + 1, title: `T${title}` })));

const configArb: fc.Arbitrary<EngineConfig> = fc
  .tuple(fc.boolean(), fc.constantFrom(`${ROOT}/.kiro/specs/x`, "/other/specs/x", ".kiro/specs/x"))
  .map(([withTimeout, specDir]) => ({
    specDir,
    sourceGlobs: [`${ROOT}/src/**/*.ts`, "src/**"],
    testGlobs: ["/other/test/**/*.ts"],
    propertyTestGlobs: ["test/**/*.property.test.ts"],
    mutantsDir: `${ROOT}/mutants`,
    outputDir: ".trickortest",
    ...(withTimeout ? { timeoutMs: 1000 } : {}),
  }));

type Case = {
  presence: Presence;
  input: VerdictInput;
  config: EngineConfig;
};

const MUTANT_IDS = ["m-spec-a", "m-spec-b", "m-mech-a", "m-mech-b"] as MutantId[];

const buildCase = (
  presence: Presence,
  tests: TestId[],
  claims: Claim[][],
  claimCounts: ClaimCounts,
  requirements: RequirementTitle[],
  specNameText: string,
  config: EngineConfig,
): Case => {
  const [s1, s2, m1, m2] = MUTANT_IDS as [MutantId, MutantId, MutantId, MutantId];
  const mutants: MutantResult[] = [
    {
      id: s1,
      species: "Oathbreaker",
      status: "Killed",
      requirement: "1.1" as CriterionId,
      killingTests: tests.slice(0, 2),
      killClass: "both",
    },
    {
      id: s2,
      species: "Oathbreaker",
      status: "Survived",
      requirement: "1.2" as CriterionId,
      killingTests: [],
    },
    { id: m1, species: "Borderling", status: "Killed", killingTests: tests.slice(0, 1) },
    { id: m2, species: "Miscount", status: "Survived", killingTests: [] },
  ];
  const at = (line: number) => ({
    start: { line, column: 1 },
    end: { line, column: 5 },
  });
  const changes = Object.fromEntries(
    MUTANT_IDS.map((id, i): [MutantId, MutantChange] => [
      id,
      { file: `${ROOT}/src/price.ts`, location: at(i + 1), replacement: `r${i}` },
    ]),
  ) as Record<MutantId, MutantChange>;
  const baselineTests: BaselineTest[] = tests.map((id, i) => ({
    id,
    kind: i % 2 === 0 ? "example" : "property",
    ...(presence.baselineTests === "claims" ? { claims: claims[i % claims.length] ?? [] } : {}),
  }));
  const input: VerdictInput = {
    coverage: [
      { criterion: "1.1" as CriterionId, status: "guarded" },
      { criterion: "1.2" as CriterionId, status: "unguarded" },
      { criterion: "2.1" as CriterionId, status: "unattacked" },
      { criterion: "2.2" as CriterionId, status: "skipped", reason: "no witness" },
    ],
    mutants,
    witnesses: {} as Record<MutantId, VerdictWitness>,
    ignoreStaticRetried: false,
    metadata,
    projectRoot: ROOT,
    ...(presence.counts ? { changes } : {}),
    ...(presence.scope === "absent" ? {} : { scope: presence.scope }),
    ...(presence.baselineTests === "absent" ? {} : { baselineTests }),
    ...(presence.claimCounts ? { claimCounts } : {}),
    ...(presence.specName ? { specName: specNameText } : {}),
    ...(presence.requirements ? { requirements } : {}),
  };
  return { presence, input, config };
};

const casesArb: fc.Arbitrary<Case[]> = fc
  .tuple(
    fc.array(presenceArb, { maxLength: 4 }),
    fc.array(testIdArb, { minLength: 2, maxLength: 4 }),
    fc.array(fc.array(claimArb, { maxLength: 3 }), { maxLength: 3 }).map((random) => [
      // The first test always carries one claim of every outcome, with an absolute path in the criterion.
      [
        { criterion: "/other/dir/1.1", outcome: "held" },
        { criterion: `${ROOT}/docs/1.2`, outcome: "not-held", otherTestsKilledAll: true },
        { criterion: "C:\\Users\\dev\\1.3", outcome: "unchecked" },
        { criterion: "2.9", outcome: "unknown-criterion" },
      ] satisfies Claim[],
      ...random,
    ]),
    claimCountsArb,
    requirementsArb,
    names,
    configArb,
  )
  .map(([random, tests, claims, claimCounts, requirements, specName, config]) =>
    // Every presence case occurs in every run set; random ones follow.
    [...forcedPresence, ...random].map((p) =>
      buildCase(p, tests, claims, claimCounts, requirements, specName, config),
    ),
  );

// ---- helpers ---------------------------------------------------------------

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

const buildV = (c: Case): Verdict => {
  const r = buildVerdict(structuredClone(c.input));
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const buildH = (c: Case, verdict: Verdict): HistoryRecord => {
  const r = buildHistoryRecord(
    verdict,
    undefined,
    structuredClone(c.config),
    ROOT,
    c.input.changes,
  );
  if (!r.ok) throw new Error(r.error);
  const record = r.value;
  if (c.presence.dropCoverageByCriterion) {
    const { coverageByCriterion: _dropped, ...rest } = record;
    return rest;
  }
  return record;
};

type Json = Record<string, unknown>;
const asJson = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json;
const obj = (v: unknown): Json => v as Json;

describe("Property 32: New fields are optional, strict and clean", () => {
  it("8.12 8.29 8.31 the generated verdict and history record pass their schemas, with and without every new field", () => {
    fc.assert(
      fc.property(casesArb, (cases) => {
        for (const c of cases) {
          const verdict = buildV(c);
          expect(verdictSchema.safeParse(verdict).success).toBe(true);
          const history = buildH(c, verdict);
          expect(historyRecordSchema.safeParse(history).success).toBe(true);

          const oldVerdict = asJson(verdict);
          for (const k of [
            "mutantCounts",
            "strykerCounts",
            "baselineTests",
            "claimCounts",
            "requirements",
          ]) {
            delete oldVerdict[k];
          }
          const meta = obj(oldVerdict.metadata);
          delete meta.specName;
          delete meta.scope;
          for (const t of (obj(asJson(verdict)).baselineTests as Json[] | undefined) ?? []) {
            expect(Object.hasOwn(t, "claims") || c.presence.baselineTests !== "claims").toBe(true);
          }
          expect(verdictSchema.safeParse(oldVerdict).success).toBe(true);

          const oldHistory = asJson(history);
          delete oldHistory.coverageByCriterion;
          delete oldHistory.scope;
          expect(historyRecordSchema.safeParse(oldHistory).success).toBe(true);
        }
      }),
    );
  });

  it("8.31 a baseline test with and without claims both pass the schema", () => {
    fc.assert(
      fc.property(casesArb, (cases) => {
        const withClaims = cases.find((c) => c.presence.baselineTests === "claims");
        const plain = cases.find((c) => c.presence.baselineTests === "plain");
        expect(withClaims).toBeDefined();
        expect(plain).toBeDefined();
        const a = buildV(withClaims as Case);
        const b = buildV(plain as Case);
        expect(a.baselineTests?.every((t) => t.claims !== undefined)).toBe(true);
        expect(b.baselineTests?.every((t) => !Object.hasOwn(t, "claims"))).toBe(true);
        expect(verdictSchema.safeParse(a).success).toBe(true);
        expect(verdictSchema.safeParse(b).success).toBe(true);
      }),
    );
  });

  it("8.22 8.25 8.26 8.27 8.28 8.29 an unknown field at the top level, next to a new field or inside one is rejected", () => {
    fc.assert(
      fc.property(casesArb, (cases) => {
        let injected = 0;
        for (const c of cases) {
          const verdict = buildV(c);
          const history = buildH(c, verdict);
          const v = asJson(verdict);
          const h = asJson(history);

          const verdictTargets: (Json | undefined)[] = [
            v, // top level
            obj(v.metadata), // next to specName and scope
            obj(v.mutantCounts), // inside mutantCounts
            obj(obj(v.mutantCounts)?.spec),
            obj(obj(v.mutantCounts)?.mechanical),
            obj(v.strykerCounts),
            obj(v.claimCounts),
            ((v.baselineTests as Json[] | undefined) ?? [])[0],
            (
              ((v.baselineTests as Json[] | undefined) ?? []).flatMap(
                (t) => (t.claims as Json[] | undefined) ?? [],
              ) as Json[]
            )[0],
            ((v.requirements as Json[] | undefined) ?? [])[0],
          ];
          for (const target of verdictTargets) {
            if (target === undefined) continue;
            const copy = asJson(verdict);
            // Re-find the same target in the copy by position: apply on the original JSON clone instead.
            const probe = structuredClone(v);
            const located = locate(probe, v, target);
            if (located === undefined) continue;
            located.unknownField = 1;
            injected += 1;
            expect(verdictSchema.safeParse(probe).success).toBe(false);
            expect(verdictSchema.safeParse(copy).success).toBe(true);
          }

          const historyTargets: (Json | undefined)[] = [
            h,
            ((h.coverageByCriterion as Json[] | undefined) ?? [])[0],
          ];
          for (const target of historyTargets) {
            if (target === undefined) continue;
            const probe = structuredClone(h);
            const located = locate(probe, h, target);
            if (located === undefined) continue;
            located.unknownField = 1;
            injected += 1;
            expect(historyRecordSchema.safeParse(probe).success).toBe(false);
          }
        }
        expect(injected).toBeGreaterThan(cases.length);
      }),
    );
  });

  it("8.27 8.28 8.31 an unknown outcome value, an unknown scope and a negative count are rejected", () => {
    fc.assert(
      fc.property(casesArb, (cases) => {
        let outcomes = 0;
        let counts = 0;
        for (const c of cases) {
          const verdict = buildV(c);
          const history = buildH(c, verdict);

          const badScope = asJson(verdict);
          obj(badScope.metadata).scope = "partial";
          expect(verdictSchema.safeParse(badScope).success).toBe(false);

          const badHistoryScope = asJson(history);
          badHistoryScope.scope = "partial";
          expect(historyRecordSchema.safeParse(badHistoryScope).success).toBe(false);

          const badCoverage = asJson(history);
          if (Array.isArray(badCoverage.coverageByCriterion)) {
            obj(badCoverage.coverageByCriterion[0]).status = "unknown-status";
            expect(historyRecordSchema.safeParse(badCoverage).success).toBe(false);
          }

          const claim = (verdict.baselineTests ?? []).flatMap((t) => t.claims ?? []).length > 0;
          if (claim) {
            const bad = asJson(verdict);
            const first = (bad.baselineTests as Json[]).find((t) => Array.isArray(t.claims));
            obj(((first as Json).claims as Json[])[0]).outcome = "maybe";
            outcomes += 1;
            expect(verdictSchema.safeParse(bad).success).toBe(false);
          }

          const negatives: ((j: Json) => boolean)[] = [
            (j) => {
              const t = j.claimCounts as Json | undefined;
              if (t === undefined) return false;
              t.total = -1;
              return true;
            },
            (j) => {
              const t = j.mutantCounts as Json | undefined;
              if (t === undefined) return false;
              t.twinsMerged = -1;
              return true;
            },
            (j) => {
              const t = obj(j.mutantCounts)?.spec as Json | undefined;
              if (t === undefined) return false;
              t.Killed = -1;
              return true;
            },
            (j) => {
              const t = j.strykerCounts as Json | undefined;
              if (t === undefined) return false;
              t.detected = -1;
              return true;
            },
            (j) => {
              const t = (j.requirements as Json[] | undefined)?.[0];
              if (t === undefined) return false;
              t.requirement = -1;
              return true;
            },
          ];
          for (const mutate of negatives) {
            const bad = asJson(verdict);
            if (!mutate(bad)) continue;
            counts += 1;
            expect(verdictSchema.safeParse(bad).success).toBe(false);
          }
        }
        expect(outcomes).toBeGreaterThan(0);
        expect(counts).toBeGreaterThan(0);
      }),
    );
  });

  it("8.12 8.13 8.29 writing, reading and writing again gives identical content", () => {
    fc.assert(
      fc.property(casesArb, (cases) => {
        for (const c of cases) {
          const verdict = buildV(c);
          const first = serializeVerdict(verdict);
          const reread = verdictSchema.parse(JSON.parse(first));
          expect(serializeVerdict(reread)).toBe(first);

          const line = serializeHistoryRecord(buildH(c, verdict));
          const parsed = parseHistoryLines(`${line}\n`);
          expect(parsed.ok).toBe(true);
          if (parsed.ok) {
            expect(parsed.value).toHaveLength(1);
            expect(serializeHistoryRecord(parsed.value[0] as HistoryRecord)).toBe(line);
          }
        }
      }),
    );
  });

  it("8.17 no string in the verdict or the history record satisfies containsAbsolutePath, and equal input gives byte-identical output", () => {
    fc.assert(
      fc.property(casesArb, (cases) => {
        for (const c of cases) {
          const verdict = buildV(c);
          const history = buildH(c, verdict);
          for (const s of [...collectStrings(verdict), ...collectStrings(history)]) {
            expect(containsAbsolutePath(s), s).toBe(false);
          }
          const again = buildV(c);
          expect(serializeVerdict(again)).toBe(serializeVerdict(verdict));
          expect(serializeHistoryRecord(buildH(c, again))).toBe(serializeHistoryRecord(history));
        }
      }),
    );
  });
});

/**
 * Finds, in `probe` (a deep clone of `root`), the object that sits at the same place as `target`
 * sits in `root`. Needed because the clone does not share identity with the original.
 */
function locate(probe: Json, root: Json, target: Json): Json | undefined {
  const walk = (a: unknown, b: unknown): Json | undefined => {
    if (a === target) return b as Json;
    if (Array.isArray(a)) {
      for (let i = 0; i < a.length; i++) {
        const r = walk(a[i], (b as unknown[])[i]);
        if (r !== undefined) return r;
      }
    } else if (a !== null && typeof a === "object") {
      for (const k of Object.keys(a)) {
        const r = walk((a as Json)[k], (b as Json)[k]);
        if (r !== undefined) return r;
      }
    }
    return undefined;
  };
  return walk(root, probe);
}
