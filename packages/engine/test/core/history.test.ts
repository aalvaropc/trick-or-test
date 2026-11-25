import { describe, expect, it } from "vitest";
import { containsAbsolutePath } from "../../src/core/paths.js";
import { appendHistory, buildHistoryRecord } from "../../src/core/report.js";
import type {
  CriterionId,
  EngineConfig,
  HistoryRecord,
  MutantId,
  MutantResult,
  MutantStatus,
  Verdict,
} from "../../src/core/types.js";

const ROOT = "/proj";
const mid = (s: string) => s as MutantId;
const cid = (s: string) => s as CriterionId;

const config: EngineConfig = {
  specDir: ".kiro/specs/x",
  sourceGlobs: ["src/**/*.ts"],
  testGlobs: ["test/**/*.test.ts"],
  propertyTestGlobs: ["test/**/*.property.test.ts"],
  mutantsDir: "mutants",
  outputDir: "out",
};

const mutant = (id: string, status: MutantStatus): MutantResult => ({
  id: mid(id),
  species: "Oathbreaker",
  status,
  killingTests: [],
});

const verdictOf = (mutants: MutantResult[], seed = 42): Verdict => ({
  coverage: [
    { criterion: cid("1.1"), status: "guarded" },
    { criterion: cid("1.2"), status: "unguarded" },
    { criterion: cid("1.3"), status: "skipped", reason: "r" },
    { criterion: cid("1.4"), status: "guarded" },
  ],
  mutants,
  witnesses: {},
  ignoreStaticRetried: false,
  metadata: {
    gitCommit: "abc123",
    seed,
    engineVersion: "0.1.0",
    nodeVersion: "22.0.0",
    strykerVersion: "9.0.0",
    vitestVersion: "2.0.0",
    typescriptVersion: "5.0.0",
    timestamp: "2025-01-01T00:00:00.000Z",
  },
});

const build = (v: Verdict, prev?: HistoryRecord): HistoryRecord => {
  const r = buildHistoryRecord(v, prev, config, ROOT);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("history record", () => {
  it("8.8 first record without previous lists every killed id as newly killed", () => {
    const rec = build(
      verdictOf([mutant("a", "Killed"), mutant("b", "Survived"), mutant("c", "Killed")]),
    );
    expect(rec.time).toBe("2025-01-01T00:00:00.000Z");
    expect(rec.gitCommit).toBe("abc123");
    expect(rec.seed).toBe(42);
    expect(rec.config).toEqual(config);
    expect(rec.mutants).toEqual([
      { id: "a", status: "Killed" },
      { id: "b", status: "Survived" },
      { id: "c", status: "Killed" },
    ]);
    expect(rec.statusCounts.Killed).toBe(2);
    expect(rec.statusCounts.Survived).toBe(1);
    expect(rec.statusCounts.Timeout).toBe(0);
    expect(rec.coverageCounts).toEqual({ guarded: 2, unguarded: 1, unattacked: 0, skipped: 1 });
    expect(rec.newlyKilledIds).toEqual(["a", "c"]);
  });

  it("8.9 newlyKilledIds excludes ids the previous record already listed as Killed", () => {
    const prev = build(verdictOf([mutant("a", "Killed"), mutant("b", "Survived")]));
    const rec = build(
      verdictOf([mutant("a", "Killed"), mutant("b", "Killed"), mutant("c", "Killed")]),
      prev,
    );
    expect(rec.newlyKilledIds).toEqual(["b", "c"]);
  });

  it("8.9 a run that kills nothing new has empty newlyKilledIds", () => {
    const prev = build(verdictOf([mutant("a", "Killed"), mutant("b", "Survived")]));
    const rec = build(verdictOf([mutant("a", "Killed"), mutant("b", "Survived")]), prev);
    expect(rec.newlyKilledIds).toEqual([]);
  });

  it("8.10 a record that fails the schema returns an error Result", () => {
    const r = buildHistoryRecord(verdictOf([mutant("a", "Killed")], 1.5), undefined, config, ROOT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("seed");
  });

  it("8.8 appendHistory keeps old records unchanged and adds the new one", () => {
    const first = build(verdictOf([mutant("a", "Killed")]));
    const second = build(verdictOf([mutant("a", "Killed")]), first);
    const old = [first];
    const next = appendHistory(old, second);
    expect(next).toEqual([first, second]);
    expect(old).toEqual([first]);
  });
});

const stringsIn = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [k, ...stringsIn(v)]);
  }
  return [];
};

describe("history record, paths (8.17)", () => {
  const resolved: EngineConfig = {
    specDir: "/proj/.kiro/specs/x",
    sourceGlobs: ["/proj/src/**/*.ts"],
    testGlobs: ["/proj/test/**/*.test.ts"],
    propertyTestGlobs: ["test/**/*.property.test.ts"],
    mutantsDir: "/proj/mutants",
    outputDir: "/var/reports",
    timeoutMs: 5000,
  };
  const built = buildHistoryRecord(verdictOf([mutant("a", "Killed")]), undefined, resolved, ROOT);
  const record = built.ok ? built.value : undefined;

  it("8.17 a config path under the root is relative", () => {
    expect(record?.config).toMatchObject({
      specDir: ".kiro/specs/x",
      sourceGlobs: ["src/**/*.ts"],
      testGlobs: ["test/**/*.test.ts"],
      propertyTestGlobs: ["test/**/*.property.test.ts"],
      mutantsDir: "mutants",
      timeoutMs: 5000,
    });
  });

  it("8.17 a config path outside the root becomes <outside-project>/<basename>", () => {
    expect(record?.config.outputDir).toBe("<outside-project>/reports");
  });

  it("8.17 no string in the history record contains an absolute path", () => {
    expect(built.ok).toBe(true);
    expect(stringsIn(record).filter(containsAbsolutePath)).toEqual([]);
  });
});
