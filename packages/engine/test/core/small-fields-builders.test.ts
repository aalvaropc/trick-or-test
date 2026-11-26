import { describe, expect, it } from "vitest";
import { containsAbsolutePath } from "../../src/core/paths.js";
import {
  buildHistoryRecord,
  buildVerdict,
  serializeHistoryRecord,
  serializeVerdict,
  type VerdictInput,
} from "../../src/core/report.js";
import type {
  CriterionCoverage,
  CriterionId,
  EngineConfig,
  RequirementTitle,
  Verdict,
} from "../../src/core/types.js";

const root = "/work/project";

const metadata = {
  gitCommit: "abc123",
  seed: 1,
  engineVersion: "0.0.0",
  nodeVersion: "v26.0.0",
  strykerVersion: "1.0.0",
  vitestVersion: "1.0.0",
  typescriptVersion: "7.0.0",
  timestamp: "2025-01-01T00:00:00.000Z",
};

const config: EngineConfig = {
  specDir: "/work/project/.kiro/specs/cart",
  sourceGlobs: ["src/**/*.ts"],
  testGlobs: ["test/**/*.test.ts"],
  propertyTestGlobs: ["test/**/*.property.test.ts"],
  mutantsDir: "/work/project/mutants/cart",
  outputDir: "/work/project/.trickortest",
};

const cov = (criterion: string, status: CriterionCoverage["status"]): CriterionCoverage => ({
  criterion: criterion as CriterionId,
  status,
});

const input = (extra: Partial<VerdictInput> = {}): VerdictInput => ({
  coverage: [],
  mutants: [],
  witnesses: {},
  ignoreStaticRetried: false,
  metadata,
  projectRoot: root,
  ...extra,
});

const verdictOf = (extra: Partial<VerdictInput> = {}): Verdict => {
  const built = buildVerdict(input(extra));
  if (!built.ok) throw new Error(built.error);
  return built.value;
};

const recordOf = (verdict: Verdict): ReturnType<typeof serializeHistoryRecord> => {
  const built = buildHistoryRecord(verdict, undefined, config, root);
  if (!built.ok) throw new Error(built.error);
  return serializeHistoryRecord(built.value);
};

const titles = (): RequirementTitle[] => [
  { requirement: 1, title: "Cart totals" },
  { requirement: 2, title: "Shipping" },
];

describe("8.25 spec name in the verdict", () => {
  it("8.25 the spec name reaches metadata.specName", () => {
    expect(verdictOf({ specName: "cart-pricing" }).metadata.specName).toBe("cart-pricing");
  });

  it("8.25 a verdict built without a spec name has no specName key", () => {
    expect("specName" in verdictOf().metadata).toBe(false);
  });
});

describe("8.26 requirement titles in the verdict", () => {
  it("8.26 the titles reach the verdict in the given order", () => {
    expect(verdictOf({ requirements: titles() }).requirements).toEqual([
      { requirement: 1, title: "Cart totals" },
      { requirement: 2, title: "Shipping" },
    ]);
  });

  it("8.26 a title is trimmed", () => {
    const v = verdictOf({ requirements: [{ requirement: 3, title: "  Coupons \t" }] });
    expect(v.requirements).toEqual([{ requirement: 3, title: "Coupons" }]);
  });

  it("8.17 a title with an absolute path is scrubbed", () => {
    const v = verdictOf({
      requirements: [{ requirement: 1, title: "Read /srv/elsewhere/secret/notes.md first" }],
    });
    const title = v.requirements?.[0]?.title ?? "";
    expect(containsAbsolutePath(title)).toBe(false);
    expect(title).not.toContain("/srv/elsewhere");
    expect(title).toContain("notes.md");
  });

  it("8.26 a verdict built without titles has no requirements key", () => {
    expect("requirements" in verdictOf()).toBe(false);
  });
});

describe("8.27 coverage by criterion in the history record", () => {
  it("8.27 holds one entry per criterion in document order with the verdict status", () => {
    const verdict = verdictOf({
      coverage: [
        cov("2.1", "unguarded"),
        cov("1.2", "guarded"),
        cov("1.1", "unattacked"),
        cov("3.1", "skipped"),
      ],
    });
    const built = buildHistoryRecord(verdict, undefined, config, root);
    if (!built.ok) throw new Error(built.error);
    expect(built.value.coverageByCriterion).toEqual([
      { criterion: "2.1", status: "unguarded" },
      { criterion: "1.2", status: "guarded" },
      { criterion: "1.1", status: "unattacked" },
      { criterion: "3.1", status: "skipped" },
    ]);
  });

  it("8.27 a verdict with no coverage gives an empty list", () => {
    const built = buildHistoryRecord(verdictOf(), undefined, config, root);
    if (!built.ok) throw new Error(built.error);
    expect(built.value.coverageByCriterion).toEqual([]);
  });

  it("8.27 the entries carry no reason or text", () => {
    const verdict = verdictOf({
      coverage: [{ ...cov("1.1", "skipped"), reason: "no code", text: "The cart adds" }],
    });
    const built = buildHistoryRecord(verdict, undefined, config, root);
    if (!built.ok) throw new Error(built.error);
    expect(built.value.coverageByCriterion).toEqual([{ criterion: "1.1", status: "skipped" }]);
  });
});

describe("8.13 byte-identical output", () => {
  it("8.13 equal input gives equal verdict and history text", () => {
    const make = (): { verdict: string; record: string } => {
      const v = verdictOf({
        specName: "cart-pricing",
        requirements: titles(),
        coverage: [cov("1.1", "guarded"), cov("2.1", "unattacked")],
      });
      return { verdict: serializeVerdict(v), record: recordOf(v) };
    };
    expect(make()).toEqual(make());
  });
});
