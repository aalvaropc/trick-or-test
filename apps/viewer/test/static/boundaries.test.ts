import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const viewerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = join(viewerRoot, "src");

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SOURCE_EXTENSIONS.has(extname(full))) out.push(full);
  }
  return out.sort();
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** Module specifiers from static imports, re-exports, dynamic imports and require calls. */
function specifiersOf(text: string): string[] {
  const code = stripComments(text);
  const patterns = [
    /\b(?:import|export)\s[^"'`;]*?\sfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) found.push(match[1] as string);
  }
  return found;
}

const files = walk(srcRoot).map((file) => ({
  file,
  rel: relative(viewerRoot, file).split("\\").join("/"),
  text: readFileSync(file, "utf8"),
}));

const nodeBuiltins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  const bare = specifier.split("/")[0] as string;
  return nodeBuiltins.has(specifier) || nodeBuiltins.has(bare);
}

function resolvesToTsx(fromFile: string, specifier: string): boolean {
  if (!specifier.startsWith(".")) return false;
  if (specifier.endsWith(".tsx")) return true;
  const target = resolve(dirname(fromFile), specifier);
  return existsSync(`${target}.tsx`) || existsSync(join(target, "index.tsx"));
}

describe("viewer static boundaries", () => {
  it("12.8 only .tsx files import react, react-dom or a .tsx module", () => {
    const offenders: string[] = [];
    for (const { file, rel, text } of files) {
      if (extname(file) === ".tsx") continue;
      for (const spec of specifiersOf(text)) {
        const isReact =
          spec === "react" ||
          spec.startsWith("react/") ||
          spec === "react-dom" ||
          spec.startsWith("react-dom/");
        if (isReact || resolvesToTsx(file, spec)) offenders.push(`${rel} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("12.2 no file imports a Node built-in module", () => {
    const offenders: string[] = [];
    for (const { rel, text } of files) {
      for (const spec of specifiersOf(text)) {
        if (isNodeBuiltin(spec)) offenders.push(`${rel} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("12.2 the only trick-or-test specifier is trick-or-test/report, never a path into packages/engine", () => {
    const offenders: string[] = [];
    for (const { rel, text } of files) {
      for (const spec of specifiersOf(text)) {
        if (spec.startsWith("trick-or-test") && spec !== "trick-or-test/report") {
          offenders.push(`${rel} imports ${spec}`);
        }
        if (/packages[\\/]engine/.test(spec)) offenders.push(`${rel} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("12.9 dangerouslySetInnerHTML appears in exactly one file, src/bestiary/Creature.tsx", () => {
    const users = files
      .filter(({ text }) => text.includes("dangerouslySetInnerHTML"))
      .map(({ rel }) => rel);
    expect(users).toEqual(["src/bestiary/Creature.tsx"]);
  });

  it("12.9 dangerouslySetInnerHTML wraps a creature( call and nothing else", () => {
    const source = files.find(({ rel }) => rel === "src/bestiary/Creature.tsx")?.text ?? "";
    const uses = [...source.matchAll(/dangerouslySetInnerHTML\s*=\s*\{\{([^}]*)\}\}/g)];
    expect(uses).toHaveLength(1);
    expect((uses[0]?.[1] ?? "").trim()).toMatch(/^__html:\s*(?:withSize\(\s*)?creature\(/);
  });
});
