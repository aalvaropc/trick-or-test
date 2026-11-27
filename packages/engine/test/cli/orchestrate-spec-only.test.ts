import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SuiteResult } from "../../src/adapters/vitest-suite-runner.js";
import { type CliDeps, runCli } from "../../src/cli/main.js";
import { err, ok } from "../../src/core/result.js";
import type { RunMetadata } from "../../src/core/types.js";

const CWD = "/work";
const ROOT = "/work/proj";
const REQUIREMENTS = `# Requirements
### Requirement 1: Pricing
#### Acceptance Criteria
1. THE Cart SHALL compare below ten.
2. THE Cart SHALL say something else.
`;
const MUTANT = JSON.stringify({
  id: "oath-1.1-boundary",
  requirement: "1.1",
  file: "src/f.ts",
  original: "a < 10",
  mutated: "a <= 10",
  why: "boundary",
  witness: { from: "src/f.ts", export: "f", args: [10], expected: false },
});
const TEST_FILE = [
  "// Feature: demo",
  "// Validates: Requirements 1.1",
  'it("a", () => {',
  "  expect(1).toBe(1);",
  "});",
  "",
].join("\n");
const metadata: RunMetadata = {
  gitCommit: "abc",
  seed: 0,
  engineVersion: "0.0.0",
  nodeVersion: "v24",
  strykerVersion: "10.1.1",
  vitestVersion: "5.1.0",
  typescriptVersion: "7.0.2",
  timestamp: "2026-01-01T00:00:00.000Z",
};
const passing: SuiteResult = {
  durationMs: 10,
  files: [{ path: "test/a.test.ts", tests: [{ name: "a", status: "passed", startLine: 3 }] }],
};
const failing: SuiteResult = {
  durationMs: 10,
  files: [{ path: "test/a.test.ts", tests: [{ name: "a", status: "failed", startLine: 3 }] }],
};

const harness = () => {
  const files = new Map<string, string>([
    [`${ROOT}/.kiro/specs/demo/requirements.md`, REQUIREMENTS],
    [`${ROOT}/mutants/demo/oath-1.1-boundary.json`, MUTANT],
    [`${ROOT}/src/f.ts`, "export const f = (a: number) => a < 10;\n"],
    [`${ROOT}/test/a.test.ts`, TEST_FILE],
  ]);
  const out: string[] = [];
  const calls = { stryker: 0, git: 0, listEntries: 0, suite: 0, witness: 0 };
  const isDir = (path: string): boolean => [...files.keys()].some((f) => f.startsWith(`${path}/`));
  const deps: CliDeps = {
    cwd: CWD,
    stdout: (text) => out.push(text),
    stderr: () => {},
    fs: {
      async readFile(path) {
        const original = path.replace(/\/\.trickortest\/sandboxes\/[^/]+/, "");
        const text = files.get(path) ?? files.get(original);
        return text === undefined ? err(`ENOENT ${path}`) : ok(text);
      },
      async exists(path) {
        return files.has(path) || isDir(path);
      },
      async listDir(path) {
        if (!isDir(path)) return err("ENOENT");
        const names = new Set<string>();
        for (const f of files.keys()) {
          if (f.startsWith(`${path}/`)) names.add(f.slice(path.length + 1).split("/")[0] as string);
        }
        return ok([...names]);
      },
      async writeFile(path, content) {
        files.set(path, content);
        return ok(undefined);
      },
      async listEntries() {
        calls.listEntries += 1;
        return [];
      },
    },
    suite: {
      async run() {
        calls.suite += 1;
        // The first run is the Baseline_Run; the mutant runs fail so the mutant is killed.
        return ok(calls.suite === 1 ? passing : failing);
      },
    },
    mechanical: {
      async run() {
        calls.stryker += 1;
        return ok({ mutants: [], testFiles: {}, ignoreStaticRetried: false });
      },
    },
    git: {
      async diff() {
        calls.git += 1;
        return ok("");
      },
    },
    sandbox: () => ({
      async create(_root, id) {
        return ok({ root: `${ROOT}/.trickortest/sandboxes/${id}` });
      },
      async destroy() {
        return ok(undefined);
      },
    }),
    typecheck: {
      async run() {
        return ok(undefined);
      },
    },
    witness: {
      async run(root, witnesses) {
        calls.witness += 1;
        const pristine = root.endsWith("/pristine");
        return ok(
          Object.fromEntries(
            witnesses.map((w) => [w.id, ok({ kind: "value" as const, value: !pristine })]),
          ),
        );
      },
    },
    metadata: async () => metadata,
  };
  const read = (name: string): unknown =>
    JSON.parse(files.get(`${ROOT}/reports/${name}`) ?? "null");
  return { deps, calls, out: () => out.join(""), read, files };
};

