import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SuiteRunner } from "../../src/adapters/vitest-suite-runner.js";

const root = join(import.meta.dirname, "..", "fixtures", "suite-runner");
const excludesRoot = join(import.meta.dirname, "..", "fixtures", "suite-runner-excludes");
// The folder is git-ignored, so the failing files are written by the tests and removed after.
const scratch = join(excludesRoot, ".trickortest");

const failingSource = `import { expect, it } from "vitest";\nit("fails on purpose", () => {\n  expect(1).toBe(2);\n});\n`;

const writeFailing = async (relative: string): Promise<void> => {
  const file = join(excludesRoot, relative);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, failingSource);
};

const narrowRoot = join(import.meta.dirname, "..", "fixtures", "suite-runner-narrow");

const writeNarrowFailing = async (relative: string): Promise<void> => {
  const file = join(narrowRoot, relative);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, failingSource);
};

afterEach(async () => {
  await rm(join(narrowRoot, ".trickortest"), { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
  await rm(join(excludesRoot, "generated.witness.test.ts"), { force: true });
});

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

  it("3.20 does not run a failing test file inside a StrykerJS sandbox under .trickortest", async () => {
    await writeFailing(".trickortest/stryker-tmp/sandbox-abc/broken.test.ts");
    const result = await SuiteRunner.run(excludesRoot, { timeLimitMs: 60_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files.map((f) => f.path)).toEqual(["pass.test.ts"]);
    expect(result.value.files.flatMap((f) => f.tests).every((t) => t.status === "passed")).toBe(
      true,
    );
  });

  it("5.21 does not run a generated Witness file under .trickortest", async () => {
    await writeFailing(".trickortest/witnesses/oath-1.1-x.witness.test.ts");
    const result = await SuiteRunner.run(excludesRoot, { timeLimitMs: 60_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files.map((f) => f.path)).toEqual(["pass.test.ts"]);
  });

  it("10.13 a narrow include runs only the matching file and leaves the failing file and a .trickortest copy unrun", async () => {
    await writeNarrowFailing(".trickortest/stryker-tmp/sandbox-abc/matched/copy.test.ts");
    const result = await SuiteRunner.run(narrowRoot, {
      timeLimitMs: 60_000,
      testFiles: ["matched/"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files.map((f) => f.path)).toEqual(["matched/ok.test.ts"]);
    const failing = result.value.files.flatMap((f) => f.tests).filter((t) => t.status === "failed");
    expect(failing).toHaveLength(0);
    expect(result.value.files.flatMap((f) => f.tests).map((t) => t.name)).toEqual([
      "matches the include and passes",
    ]);
  });

  it("5.21 does not run a generated Witness file outside .trickortest", async () => {
    await writeFailing("generated.witness.test.ts");
    const result = await SuiteRunner.run(excludesRoot, { timeLimitMs: 60_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files.map((f) => f.path)).toEqual(["pass.test.ts"]);
  });
});
