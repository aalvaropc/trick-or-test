import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entry = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/report/index.ts");

const SPECIFIER =
  /\b(?:import|export)\b[^"';]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

type Graph = { files: string[]; specifiers: string[] };

const walk = (start: string): Graph => {
  const files = new Set<string>();
  const specifiers: string[] = [];
  const visit = (file: string): void => {
    if (files.has(file)) return;
    files.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(SPECIFIER)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (spec === undefined) continue;
      specifiers.push(spec);
      if (spec.startsWith(".")) visit(resolve(dirname(file), spec.replace(/\.js$/, ".ts")));
    }
  };
  visit(start);
  return { files: [...files], specifiers };
};

const builtins = new Set(builtinModules.map((m) => m.replace(/^node:/, "")));

describe("report subpath import graph", () => {
  const graph = walk(entry);

  it("10.4 no module reachable from src/report/index.ts imports a node: module or a Node builtin", () => {
    const offending = graph.specifiers.filter(
      (s) => s.startsWith("node:") || builtins.has(s.split("/")[0] ?? s),
    );
    expect(offending).toEqual([]);
  });

  it("10.1 core/mutant-id.ts is not reachable from src/report/index.ts", () => {
    expect(graph.files.some((f) => f.endsWith("/core/mutant-id.ts"))).toBe(false);
    expect(graph.files.length).toBeGreaterThan(1);
  });
});