describe("spec-only pipeline", () => {
  it("9.18 neither the Stryker adapter nor git nor the project listing is called", async () => {
    const h = harness();
    expect(await runCli(["run", "--project", ROOT, "--scope", "spec-only"], h.deps)).toBe(0);
    expect(h.calls.stryker).toBe(0);
    expect(h.calls.git).toBe(0);
    expect(h.calls.listEntries).toBe(0);
  });

  it("9.18 the Baseline_Run and every Spec_Mutant ran", async () => {
    const h = harness();
    await runCli(["run", "--project", ROOT, "--scope", "spec-only"], h.deps);
    // Baseline_Run plus the suite run of the one Spec_Mutant.
    expect(h.calls.suite).toBe(2);
    expect(h.calls.witness).toBe(2);
    const verdict = h.read("verdict.json") as { mutants: { id: string; status: string }[] };
    expect(verdict.mutants.map((m) => [m.id, m.status])).toEqual([["oath-1.1-boundary", "Killed"]]);
  });

  it("9.18 the three files carry the scope, no strykerCounts and no stray", async () => {
    const h = harness();
    await runCli(["run", "--project", ROOT, "--scope", "spec-only"], h.deps);
    const verdict = h.read("verdict.json") as {
      metadata: { scope?: string };
      strykerCounts?: unknown;
      mutants: { species: string }[];
    };
    expect(verdict.metadata.scope).toBe("spec-only");
    expect(verdict.strykerCounts).toBeUndefined();
    expect(verdict.mutants.every((m) => m.species === "Oathbreaker")).toBe(true);
    const report = h.read("mutation-report.json") as { config: { scope?: string } };
    expect(report.config.scope).toBe("spec-only");
    const history = (h.files.get(`${ROOT}/reports/history.jsonl`) ?? "").trim().split("\n");
    expect(history).toHaveLength(1);
    expect((JSON.parse(history[0] as string) as { scope?: string }).scope).toBe("spec-only");
  });

  it("11.15 the claims equal those of a full run on the same fakes", async () => {
    const specOnly = harness();
    await runCli(["run", "--project", ROOT, "--scope", "spec-only"], specOnly.deps);
    const full = harness();
    await runCli(["run", "--project", ROOT, "--scope", "full"], full.deps);
    const a = specOnly.read("verdict.json") as { baselineTests?: unknown; claimCounts?: unknown };
    const b = full.read("verdict.json") as { baselineTests?: unknown; claimCounts?: unknown };
    expect(a.claimCounts).toBeDefined();
    expect(a.claimCounts).toEqual(b.claimCounts);
    expect(a.baselineTests).toEqual(b.baselineTests);
  });

  it("9.21 the summary holds the scope and `not run` and no stray count", async () => {
    const h = harness();
    await runCli(["run", "--project", ROOT, "--scope", "spec-only"], h.deps);
    const text = h.out();
    expect(text).toContain("spec-only");
    expect(text).toContain("not run");
    expect(text).not.toMatch(/Strays: \d/);
    expect(text).not.toMatch(/stryker/i);
  });

  it("9.18 a full run on the same fakes still calls the Stryker adapter", async () => {
    const h = harness();
    expect(await runCli(["run", "--project", ROOT, "--scope", "full"], h.deps)).toBe(0);
    expect(h.calls.stryker).toBe(1);
    expect(h.out()).toMatch(/Strays: \d/);
    expect(h.out()).not.toContain("not run");
  });

  it("9.22 the npm scripts measure and demo have no --scope", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.measure).toBeDefined();
    expect(pkg.scripts.demo).toBeDefined();
    expect(pkg.scripts.measure).not.toContain("--scope");
    expect(pkg.scripts.demo).not.toContain("--scope");
  });
});
