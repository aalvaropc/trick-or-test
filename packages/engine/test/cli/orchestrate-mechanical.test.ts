import { describe, expect, it } from "vitest";
import {
  buildStrykerOptions,
  type MechanicalMutant,
  MechanicalRunner,
  type MechanicalRunOptions,
  type MechanicalRunResult,
} from "../../src/adapters/stryker-adapter.js";
import type { SuiteFile, SuiteResult } from "../../src/adapters/vitest-suite-runner.js";
import {
  type LoadedProject,
  type MechanicalAdapters,
  runBaselineAndMechanical,
} from "../../src/cli/orchestrate.js";
import { computeMutantId } from "../../src/core/mutant-id.js";
import { err, ok, type Result } from "../../src/core/result.js";
import type { ProjectEntry } from "../../src/core/sandbox-plan.js";

const ROOT = "/proj";

const project: LoadedProject = {
  config: {
    specDir: `${ROOT}/.kiro/specs`,
    sourceGlobs: ["src/**/*.ts"],
    testGlobs: ["test/**/*.test.ts"],
    propertyTestGlobs: ["test/**/*.property.test.ts"],
    mutantsDir: `${ROOT}/mutants`,
    outputDir: `${ROOT}/reports`,
  },
  specs: [],
};

const TEST_FILES: Record<string, string> = {
  [`${ROOT}/test/a.test.ts`]: 'it("example", () => {\n  expect(1).toBe(1);\n});\n',
  [`${ROOT}/test/b.test.ts`]: 'it("prop", () => {\n  fc.assert(p);\n});\n',
};

const mutant = (id: string, over: Partial<MechanicalMutant> = {}): MechanicalMutant => ({
  id,
  file: "src/price.ts",
  mutatorName: "EqualityOperator",
  replacement: "<=",
  original: "<",
  location: { start: { line: 10, column: 1 }, end: { line: 10, column: 2 } },
  startLine: 10,
  endLine: 10,
  status: "Killed",
  killedBy: [],
  ...over,
});

const passingSuite = (durationMs = 1234): SuiteResult => ({
  durationMs,
  files: [{ path: "test/a.test.ts", tests: [{ name: "x", status: "passed", startLine: 1 }] }],
});

const runResult = (mutants: MechanicalMutant[]): MechanicalRunResult => ({
  mutants,
  testFiles: {
    "test/a.test.ts": [{ id: "t1", name: "example", startLine: 1 }],
    "test/b.test.ts": [{ id: "t2", name: "prop", startLine: 1 }],
  },
  ignoreStaticRetried: false,
});

type Fakes = MechanicalAdapters & {
  calls: { suite: number; mechanical: MechanicalRunOptions[]; since: string[] };
};

const fakes = (
  opts: {
    suite?: Result<SuiteResult, { kind: "RunError"; message: string }>;
    mechanical?: Result<MechanicalRunResult, string>;
    diff?: string;
  } = {},
): Fakes => {
  const calls: Fakes["calls"] = { suite: 0, mechanical: [], since: [] };
  return {
    calls,
    fs: {
      async readFile(path) {
        const text = TEST_FILES[path];
        return text === undefined ? err("ENOENT") : ok(text);
      },
    },
    suite: {
      async run() {
        calls.suite += 1;
        return opts.suite ?? ok(passingSuite());
      },
    },
    mechanical: {
      async run(options) {
        calls.mechanical.push(options);
        return opts.mechanical ?? ok(runResult([]));
      },
    },
    git: {
      async diff(ref) {
        calls.since.push(ref);
        return ok(opts.diff ?? "");
      },
    },
  };
};

const input = { typescriptVersion: "6.0.2" };

const diffOf = (file: string, ...hunks: string[]): string =>
  [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, ...hunks].join("\n");

