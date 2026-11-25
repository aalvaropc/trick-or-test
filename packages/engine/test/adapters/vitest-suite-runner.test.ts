import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SuiteRunner } from "../../src/adapters/vitest-suite-runner.js";

const root = join(import.meta.dirname, "..", "fixtures", "suite-runner");

describe("SuiteRunner.run", () => {
  it("5.8 runs the target suite and reports a duration and per-file tests", async () => {
    const result = await SuiteRunner.run(root, {
      timeLimitMs: 60_000,
      testFiles: ["pass.test.ts"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.durationMs).toBeGreaterThan(0);
    expect(result.value.files).toHaveLength(1);
    expect(result.value.files[0]?.path).toBe("pass.test.ts");
    expect(result.value.files[0]?.tests.map((t) => [t.name, t.status, t.startLine])).toEqual([
      ["adds", "passed", 3],
      ["subtracts", "passed", 7],
    ]);
  });

  it("5.9 reports a failing test as a normal result with its start line", async () => {
    const result = await SuiteRunner.run(root, {
      timeLimitMs: 60_000,
      testFiles: ["fail.test.ts"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tests = result.value.files[0]?.tests ?? [];
    expect(tests.find((t) => t.status === "failed")).toEqual({
      name: "fails on purpose",
      status: "failed",
      startLine: 7,
    });
    expect(tests.find((t) => t.name === "passes first")?.status).toBe("passed");
  });

  it("5.10 returns a Timeout result when the suite exceeds the time limit", async () => {
    const result = await SuiteRunner.run(root, { timeLimitMs: 3000, testFiles: ["hang.test.ts"] });
    expect(result).toEqual({ ok: false, error: { kind: "Timeout", limitMs: 3000 } });
  });

  it("5.11 returns a RunError when no Vitest installation can be found", async () => {
    const result = await SuiteRunner.run("/", { timeLimitMs: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("RunError");
  });
});
