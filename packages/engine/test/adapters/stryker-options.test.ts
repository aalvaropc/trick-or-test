import { describe, expect, it } from "vitest";
import { buildStrykerOptions } from "../../src/adapters/stryker-adapter.js";

const base = { typescriptVersion: "6.0.2" };

describe("buildStrykerOptions", () => {
  it("3.1 enables incremental mode, the JSON reporter and disableBail", () => {
    const options = buildStrykerOptions(base);
    expect(options.incremental).toBe(true);
    expect(options.reporters).toEqual(["json"]);
    expect(options.disableBail).toBe(true);
    expect(options.testRunner).toBe("vitest");
  });

  it("3.2 lists the Vitest runner in plugins", () => {
    expect(buildStrykerOptions(base).plugins).toContain("@stryker-mutator/vitest-runner");
  });

  it("3.3 sets a nonexistent tsconfigFile for TypeScript 7 and 8", () => {
    for (const typescriptVersion of ["7.0.0", "7.1.3-beta.1", "8.0.0"]) {
      const tsconfig = buildStrykerOptions({ typescriptVersion }).tsconfigFile;
      expect(tsconfig).toBeDefined();
      expect(tsconfig).toMatch(/^\.trickortest\//);
    }
  });

  it("3.4 leaves tsconfigFile unset for TypeScript older than 7", () => {
    for (const typescriptVersion of ["5.9.3", "6.0.2", "6.99.0"]) {
      expect("tsconfigFile" in buildStrykerOptions({ typescriptVersion })).toBe(false);
    }
  });

  it("3.14 keeps every Stryker output path under .trickortest/", () => {
    const options = buildStrykerOptions(base);
    for (const path of [
      options.incrementalFile,
      options.jsonReporter.fileName,
      options.tempDirName,
    ]) {
      expect(path.startsWith(".trickortest/")).toBe(true);
    }
  });

  it("3.9 builds one file:start-end mutate pattern for a single range", () => {
    const options = buildStrykerOptions({
      ...base,
      changedRanges: [{ file: "src/a.ts", start: 3, end: 7 }],
    });
    expect(options.mutate).toEqual(["src/a.ts:3-7"]);
  });

  it("3.9 builds one pattern per range, in order, for several ranges", () => {
    const options = buildStrykerOptions({
      ...base,
      changedRanges: [
        { file: "src/a.ts", start: 3, end: 7 },
        { file: "src/a.ts", start: 20, end: 20 },
        { file: "src/b.ts", start: 1, end: 4 },
      ],
    });
    expect(options.mutate).toEqual(["src/a.ts:3-7", "src/a.ts:20-20", "src/b.ts:1-4"]);
  });

  it("3.9 leaves mutate unset without a git ref", () => {
    expect("mutate" in buildStrykerOptions(base)).toBe(false);
  });

  it("3.7 excludes a symlinked directory as an entry and as a subtree", () => {
    const options = buildStrykerOptions({ ...base, nonBuildDirs: ["./linked-docs/", "coverage"] });
    expect(options.ignorePatterns).toEqual(
      expect.arrayContaining(["linked-docs", "linked-docs/**", "coverage", "coverage/**"]),
    );
  });

  it("3.8 excludes every file under .stryker-tmp", () => {
    const options = buildStrykerOptions(base);
    expect(options.ignorePatterns).toEqual(
      expect.arrayContaining([".stryker-tmp/**", "**/.stryker-tmp/**"]),
    );
  });

  it("3.1 sets ignoreStatic only on the retry", () => {
    expect("ignoreStatic" in buildStrykerOptions(base)).toBe(false);
    expect("ignoreStatic" in buildStrykerOptions({ ...base, ignoreStatic: false })).toBe(false);
    expect(buildStrykerOptions({ ...base, ignoreStatic: true }).ignoreStatic).toBe(true);
  });
});
