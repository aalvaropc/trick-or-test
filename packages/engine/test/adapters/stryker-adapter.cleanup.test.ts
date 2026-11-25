import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MechanicalRunner,
  type StrykerProcess,
  type StrykerProcessResult,
} from "../../src/adapters/stryker-adapter.js";
import { ok } from "../../src/core/result.js";

const REPORT = { files: {}, testFiles: {} };
const base = { cwd: "/project", typescriptVersion: "6.0.0" };
const TMP = "/project/.trickortest/stryker-tmp";

// Real StrykerJS output of a failed dry run, see test/fixtures/stryker/PROVENANCE.md.
const STATIC_FAILURE: StrykerProcessResult = {
  ok: false,
  exitCode: 1,
  output: readFileSync(
    new URL("../fixtures/stryker/dry-run-failed-module-constant.txt", import.meta.url),
    "utf8",
  ).replaceAll("^[", "\u001b"),
};

/** Fake file system and process that record the order of events. */
const harness = (outcomes: readonly (StrykerProcessResult | "throw")[]) => {
  const events: string[] = [];
  let calls = 0;
  const process: StrykerProcess = {
    async run() {
      const outcome = outcomes[calls++] ?? { ok: false, output: "unexpected call" };
      events.push("run");
      if (outcome === "throw") throw new Error("boom");
      return outcome;
    },
    async readReport() {
      return ok(REPORT);
    },
  };
  const fs = {
    async removeDir(path: string) {
      events.push(`remove ${path}`);
    },
  };
  return { process, fs, events };
};

describe("MechanicalRunner.run temporary directory", () => {
  it("3.19 removes .trickortest/stryker-tmp after a clean run", async () => {
    const { process, fs, events } = harness([{ ok: true }]);
    const result = await MechanicalRunner.run(base, process, fs);
    expect(result.ok).toBe(true);
    expect(events).toEqual(["run", `remove ${TMP}`]);
  });

  it("3.19 removes .trickortest/stryker-tmp after a failed run", async () => {
    const failed: StrykerProcessResult = { ok: false, exitCode: 1, output: "ERROR Other: bad" };
    const { process, fs, events } = harness([failed]);
    const result = await MechanicalRunner.run(base, process, fs);
    expect(result.ok).toBe(false);
    expect(events).toEqual(["run", `remove ${TMP}`]);
  });

  it("3.19 removes .trickortest/stryker-tmp after the first run and after the retry", async () => {
    const { process, fs, events } = harness([STATIC_FAILURE, { ok: true }]);
    const result = await MechanicalRunner.run(base, process, fs);
    expect(result.ok && result.value.ignoreStaticRetried).toBe(true);
    expect(events).toEqual(["run", `remove ${TMP}`, "run", `remove ${TMP}`]);
  });

  it("3.19 removes .trickortest/stryker-tmp when the process throws", async () => {
    const { process, fs, events } = harness(["throw"]);
    await expect(MechanicalRunner.run(base, process, fs)).rejects.toThrow("boom");
    expect(events).toEqual(["run", `remove ${TMP}`]);
  });

  it("3.19 removes nothing when --since selects no changed line and nothing runs", async () => {
    const { process, fs, events } = harness([{ ok: true }]);
    await MechanicalRunner.run({ ...base, since: true, changedRanges: [] }, process, fs);
    expect(events).toEqual([]);
  });
});
