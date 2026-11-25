import { describe, expect, it } from "vitest";
import type { MechanicalMutant, MechanicalRunResult } from "../../src/adapters/stryker-adapter.js";
import {
  type LoadedProject,
  type MechanicalAdapters,
  runBaselineAndMechanical,
} from "../../src/cli/orchestrate.js";
import { computeMutantId } from "../../src/core/mutant-id.js";
import { ok } from "../../src/core/result.js";

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

const at = (
  id: string,
  startLine: number,
  startColumn: number,
  endLine = startLine,
  endColumn = startColumn + 1,
): MechanicalMutant => ({
  id,
  file: "src/price.ts",
  mutatorName: "EqualityOperator",
  replacement: "<=",
  original: "<",
  location: {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  },
  startLine,
  endLine,
  status: "Survived",
  killedBy: [],
});

const run = (mutants: MechanicalMutant[]) => {
  const result: MechanicalRunResult = { mutants, testFiles: {}, ignoreStaticRetried: false };
  const adapters: MechanicalAdapters = {
    fs: { readFile: async () => ok("") },
    suite: {
      run: async () =>
        ok({
          durationMs: 1,
          files: [
            { path: "test/a.test.ts", tests: [{ name: "x", status: "passed", startLine: 1 }] },
          ],
        }),
    },
    mechanical: { run: async () => ok(result) },
    git: { changedRanges: async () => ok([]) },
  };
  return runBaselineAndMechanical(
    { project: ROOT },
    project,
    { typescriptVersion: "6.0.2" },
    adapters,
  );
};

describe("mechanical stage uses the real StrykerJS location", () => {
  it("8.7 two identical changes at different lines get different ids", async () => {
    const result = await run([at("a", 10, 5), at("b", 20, 5)]);

    const ids = result.ok ? result.value.mutants.map((m) => m.result.id) : [];
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("8.7 the occurrence index follows the location, not the input order", async () => {
    const result = await run([at("late", 20, 5), at("early", 10, 5)]);

    const ids = result.ok ? result.value.mutants.map((m) => m.result.id) : [];
    expect(ids).toEqual([
      computeMutantId("src/price.ts", "<", "<=", 1),
      computeMutantId("src/price.ts", "<", "<=", 0),
    ]);
  });

  it("8.7 two identical changes on one line are ordered by start column", async () => {
    const result = await run([at("right", 10, 30), at("left", 10, 5)]);

    const ids = result.ok ? result.value.mutants.map((m) => m.result.id) : [];
    expect(ids).toEqual([
      computeMutantId("src/price.ts", "<", "<=", 1),
      computeMutantId("src/price.ts", "<", "<=", 0),
    ]);
  });

  it("3.16 ids do not change when unrelated lines above the mutants move", async () => {
    const before = await run([at("a", 10, 5), at("b", 20, 5)]);
    const after = await run([at("a", 14, 5), at("b", 24, 5)]);

    const ids = (r: typeof before) => (r.ok ? r.value.mutants.map((m) => m.result.id) : []);
    expect(ids(after)).toEqual(ids(before));
    expect(ids(before)).toHaveLength(2);
  });

  it("8.7 each outcome carries the start and end line and column for the report input", async () => {
    const result = await run([at("a", 10, 5, 11, 9)]);

    expect(result.ok && result.value.mutants[0]?.location).toEqual({
      start: { line: 10, column: 5 },
      end: { line: 11, column: 9 },
    });
  });
});
