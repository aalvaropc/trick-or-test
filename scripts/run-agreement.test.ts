import { readFileSync } from "node:fs";
import {
  type HistoryRecord,
  type MutationTestingReport,
  mutationReportSchema,
  parseHistoryLines,
  type Verdict,
  verdictSchema,
} from "trick-or-test/report";
import { describe, expect, it } from "vitest";

// Agreement of the three files of a run (Requirements 8.17, 8.21, 8.22, 8.23, 6.12, 11.12).
// Every check returns a problem that names the file and the field; the tests expect no problem.

const SPEC_NAME = "cart-pricing";
const REQUIREMENTS_PATH = `../.kiro/specs/${SPEC_NAME}/requirements.md`;

const RUNS = [
  "../reports",
  "../apps/viewer/public/demo/before",
  "../apps/viewer/public/demo/after",
];

const STATUSES = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
] as const;

type SpeciesOf = { species: string };
type VerdictLike = {
  mutants: { id: string; species: string; status: string; killingTests: string[] }[];
};
type ReportLike = {
  files: Record<string, { mutants: { id: string; mutatorName: string }[] }>;
};

const isSpecMutantInReport = (mutatorName: string): boolean => mutatorName === "Oathbreaker";
const isSpecMutantInVerdict = (m: SpeciesOf): boolean => m.species === "Oathbreaker";

const reportMutants = (report: ReportLike): { id: string; mutatorName: string }[] =>
  Object.values(report.files).flatMap((f) => f.mutants);

const fileOfTestId = (id: string): string => id.split("::")[0] ?? id;

/** Test files in the baseline tests of `after` and not in those of `before`. */
const guardTestFiles = (before: { id: string }[], after: { id: string }[]): Set<string> => {
  const inBefore = new Set(before.map((t) => fileOfTestId(t.id)));
  return new Set(after.map((t) => fileOfTestId(t.id)).filter((f) => !inBefore.has(f)));
};

/** Number of Mechanical_Mutants with a killing test in a guard-test file. Spec_Mutants are not counted. */
const mechanicalMutantsKilledByGuardTest = (
  verdict: VerdictLike,
  report: ReportLike,
  guardFiles: Set<string>,
): number => {
  const mechanical = new Set(
    reportMutants(report)
      .filter((m) => !isSpecMutantInReport(m.mutatorName))
      .map((m) => m.id),
  );
  return verdict.mutants.filter(
    (m) =>
      mechanical.has(m.id) &&
      m.killingTests.some((t) => t.includes("::") && guardFiles.has(fileOfTestId(t))),
  ).length;
};

const sameSet = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((x) => b.has(x));

const diffNote = (a: Set<string>, b: Set<string>): string =>
  `only in first: [${[...a]
    .filter((x) => !b.has(x))
    .slice(0, 3)
    .join(", ")}], only in second: [${[...b]
    .filter((x) => !a.has(x))
    .slice(0, 3)
    .join(", ")}]`;

