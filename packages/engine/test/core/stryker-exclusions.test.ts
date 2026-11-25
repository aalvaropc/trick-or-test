import { describe, expect, it } from "vitest";
import type { ProjectEntry } from "../../src/core/sandbox-plan.js";
import { computeStrykerExclusions } from "../../src/core/stryker-exclusions.js";

const dir = (path: string): ProjectEntry => ({ path, kind: "dir" });
const file = (path: string): ProjectEntry => ({ path, kind: "file" });
const link = (path: string, target: string): ProjectEntry => ({ path, kind: "symlink", target });

const typical: ProjectEntry[] = [
  dir("src"),
  file("src/index.ts"),
  dir("test"),
  file("test/a.test.ts"),
  dir("docs"),
  file("docs/readme.md"),
  dir("scripts"),
  file("package.json"),
];

describe("computeStrykerExclusions", () => {
  it("3.7 lists every top-level directory that is not a build root", () => {
    const result = computeStrykerExclusions(typical, ["src", "test"], "reports");
    expect(result.nonBuildDirs).toEqual(["docs", "scripts"]);
    expect(result.symlinkedDirs).toEqual([]);
    expect(result.ignorePatterns).toEqual([
      ".stryker-tmp/**",
      ".trickortest/**",
      "docs/**",
      "reports/**",
      "scripts/**",
    ]);
  });

  it("3.7 never lists a build root or a nested directory", () => {
    const listing = [...typical, dir("src/deep"), dir("docs/inner")];
    const result = computeStrykerExclusions(listing, ["src", "test"], "reports");
    expect(result.nonBuildDirs).not.toContain("src");
    expect(result.nonBuildDirs).not.toContain("test");
    expect(result.nonBuildDirs).not.toContain("src/deep");
    expect(result.nonBuildDirs).not.toContain("docs/inner");
    expect(result.ignorePatterns).not.toContain("src/**");
  });

  it("3.7 lists a symlink whose target is a directory", () => {
    const listing = [...typical, dir("shared"), link("src/shared", "shared")];
    const result = computeStrykerExclusions(listing, ["src", "test"], "reports");
    expect(result.symlinkedDirs).toEqual(["src/shared"]);
    expect(result.ignorePatterns).toContain("src/shared/**");
  });

  it("3.7 does not list a symlink to a file", () => {
    const listing = [...typical, file("config.json"), link("src/config.json", "config.json")];
    const result = computeStrykerExclusions(listing, ["src", "test"], "reports");
    expect(result.symlinkedDirs).toEqual([]);
    expect(result.ignorePatterns).not.toContain("src/config.json/**");
  });

  it("3.8 always ignores .stryker-tmp and .trickortest, even for an empty listing", () => {
    const result = computeStrykerExclusions([], [], "reports");
    expect(result.nonBuildDirs).toEqual([]);
    expect(result.ignorePatterns).toEqual([".stryker-tmp/**", ".trickortest/**", "reports/**"]);
  });

  it("3.8 de-duplicates a directory that is both non-build and the output directory", () => {
    const result = computeStrykerExclusions(
      [dir("reports"), dir(".trickortest")],
      ["src"],
      "reports",
    );
    expect(result.ignorePatterns).toEqual([".stryker-tmp/**", ".trickortest/**", "reports/**"]);
  });

  it("3.8 gives the same output when the input order changes", () => {
    const listing = [...typical, dir("shared"), link("src/shared", "shared")];
    const forward = computeStrykerExclusions(listing, ["src", "test"], "reports");
    const backward = computeStrykerExclusions([...listing].reverse(), ["test", "src"], "reports");
    expect(backward).toEqual(forward);
  });
});
