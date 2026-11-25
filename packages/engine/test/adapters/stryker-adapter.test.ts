import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createStrykerProcess,
  MechanicalRunner,
  type StrykerHost,
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

// Real StrykerJS 10.1.1 output, see test/fixtures/stryker/PROVENANCE.md.
// The captures write the ESC byte as `^[`; decode it to get what the adapter receives.
const capture = (name: string): string =>
  readFileSync(new URL(`../fixtures/stryker/${name}`, import.meta.url), "utf8").replaceAll(
    "^[",
    "\u001b",
  );
const failure = (name: string): StrykerProcessResult => ({
  ok: false,
  output: capture(name),
  exitCode: 1,
});
const expectedError = (name: string): string =>
  readFileSync(new URL(`../fixtures/stryker/${name}`, import.meta.url), "utf8").trim();
const staticFailure = failure("dry-run-failed-module-constant.txt");

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
    const { process, calls } = fake([staticFailure, staticFailure]);
    const result = await MechanicalRunner.run(base, process);
    expect(calls).toHaveLength(2);
    expect(result).toEqual(err(expectedError("dry-run-failed-module-constant.error.txt")));
  });

  it("3.5 retries once and flags it for each captured failed dry run", async () => {
    for (const name of [
      "dry-run-failed-module-constant.txt",
      "dry-run-failed-inline-literal.txt",
    ]) {
      const { process, calls } = fake([failure(name), { ok: true }]);
      const result = await MechanicalRunner.run(base, process);
      expect(calls.map((c) => c.ignoreStatic)).toEqual([undefined, true]);
      expect(result.ok && result.value.ignoreStaticRetried).toBe(true);
    }
  });

  it("3.17 does not retry a failure after a successful dry run and does not flag it", async () => {
    const { process, calls } = fake([failure("failed-after-dry-run.txt")]);
    const result = await MechanicalRunner.run(base, process);
    expect(calls).toHaveLength(1);
    expect(result).toEqual(err(expectedError("failed-after-dry-run.error.txt")));
  });

  it("3.6 returns the first ERROR-level line, without colour codes, not the first line", async () => {
    const { process } = fake([failure("failed-after-dry-run.txt")]);
    const result = await MechanicalRunner.run(base, process);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error).not.toContain("ProjectReader");
    expect(result.error).not.toContain("\u001b");
  });

  it("3.5 does not retry a successful dry run flagged only by a clean exit", async () => {
    const { process, calls } = fake([{ ok: true }]);
    const result = await MechanicalRunner.run(base, process);
    expect(calls).toHaveLength(1);
    expect(result.ok && result.value.ignoreStaticRetried).toBe(false);
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

describe("StrykerJS binary lookup", () => {
  type Exec = { command: string; args: readonly string[]; cwd: string };
  const host = (
    present: readonly string[],
    outcome: StrykerProcessResult,
  ): { host: StrykerHost; execs: Exec[] } => {
    const execs: Exec[] = [];
    return {
      execs,
      host: {
        exists: (path) => present.includes(path),
        async writeConfig() {},
        async exec(command, args, cwd) {
          execs.push({ command, args, cwd });
          return outcome;
        },
      },
    };
  };
  const options = {} as StrykerOptions;

  it("3.18 runs the local node_modules/.bin/stryker of the project", async () => {
    const { host: h, execs } = host(["/project/node_modules/.bin/stryker"], { ok: true });
    await createStrykerProcess(h).run(options, "/project");
    expect(execs).toEqual([
      {
        command: "/project/node_modules/.bin/stryker",
        args: ["run", "/project/.trickortest/stryker.config.json"],
        cwd: "/project",
      },
    ]);
  });

  it("3.18 finds a binary hoisted to an ancestor directory", async () => {
    const { host: h, execs } = host(["/repo/node_modules/.bin/stryker"], { ok: true });
    await createStrykerProcess(h).run(options, "/repo/examples/pricing");
    expect(execs[0]?.command).toBe("/repo/node_modules/.bin/stryker");
  });

  it("3.18 returns an error that names the missing binary when none is installed", async () => {
    const { host: h } = host([], {
      ok: false,
      output: "npm error could not determine executable to run",
      exitCode: 1,
    });
    const result = await createStrykerProcess(h).run(options, "/project");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.output).toContain("node_modules/.bin/stryker");
    expect(result.output).toContain("not found");
  });

  it("3.18 falls back to npx with --no-install as the first argument", async () => {
    const { host: h, execs } = host([], { ok: true });
    await createStrykerProcess(h).run(options, "/project");
    expect(execs).toHaveLength(1);
    expect(execs[0]?.command).toBe("npx");
    expect(execs[0]?.args[0]).toBe("--no-install");
  });

  it("3.18 never passes a bare npx to the process runner", async () => {
    for (const present of [[], ["/project/node_modules/.bin/stryker"]]) {
      const { host: h, execs } = host(present, { ok: true });
      await createStrykerProcess(h).run(options, "/project");
      for (const exec of execs) {
        if (exec.command === "npx") expect(exec.args).toContain("--no-install");
      }
    }
  });
});
