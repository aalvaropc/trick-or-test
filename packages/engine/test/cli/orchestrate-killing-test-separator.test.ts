import { describe, expect, it } from "vitest";
import type { MechanicalRunResult } from "../../src/adapters/stryker-adapter.js";
import type { SuiteResult } from "../../src/adapters/vitest-suite-runner.js";
import {
  type LoadedProject,
  type MechanicalAdapters,
  runBaselineAndMechanical,
} from "../../src/cli/orchestrate.js";
import { err, ok } from "../../src/core/result.js";

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

const suite: SuiteResult = {
  durationMs: 10,
  files: [
    {
      path: "test/a.test.ts",
      tests: [{ name: "suite inner", status: "passed", startLine: 2 }],
    },
  ],
  testTitles: [[["suite", "inner"]]],
};

const run = async (vitestVersion: string | undefined, killerName: string) => {
  const testFiles: MechanicalRunResult["testFiles"] = {
    "test/a.test.ts": [{ id: "t1", name: killerName, startLine: 2 }],
  };
  const adapters = {
    fs: {
      readFile: async (path: string) =>
        path === `${ROOT}/test/a.test.ts`
          ? ok('describe("suite", () => {\n  it("inner", () => {});\n});\n')
          : err("ENOENT"),
    },
    suite: { run: async () => ok(suite) },
    mechanical: {
      run: async () =>
        ok({
          mutants: [
            {
              id: "m1",
              file: "src/price.ts",
              mutatorName: "EqualityOperator",
              replacement: "<=",
              original: "<",
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
              startLine: 1,
              endLine: 1,
              status: "Killed",
              killedBy: ["t1"],
            },
          ],
          testFiles,
          ignoreStaticRetried: false,
        }),
    },
    git: { diff: async () => ok("") },
  } satisfies MechanicalAdapters;
  const stage = await runBaselineAndMechanical(
    { project: ROOT },
    project,
    { typescriptVersion: "7.0.2", ...(vitestVersion === undefined ? {} : { vitestVersion }) },
    adapters,
  );
  if (!stage.ok) throw new Error(`stage failed: ${stage.error.kind}`);
  return stage.value;
};

describe("separator of the killing-test name in the orchestration", () => {
  it("6.16 with Vitest 4.x a space-named killer is matched", async () => {
    const stage = await run("4.1.0", "suite inner");
    expect(stage.mutants[0]?.result.killingTests).toEqual(["test/a.test.ts::suite inner"]);
    expect(stage.unmatchedKillingTests).toBe(0);
  });

  it("6.16 with Vitest 5.x a space-named killer is not matched and is counted", async () => {
    const stage = await run("5.1.0", "suite inner");
    expect(stage.unmatchedKillingTests).toBe(1);
  });

  it("6.16 with an unreadable version the ' > ' spelling is used", async () => {
    const arrow = await run("unknown", "suite > inner");
    expect(arrow.unmatchedKillingTests).toBe(0);
    const absent = await run(undefined, "suite inner");
    expect(absent.unmatchedKillingTests).toBe(1);
  });
});
