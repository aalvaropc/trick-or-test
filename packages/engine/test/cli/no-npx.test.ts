import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("../../src", import.meta.url).pathname;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(dir, entry.name)]
        : [],
  );

/** Lines that use `npx` in code (comments skipped) without `--no-install` within 2 lines. */
const bareNpxCalls = (text: string): number[] => {
  const lines = text.split("\n");
  const found: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    if (!/\bnpx\b/.test(line)) return;
    const window = lines.slice(index, index + 3).join("\n");
    if (!window.includes("--no-install")) found.push(index + 1);
  });
  return found;
};

describe("no npx without --no-install", () => {
  it("3.18 the scanner flags a bare npx call", () => {
    expect(bareNpxCalls('spawn("npx", ["stryker", "run"]);')).toEqual([1]);
  });

  it("3.18 the scanner accepts npx with --no-install", () => {
    expect(bareNpxCalls('command: "npx",\nargs: ["--no-install", "stryker"],')).toEqual([]);
  });

  it("3.18 no file in src/ calls npx without --no-install", () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      bareNpxCalls(readFileSync(file, "utf8")).map((line) => `${file}:${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