describe("baseline and mechanical stage", () => {
  it("3.15 a failing baseline returns the failing tests and never starts StrykerJS", async () => {
    const failing: SuiteFile = {
      path: "test/a.test.ts",
      tests: [
        { name: "ok", status: "passed", startLine: 1 },
        { name: "broken", status: "failed", startLine: 5 },
      ],
    };
    const adapters = fakes({ suite: ok({ durationMs: 10, files: [failing] }) });

    const result = await runBaselineAndMechanical({ project: ROOT }, project, input, adapters);

    expect(result).toEqual({
      ok: false,
      error: { kind: "baseline-failed", failingTests: ["test/a.test.ts::broken"] },
    });
    expect(adapters.calls.mechanical).toHaveLength(0);
  });

  it("3.6 a StrykerJS error returns its first error line", async () => {
    const adapters = fakes({ mechanical: err("Error: boom") });

    const result = await runBaselineAndMechanical({ project: ROOT }, project, input, adapters);

    expect(result).toEqual({ ok: false, error: { kind: "stryker-error", message: "Error: boom" } });
  });

  it("9.1 a normal run records the baseline duration and classifies killed and survived mutants", async () => {
    const adapters = fakes({
      suite: ok(passingSuite(4321)),
      mechanical: ok(
        runResult([
          mutant("m1", { killedBy: ["t1"], startLine: 10 }),
          mutant("m2", { killedBy: ["t2"], startLine: 20 }),
          mutant("m3", { killedBy: ["t1", "t2"], startLine: 30 }),
          mutant("m4", { status: "Survived", startLine: 40, mutatorName: "Unheard" }),
        ]),
      ),
    });

    const result = await runBaselineAndMechanical({ project: ROOT }, project, input, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.baselineMs).toBe(4321);
    const [m1, m2, m3, m4] = result.value.mutants.map((m) => m.result);
    expect(m1).toMatchObject({
      status: "Killed",
      killClass: "examples-only",
      species: "Borderling",
      killingTests: ["test/a.test.ts::example"],
    });
    expect(m2).toMatchObject({ status: "Killed", killClass: "properties-only" });
    expect(m3).toMatchObject({ status: "Killed", killClass: "both" });
    expect(m4).toMatchObject({ status: "Survived", species: "Unclassified", killingTests: [] });
    expect(m4?.killClass).toBeUndefined();
  });

  it("3.6 --since with no changes starts no mechanical run and yields zero mutants", async () => {
    let started = 0;
    const adapters: MechanicalAdapters = {
      ...fakes({ diff: "" }),
      mechanical: {
        run: (options) =>
          MechanicalRunner.run(options, {
            async run() {
              started += 1;
              return { ok: false, output: "must not start" };
            },
            async readReport() {
              return err("must not read");
            },
          }),
      },
    };

    const result = await runBaselineAndMechanical(
      { project: ROOT, since: "main" },
      project,
      input,
      adapters,
    );

    expect(started).toBe(0);
    expect(result.ok && result.value.mutants).toEqual([]);
  });

  it("9.3 --since passes the ranges from git to the mechanical runner", async () => {
    const adapters = fakes({ diff: diffOf("src/price.ts", "@@ -3,2 +3,7 @@") });

    await runBaselineAndMechanical({ project: ROOT, since: "HEAD~1" }, project, input, adapters);

    expect(adapters.calls.mechanical[0]?.changedRanges).toEqual([
      { file: "src/price.ts", start: 3, end: 9 },
    ]);
  });

  it("3.9 the mutate patterns are project-relative, sorted and limited to the changed lines", async () => {
    const diff = [
      diffOf("src/b.ts", "@@ -1,0 +5,2 @@"),
      diffOf("src/a/c.ts", "@@ -7 +7 @@", "@@ -20,3 +21,0 @@"),
    ].join("\n");
    const adapters = fakes({ diff });

    await runBaselineAndMechanical({ project: ROOT, since: "main" }, project, input, adapters);

    const options = buildStrykerOptions(adapters.calls.mechanical[0] as MechanicalRunOptions);
    expect(options.mutate).toEqual(["src/a/c.ts:7-7", "src/b.ts:5-6"]);
    expect(adapters.calls.since).toEqual(["main"]);
  });

  it("3.9 a changed file outside the source globs is dropped", async () => {
    const diff = [
      diffOf("README.md", "@@ -1 +1 @@"),
      diffOf("test/price.test.ts", "@@ -4 +4 @@"),
      diffOf("src/price.ts", "@@ -2 +2 @@"),
    ].join("\n");
    const adapters = fakes({ diff });

    await runBaselineAndMechanical({ project: ROOT, since: "main" }, project, input, adapters);

    expect(adapters.calls.mechanical[0]?.changedRanges).toEqual([
      { file: "src/price.ts", start: 2, end: 2 },
    ]);
  });

  it("3.10 no changed line in a source file never calls the mechanical runner", async () => {
    const diff = [
      diffOf("README.md", "@@ -1 +1 @@"),
      diffOf("src/price.ts", "@@ -5,2 +4,0 @@"),
    ].join("\n");
    const adapters = fakes({ diff });

    const result = await runBaselineAndMechanical(
      { project: ROOT, since: "main" },
      project,
      input,
      adapters,
    );

    expect(adapters.calls.mechanical).toHaveLength(0);
    expect(result.ok && result.value.mutants).toEqual([]);
  });

  it("6.9 a killed mutant whose killing tests are unknown is unattributed", async () => {
    const adapters = fakes({
      mechanical: ok(runResult([mutant("m1", { killedBy: ["no-such-test"] })])),
    });

    const result = await runBaselineAndMechanical({ project: ROOT }, project, input, adapters);

    expect(result.ok && result.value.mutants[0]?.result).toMatchObject({
      status: "Killed",
      killClass: "unattributed",
      killingTests: [],
    });
  });

  it("6.1 a Timeout mutant has no kill class", async () => {
    const adapters = fakes({ mechanical: ok(runResult([mutant("m1", { status: "Timeout" })])) });

    const result = await runBaselineAndMechanical({ project: ROOT }, project, input, adapters);

    const first = result.ok ? result.value.mutants[0]?.result : undefined;
    expect(first?.status).toBe("Timeout");
    expect(first?.killClass).toBeUndefined();
  });

  it("8.7 the same mechanical mutant gets the same hash id on two runs", async () => {
    const mutants = [
      mutant("a", { startLine: 10, killedBy: ["t1"] }),
      mutant("b", { startLine: 20, killedBy: ["t1"] }),
    ];
    const run = () =>
      runBaselineAndMechanical(
        { project: ROOT },
        project,
        input,
        fakes({
          mechanical: ok(runResult(mutants.map((m) => ({ ...m, id: `x-${Math.random()}` })))),
        }),
      );

    const [first, second] = [await run(), await run()];

    const ids = (r: typeof first) => (r.ok ? r.value.mutants.map((m) => m.result.id) : []);
    expect(ids(first)).toEqual(ids(second));
    expect(ids(first)).toEqual([
      computeMutantId("src/price.ts", "<", "<=", 0),
      computeMutantId("src/price.ts", "<", "<=", 1),
    ]);
  });
});

