import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SuiteRunner } from "../../src/adapters/vitest-suite-runner.js";

const fixtures = join(import.meta.dirname, "..", "fixtures");

describe("SuiteRunner.run file-level failures", () => {
  it("3.15 a test file that throws at import is one failing test named after the file", async () => {
    const result = await SuiteRunner.run(join(fixtures, "suite-runner-import-error"), {
      timeLimitMs: 60_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toEqual([
      {
        path: "broken.test.ts",
        tests: [{ name: "broken.test.ts", status: "failed", startLine: 0 }],
      },
    ]);
  });

  it("5.9 a normal failing test still returns its own name and start line", async () => {
    const result = await SuiteRunner.run(join(fixtures, "suite-runner"), {
      timeLimitMs: 60_000,
      testFiles: ["fail.test.ts"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const failed = (result.value.files[0]?.tests ?? []).filter((t) => t.status === "failed");
    expect(failed).toEqual([{ name: "fails on purpose", status: "failed", startLine: 7 }]);
  });
});
