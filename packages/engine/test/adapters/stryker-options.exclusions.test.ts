import { describe, expect, it } from "vitest";
import { buildStrykerOptions } from "../../src/adapters/stryker-adapter.js";
import type { ProjectEntry } from "../../src/core/sandbox-plan.js";
import { computeStrykerExclusions } from "../../src/core/stryker-exclusions.js";

const listing: ProjectEntry[] = [
  { path: "src", kind: "dir" },
  { path: "docs", kind: "dir" },
  { path: "linked", kind: "symlink", target: "docs" },
  { path: "src/a.ts", kind: "file" },
];

const exclusions = computeStrykerExclusions(listing, ["src"]);
const options = buildStrykerOptions({ typescriptVersion: "6.0.2", exclusions });

describe("buildStrykerOptions with computed exclusions", () => {
  it("3.7 lists a non-build directory as an entry and as a subtree", () => {
    expect(options.ignorePatterns).toEqual(expect.arrayContaining(["docs", "docs/**"]));
  });

  it("3.7 lists a symlinked directory as an entry and as a subtree", () => {
    expect(options.ignorePatterns).toEqual(expect.arrayContaining(["linked", "linked/**"]));
  });

  it("3.7 does not ignore a build root", () => {
    expect(options.ignorePatterns).not.toContain("src");
    expect(options.ignorePatterns).not.toContain("src/**");
  });

  it("3.8 ignores .stryker-tmp/**", () => {
    expect(options.ignorePatterns).toContain(".stryker-tmp/**");
  });

  it("3.7 lists each ignore pattern once", () => {
    expect(new Set(options.ignorePatterns).size).toBe(options.ignorePatterns.length);
  });
});