describe("baseline file-level failure", () => {
  const loadFailure: SuiteFile = {
    path: "test/broken.test.ts",
    tests: [{ name: "test/broken.test.ts", status: "failed", startLine: 0 }],
  };

  it("3.15 a baseline whose only failure is a file that fails to load aborts and names the file", async () => {
    const adapters = fakes({
      suite: ok({ durationMs: 10, files: [passingSuite().files[0] as SuiteFile, loadFailure] }),
    });

    const result = await runBaselineAndMechanical({ project: ROOT }, project, input, adapters);

    expect(result).toEqual({
      ok: false,
      error: { kind: "baseline-failed", failingTests: ["test/broken.test.ts"] },
    });
  });

  it("3.15 a file-level baseline failure never starts StrykerJS", async () => {
    const adapters = fakes({ suite: ok({ durationMs: 10, files: [loadFailure] }) });

    await runBaselineAndMechanical({ project: ROOT }, project, input, adapters);

    expect(adapters.calls.mechanical).toHaveLength(0);
  });
});

describe("StrykerJS exclusions in the mechanical stage", () => {
  const listing: ProjectEntry[] = [
    { path: "src", kind: "dir" },
    { path: "src/price.ts", kind: "file" },
    { path: "test", kind: "dir" },
    { path: "docs", kind: "dir" },
    { path: "docs/guide.md", kind: "file" },
    { path: "linked", kind: "symlink", target: "docs" },
  ];

  const withListing = (entries: ProjectEntry[]): Fakes => {
    const adapters = fakes();
    return {
      ...adapters,
      fs: { ...adapters.fs, listEntries: async () => entries },
    };
  };

  it("3.7 the options passed to the runner list a non-build directory", async () => {
    const adapters = withListing(listing);

    await runBaselineAndMechanical({ project: ROOT }, project, input, adapters);

    expect(adapters.calls.mechanical[0]?.exclusions?.nonBuildDirs).toEqual(["docs"]);
  });

  it("3.7 the options passed to the runner list a symlinked directory", async () => {
    const adapters = withListing(listing);

    await runBaselineAndMechanical({ project: ROOT }, project, input, adapters);

    expect(adapters.calls.mechanical[0]?.exclusions?.symlinkedDirs).toEqual(["linked"]);
  });

  it("3.7 a build root from the source and test globs is not excluded", async () => {
    const adapters = withListing(listing);

    await runBaselineAndMechanical({ project: ROOT }, project, input, adapters);

    const patterns = adapters.calls.mechanical[0]?.exclusions?.ignorePatterns ?? [];
    expect(patterns).not.toContain("src/**");
    expect(patterns).not.toContain("test/**");
    expect(patterns).toContain("docs/**");
    expect(patterns).toContain("reports/**");
  });

  it("3.7 a glob that starts with a wildcard excludes nothing", async () => {
    const adapters = withListing(listing);
    const wild: LoadedProject = {
      ...project,
      config: { ...project.config, sourceGlobs: ["**/*.ts"] },
    };

    await runBaselineAndMechanical({ project: ROOT }, wild, input, adapters);

    expect(adapters.calls.mechanical[0]?.exclusions).toBeUndefined();
  });
});
