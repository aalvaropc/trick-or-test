import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MechanicalRunner,
  type StrykerOptions,
  type StrykerProcess,
  type StrykerProcessResult,
} from "../../src/adapters/stryker-adapter.js";
import { err, ok } from "../../src/core/result.js";

const REPORT = {
  files: {
    "src/a.ts": {
      source: "const x = a + b;\n",
      mutants: [
        {
          id: "1",
          mutatorName: "ArithmeticOperator",
          replacement: "-",
          status: "Killed",
          killedBy: ["t1"],
          location: { start: { line: 1, column: 13 }, end: { line: 1, column: 14 } },
        },
        {
          id: "2",
          mutatorName: "ArithmeticOperator",
          replacement: "*",
          status: "Survived",
          location: { start: { line: 1, column: 13 }, end: { line: 1, column: 14 } },
        },
      ],
    },
  },
  testFiles: {
    "test/a.test.ts": {
      tests: [{ id: "t1", name: "adds", location: { start: { line: 3, column: 1 } } }],
    },
  },
};

const fake = (
  outcomes: readonly StrykerProcessResult[],
): { process: StrykerProcess; calls: StrykerOptions[] } => {
  const calls: StrykerOptions[] = [];
  const process: StrykerProcess = {
    async run(options) {
      calls.push(options);
      return outcomes[calls.length - 1] ?? { ok: false, output: "unexpected call" };
    },
    async readReport() {
      return ok(REPORT);
    },
  };
  return { process, calls };
};

const base = { cwd: "/project", typescriptVersion: "6.0.0" };
const staticFailure = {
  ok: false,
  output: "Initial test run failed\nStatic mutants make the run fail\n",
} as const;

describe("MechanicalRunner.run", () => {
  it("3.5 parses mutants with killedBy and testFiles from a clean run", async () => {
    const { process, calls } = fake([{ ok: true }]);
    const result = await MechanicalRunner.run(base, process);
    expect(calls).toHaveLength(1);
    expect(result.ok && result.value.ignoreStaticRetried).toBe(false);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.mutants.map((m) => [m.id, m.killedBy, m.original])).toEqual([
      ["1", ["t1"], "+"],
      ["2", [], "+"],
    ]);
    expect(result.value.testFiles["test/a.test.ts"]).toEqual([
      { id: "t1", name: "adds", startLine: 3 },
    ]);
  });

  it("3.5 retries once with ignoreStatic after a static-mutant failure and flags it", async () => {
    const { process, calls } = fake([staticFailure, { ok: true }]);
    const result = await MechanicalRunner.run(base, process);
    expect(calls.map((c) => c.ignoreStatic)).toEqual([undefined, true]);
    expect(result.ok && result.value.ignoreStaticRetried).toBe(true);
  });

  it("3.6 does not retry a second time when the retry fails again", async () => {
    const { process, calls } = fake([staticFailure, { ok: false, output: "\nStill broken\nmore" }]);
    const result = await MechanicalRunner.run(base, process);
    expect(calls).toHaveLength(2);
    expect(result).toEqual(err("Still broken"));
  });

  it("3.6 returns the first error line for any other failure without retrying", async () => {
    const { process, calls } = fake([{ ok: false, output: "\n  Config error: bad\nstack" }]);
    const result = await MechanicalRunner.run(base, process);
    expect(calls).toHaveLength(1);
    expect(result).toEqual(err("Config error: bad"));
  });

  it("3.10 returns zero mutants without running StrykerJS when --since has no changed line", async () => {
    const { process, calls } = fake([{ ok: true }]);
    const result = await MechanicalRunner.run({ ...base, since: true, changedRanges: [] }, process);
    expect(calls).toHaveLength(0);
    expect(result).toEqual(ok({ mutants: [], testFiles: {}, ignoreStaticRetried: false }));
  });

  it("3.16 returns start line, start column, end line and end column of each mutant from a real StrykerJS report", async () => {
    const real: unknown = JSON.parse(
      readFileSync(new URL("../fixtures/stryker/mutation-report.json", import.meta.url), "utf8"),
    );
    const process: StrykerProcess = {
      async run() {
        return { ok: true };
      },
      async readReport() {
        return ok(real);
      },
    };
    const result = await MechanicalRunner.run(base, process);
    if (!result.ok) throw new Error("expected ok");
    const where = (id: string) => result.value.mutants.find((m) => m.id === id)?.location;
    expect(result.value.mutants).toHaveLength(15);
    // single-line mutant: `>=` in `if (subtotalCents >= 10000)`
    expect(where("3")).toEqual({ start: { line: 2, column: 7 }, end: { line: 2, column: 29 } });
    // multi-line mutant: the whole body of shippingCents
    expect(where("0")).toEqual({ start: { line: 1, column: 62 }, end: { line: 6, column: 2 } });
    // mutant on a later line
    expect(where("14")).toEqual({ start: { line: 13, column: 10 }, end: { line: 13, column: 15 } });
  });

  it("6.1 passes the changed ranges as mutate patterns when --since has changes", async () => {
    const { process, calls } = fake([{ ok: true }]);
    await MechanicalRunner.run(
      { ...base, since: true, changedRanges: [{ file: "src/a.ts", start: 1, end: 2 }] },
      process,
    );
    expect(calls[0]?.mutate).toEqual(["src/a.ts:1-2"]);
  });
});
