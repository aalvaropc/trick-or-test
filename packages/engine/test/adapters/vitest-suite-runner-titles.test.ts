import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type SuiteResult, SuiteRunner } from "../../src/adapters/vitest-suite-runner.js";

const fixtures = join(import.meta.dirname, "..", "fixtures");

const runOf = async (project: string, file: string): Promise<SuiteResult> => {
  const result = await SuiteRunner.run(join(fixtures, project), {
    timeLimitMs: 60_000,
    testFiles: [file],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("suite run failed");
  return result.value;
};

const titlesOf = (run: SuiteResult, name: string): readonly string[] | undefined => {
  const tests = run.files[0]?.tests ?? [];
  const index = tests.findIndex((t) => t.name === name);
  return run.testTitles?.[0]?.[index];
};

describe("SuiteRunner.run testTitles", () => {
  it("6.14 a top-level test has one title", async () => {
    const run = await runOf("suite-runner", "titles.test.ts");
    expect(titlesOf(run, "top level")).toEqual(["top level"]);
  });

  it("6.14 a test inside one describe has the describe title then its own", async () => {
    const run = await runOf("suite-runner", "titles.test.ts");
    expect(titlesOf(run, "outer inside one")).toEqual(["outer", "inside one"]);
  });

  it("6.14 a test inside two nested describe blocks has the titles in order", async () => {
    const run = await runOf("suite-runner", "titles.test.ts");
    expect(titlesOf(run, "outer inner inside two")).toEqual(["outer", "inner", "inside two"]);
  });

  it("6.14 a title containing ' > ' stays one title", async () => {
    const run = await runOf("suite-runner", "titles.test.ts");
    expect(titlesOf(run, "a > b")).toEqual(["a > b"]);
  });

  it("6.14 a file-level failure gives the empty list", async () => {
    const run = await runOf("suite-runner-import-error", "broken.test.ts");
    expect(run.files[0]?.tests.map((t) => t.name)).toEqual(["broken.test.ts"]);
    expect(run.testTitles).toEqual([[[]]]);
  });

  it("6.14 name still equals the fullName joined with spaces", async () => {
    const run = await runOf("suite-runner", "titles.test.ts");
    expect(run.files[0]?.tests.map((t) => t.name)).toEqual([
      "top level",
      "outer inside one",
      "outer inner inside two",
      "a > b",
    ]);
  });

  it("6.14 testTitles has one list per file and one entry per test", async () => {
    const run = await runOf("suite-runner", "titles.test.ts");
    expect(run.testTitles?.length).toBe(run.files.length);
    expect(run.testTitles?.map((list) => list.length)).toEqual(
      run.files.map((file) => file.tests.length),
    );
  });
});
