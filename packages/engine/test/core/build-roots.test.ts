import { describe, expect, it } from "vitest";
import type { ProjectEntry } from "../../src/core/sandbox-plan.js";
import { buildRootsOf, computeStrykerExclusions } from "../../src/core/stryker-exclusions.js";

const listing: ProjectEntry[] = [
  { path: "src", kind: "dir" },
  { path: "test", kind: "dir" },
  { path: "extra", kind: "dir" },
  { path: "docs", kind: "dir" },
  { path: "extra/guard.test.ts", kind: "file" },
  { path: "root.test.ts", kind: "file" },
];

const DEFAULT_SOURCE = ["src/**/*.ts"];
const DEFAULT_TEST = ["test/**/*.test.ts"];

describe("build roots", () => {
  it("3.22 a test file in extra/ with the default globs keeps extra out of the exclusions", () => {
    const roots = buildRootsOf(DEFAULT_SOURCE, DEFAULT_TEST, ["extra/guard.test.ts"]);
    expect(roots).toBeDefined();
    const exclusions = computeStrykerExclusions(listing, roots as string[]);
    expect(exclusions.nonBuildDirs).not.toContain("extra");
    expect(exclusions.ignorePatterns).not.toContain("extra/**");
  });

  it("3.7 a top-level folder with no Baseline_Run test file outside the globs is still excluded", () => {
    const roots = buildRootsOf(DEFAULT_SOURCE, DEFAULT_TEST, ["extra/guard.test.ts"]);
    const exclusions = computeStrykerExclusions(listing, roots as string[]);
    expect(exclusions.nonBuildDirs).toEqual(["docs"]);
  });

  it("3.22 a test file at the project root adds only its own file name", () => {
    const roots = buildRootsOf(DEFAULT_SOURCE, DEFAULT_TEST, ["root.test.ts"]);
    expect(roots).toEqual(["root.test.ts", "src", "test"]);
    const exclusions = computeStrykerExclusions(listing, roots as string[]);
    expect(exclusions.nonBuildDirs).toEqual(["docs", "extra"]);
  });

  it("3.22 test globs **/*.test.ts give no answer with Baseline_Run test files", () => {
    expect(buildRootsOf(DEFAULT_SOURCE, ["**/*.test.ts"], ["extra/guard.test.ts"])).toBeUndefined();
  });

  it("3.22 test globs **/*.test.ts give no answer without Baseline_Run test files", () => {
    expect(buildRootsOf(DEFAULT_SOURCE, ["**/*.test.ts"], [])).toBeUndefined();
  });

  it("3.22 a glob that starts with .. gives no answer", () => {
    expect(buildRootsOf(["../src/**/*.ts"], DEFAULT_TEST, [])).toBeUndefined();
  });
});