const ABSOLUTE_PATH_PATTERNS: RegExp[] = [
  /^\/[\w.@-]+\/[^\s]*$/, // a whole string that is a POSIX absolute path
  /(?:^|[\s"'`(=:])\/(?:home|Users|root|tmp|var|usr|etc|opt|srv|mnt|proj|private)\//,
  /(?:^|[\s"'`(=])[A-Za-z]:[\\/][\w.-]/, // a Windows drive path
  /file:\/\/\//,
];

const absolutePathStrings = (value: unknown, path: string, found: string[] = []): string[] => {
  if (typeof value === "string") {
    if (ABSOLUTE_PATH_PATTERNS.some((p) => p.test(value))) found.push(path);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => {
      absolutePathStrings(v, `${path}[${i}]`, found);
    });
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      // Object keys are strings too (file names of the report, witness ids).
      if (ABSOLUTE_PATH_PATTERNS.some((p) => p.test(k))) found.push(`${path}.<key ${k}>`);
      absolutePathStrings(v, `${path}.${k}`, found);
    }
  }
  return found;
};

const requirementNumbers = (markdown: string): number[] =>
  [...markdown.matchAll(/^### Requirement (\d+)\b/gm)].map((m) => Number(m[1]));

type Parsed = {
  verdict: Verdict;
  report: MutationTestingReport;
  last: HistoryRecord;
  raw: { verdict: unknown; report: unknown; history: string };
};

/** Parses the three files of a run. Returns problems instead of throwing so the message names file and field. */
const parseRun = (dir: string): { parsed?: Parsed; problems: string[] } => {
  const problems: string[] = [];
  const read = (name: string): string =>
    readFileSync(new URL(`${dir}/${name}`, import.meta.url), "utf8");
  const verdictRaw: unknown = JSON.parse(read("verdict.json"));
  const reportRaw: unknown = JSON.parse(read("mutation-report.json"));
  const historyText = read("history.jsonl");

  const verdict = verdictSchema.safeParse(verdictRaw);
  if (!verdict.success) {
    for (const i of verdict.error.issues) {
      problems.push(`${dir}/verdict.json: ${i.path.join(".")}: ${i.message}`);
    }
  }
  const report = mutationReportSchema.safeParse(reportRaw);
  if (!report.success) {
    for (const i of report.error.issues) {
      problems.push(`${dir}/mutation-report.json: ${i.path.join(".")}: ${i.message}`);
    }
  }
  const history = parseHistoryLines(historyText);
  if (!history.ok) problems.push(`${dir}/history.jsonl: ${history.error.message}`);
  const last = history.ok ? history.value.at(-1) : undefined;
  if (history.ok && last === undefined) problems.push(`${dir}/history.jsonl: no record`);

  if (!verdict.success || !report.success || last === undefined) return { problems };
  return {
    parsed: {
      verdict: verdict.data,
      report: report.data,
      last,
      raw: { verdict: verdictRaw, report: reportRaw, history: historyText },
    },
    problems,
  };
};

const checkRun = (dir: string): string[] => {
  const { parsed, problems } = parseRun(dir);
  if (parsed === undefined) return problems;
  const { verdict, report, last, raw } = parsed;
  const V = `${dir}/verdict.json`;
  const R = `${dir}/mutation-report.json`;
  const H = `${dir}/history.jsonl`;
  const fail = (file: string, field: string, message: string): void => {
    problems.push(`${file}: ${field}: ${message}`);
  };

  // Id sets (8.17).
  const verdictIds = new Set(verdict.mutants.map((m) => m.id as string));
  const reportIds = new Set(reportMutants(report).map((m) => m.id));
  const historyIds = new Set(last.mutants.map((m) => m.id as string));
  if (!sameSet(verdictIds, reportIds)) {
    fail(
      R,
      "files.*.mutants[].id",
      `differs from verdict.json mutants (${diffNote(verdictIds, reportIds)})`,
    );
  }
  if (!sameSet(verdictIds, historyIds)) {
    fail(
      H,
      "last record mutants[].id",
      `differs from verdict.json mutants (${diffNote(verdictIds, historyIds)})`,
    );
  }
  if (verdictIds.size !== verdict.mutants.length) fail(V, "mutants[].id", "an id is listed twice");

  // The two ways of telling a Spec_Mutant agree.
  const specInVerdict = new Set(
    verdict.mutants.filter(isSpecMutantInVerdict).map((m) => m.id as string),
  );
  const specInReport = new Set(
    reportMutants(report)
      .filter((m) => isSpecMutantInReport(m.mutatorName))
      .map((m) => m.id),
  );
  if (!sameSet(specInVerdict, specInReport)) {
    fail(
      R,
      "mutatorName",
      `Oathbreaker ids differ from verdict.json species (${diffNote(specInVerdict, specInReport)})`,
    );
  }

  // mutantCounts per kind and status (8.22) and strykerCounts (8.23).
  const counts = verdict.mutantCounts;
  const stryker = verdict.strykerCounts;
  if (counts === undefined) fail(V, "mutantCounts", "missing");
  if (stryker === undefined) fail(V, "strykerCounts", "missing");
  const tally = (spec: boolean): Record<string, number> => {
    const t: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const m of verdict.mutants) {
      if (isSpecMutantInVerdict(m) === spec) t[m.status] = (t[m.status] ?? 0) + 1;
    }
    return t;
  };
  if (counts !== undefined) {
    const specTally = tally(true);
    const mechTally = tally(false);
    for (const s of STATUSES) {
      if (counts.spec[s] !== specTally[s]) {
        fail(
          V,
          `mutantCounts.spec.${s}`,
          `is ${counts.spec[s]} but ${specTally[s]} Spec_Mutants are listed`,
        );
      }
      const given = counts.mechanical?.[s] ?? 0;
      if (given !== mechTally[s]) {
        fail(
          V,
          `mutantCounts.mechanical.${s}`,
          `is ${given} but ${mechTally[s]} Mechanical_Mutants are listed`,
        );
      }
    }
    if (stryker !== undefined) {
      const mechanicalTotal = Object.values(mechTally).reduce((a, b) => a + b, 0);
      if (counts.twinsMerged + mechanicalTotal !== stryker.total) {
        fail(
          V,
          "strykerCounts.total",
          `is ${stryker.total} but twinsMerged ${counts.twinsMerged} plus ${mechanicalTotal} Mechanical_Mutants is ${counts.twinsMerged + mechanicalTotal}`,
        );
      }
    }
  }
  if (stryker !== undefined) {
    if (stryker.detected > stryker.total)
      fail(V, "strykerCounts.detected", `${stryker.detected} is above total ${stryker.total}`);
    if (stryker.undetected > stryker.total)
      fail(V, "strykerCounts.undetected", `${stryker.undetected} is above total ${stryker.total}`);
  }

  // Baseline tests and killing tests (6.12, 6.15, 10.15).
  const baseline = verdict.baselineTests;
  if (baseline === undefined || baseline.length === 0) {
    fail(V, "baselineTests", "missing or empty");
  } else {
    const baselineIds = new Set(baseline.map((t) => t.id as string));
    for (const m of verdict.mutants) {
      for (const t of m.killingTests) {
        // A file-level Failing_Test has the file path as id and has no `::`.
        if (!t.includes("::")) continue;
        if (!baselineIds.has(t))
          fail(V, `mutants[${m.id}].killingTests`, `"${t}" is not in baselineTests`);
      }
    }
  }
  if (verdict.unmatchedKillingTests !== 0) {
    fail(V, "unmatchedKillingTests", `is ${verdict.unmatchedKillingTests}, expected 0`);
  }

  // claimCounts (11.12).
  const cc = verdict.claimCounts;
  if (cc === undefined) {
    fail(V, "claimCounts", "missing");
  } else {
    const claims = (baseline ?? []).flatMap((t) => t.claims ?? []);
    const byOutcome = (o: string): number => claims.filter((c) => c.outcome === o).length;
    const sum = cc.held + cc.notHeld + cc.unchecked + cc.unknownCriterion;
    if (sum !== cc.total)
      fail(V, "claimCounts.total", `is ${cc.total} but the outcomes add up to ${sum}`);
    if (cc.total !== claims.length)
      fail(
        V,
        "claimCounts.total",
        `is ${cc.total} but baselineTests holds ${claims.length} claims`,
      );
    if (cc.held !== byOutcome("held"))
      fail(V, "claimCounts.held", `is ${cc.held} but baselineTests holds ${byOutcome("held")}`);
    if (cc.notHeld !== byOutcome("not-held"))
      fail(
        V,
        "claimCounts.notHeld",
        `is ${cc.notHeld} but baselineTests holds ${byOutcome("not-held")}`,
      );
    if (cc.unchecked !== byOutcome("unchecked"))
      fail(
        V,
        "claimCounts.unchecked",
        `is ${cc.unchecked} but baselineTests holds ${byOutcome("unchecked")}`,
      );
    if (cc.unknownCriterion !== byOutcome("unknown-criterion")) {
      fail(
        V,
        "claimCounts.unknownCriterion",
        `is ${cc.unknownCriterion} but baselineTests holds ${byOutcome("unknown-criterion")}`,
      );
    }
    if (cc.notHeldOthersKilledAll + cc.notHeldOthersDidNot !== cc.notHeld) {
      fail(
        V,
        "claimCounts.notHeld",
        `is ${cc.notHeld} but notHeldOthersKilledAll plus notHeldOthersDidNot is ${cc.notHeldOthersKilledAll + cc.notHeldOthersDidNot}`,
      );
    }
  }

  // Coverage in the last history record (8.21).
  const expectedCoverage = verdict.coverage.map((c) => ({
    criterion: c.criterion,
    status: c.status,
  }));
  if (last.coverageByCriterion === undefined) {
    fail(H, "coverageByCriterion", "missing in the last record");
  } else if (JSON.stringify(last.coverageByCriterion) !== JSON.stringify(expectedCoverage)) {
    fail(H, "coverageByCriterion", "differs from coverage of verdict.json");
  }

  // Metadata and requirements.
  if (verdict.metadata.specName !== SPEC_NAME) {
    fail(
      V,
      "metadata.specName",
      `is ${JSON.stringify(verdict.metadata.specName)}, expected "${SPEC_NAME}"`,
    );
  }
  if (verdict.metadata.scope !== undefined && verdict.metadata.scope !== "full") {
    fail(V, "metadata.scope", `is "${verdict.metadata.scope}", expected "full" or absent`);
  }
  const expectedRequirements = requirementNumbers(
    readFileSync(new URL(REQUIREMENTS_PATH, import.meta.url), "utf8"),
  );
  const listed = (verdict.requirements ?? []).map((r) => r.requirement);
  if (JSON.stringify(listed) !== JSON.stringify(expectedRequirements)) {
    fail(
      V,
      "requirements",
      `lists [${listed.join(", ")}], the spec has [${expectedRequirements.join(", ")}]`,
    );
  }

  // No absolute path in any string.
  for (const [file, value] of [
    [V, raw.verdict],
    [R, raw.report],
    [
      H,
      raw.history
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l): unknown => JSON.parse(l)),
    ],
  ] as const) {
    for (const where of absolutePathStrings(value, "$"))
      fail(file, where, "holds an absolute path");
  }

  // The demo after a hunt shows Mechanical_Mutants killed by the Guard_Test file.
  if (dir.endsWith("/demo/after")) {
    const before = parseRun("../apps/viewer/public/demo/before").parsed;
    const guardFiles = guardTestFiles(
      before?.verdict.baselineTests ?? [],
      verdict.baselineTests ?? [],
    );
    if (guardFiles.size === 0) {
      fail(V, "baselineTests", "no test file is in after and not in before");
    } else if (mechanicalMutantsKilledByGuardTest(verdict, report, guardFiles) === 0) {
      fail(
        V,
        "mutants[].killingTests",
        "no Mechanical_Mutant has a killing test in a guard-test file",
      );
    }
  }
  return problems;
};

describe("mechanicalMutantsKilledByGuardTest", () => {
  const guardFiles = new Set(["extra/guard-hand-made.test.ts"]);

  it("11.12 a Spec_Mutant alone with a killing test in a guard-test file gives 0", () => {
    const verdict: VerdictLike = {
      mutants: [
        {
          id: "oath-7.4-x",
          species: "Oathbreaker",
          status: "Killed",
          killingTests: ["extra/guard-hand-made.test.ts::t"],
        },
        { id: "abc", species: "Borderling", status: "Killed", killingTests: ["test/a.test.ts::t"] },
      ],
    };
    const report: ReportLike = {
      files: {
        "src/a.ts": {
          mutants: [
            { id: "oath-7.4-x", mutatorName: "Oathbreaker" },
            { id: "abc", mutatorName: "EqualityOperator" },
          ],
        },
      },
    };
    expect(mechanicalMutantsKilledByGuardTest(verdict, report, guardFiles)).toBe(0);
  });

  it("11.12 a Mechanical_Mutant with a killing test in a guard-test file counts once", () => {
    const verdict: VerdictLike = {
      mutants: [
        {
          id: "abc",
          species: "Borderling",
          status: "Killed",
          killingTests: ["extra/guard-hand-made.test.ts::t", "extra/guard-hand-made.test.ts::u"],
        },
      ],
    };
    const report: ReportLike = {
      files: { "src/a.ts": { mutants: [{ id: "abc", mutatorName: "EqualityOperator" }] } },
    };
    expect(mechanicalMutantsKilledByGuardTest(verdict, report, guardFiles)).toBe(1);
  });

  it("11.12 a Mechanical_Mutant killed only in a file that before also has gives 0", () => {
    const verdict: VerdictLike = {
      mutants: [
        { id: "abc", species: "Borderling", status: "Killed", killingTests: ["test/a.test.ts::t"] },
      ],
    };
    const report: ReportLike = {
      files: { "src/a.ts": { mutants: [{ id: "abc", mutatorName: "EqualityOperator" }] } },
    };
    expect(mechanicalMutantsKilledByGuardTest(verdict, report, guardFiles)).toBe(0);
  });
});

describe("guardTestFiles", () => {
  it("11.12 a file in the baseline tests of after and not of before is a guard-test file", () => {
    const before = [{ id: "test/a.test.ts::t" }];
    const after = [{ id: "test/a.test.ts::t" }, { id: "extra/guard-hand-made.test.ts::u" }];
    expect([...guardTestFiles(before, after)]).toEqual(["extra/guard-hand-made.test.ts"]);
  });
});

describe("absolute paths", () => {
  it("8.17 finds a string that holds an absolute path and names its field", () => {
    expect(absolutePathStrings({ a: ["/srv/app/src/x.ts"], b: "src/x.ts" }, "$")).toEqual([
      "$.a[0]",
    ]);
  });
});

describe.each(RUNS)("agreement of the files of %s", (dir) => {
  it("8.17 the three files agree with each other", () => {
    expect(checkRun(dir)).toEqual([]);
  });
});
