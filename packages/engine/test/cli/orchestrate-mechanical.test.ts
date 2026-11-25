import { describe, expect, it } from "vitest";
import type { ChangedRange } from "../../src/adapters/git-adapter.js";
import {
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
    ranges?: ChangedRange[];
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
      async changedRanges(ref) {
        calls.since.push(ref);
        return ok(opts.ranges ?? []);
      },
    },
  };
};

const input = { typescriptVersion: "6.0.2" };

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
      ...fakes({ ranges: [] }),
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
    const ranges = [{ file: "src/price.ts", start: 3, end: 9 }];
    const adapters = fakes({ ranges });

    await runBaselineAndMechanical({ project: ROOT, since: "HEAD~1" }, project, input, adapters);

    expect(adapters.calls.mechanical[0]?.changedRanges).toEqual(ranges);
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
