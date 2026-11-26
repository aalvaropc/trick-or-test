import { describe, expect, it } from "vitest";
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

### Requirement 2: Shipping rules
#### Acceptance Criteria
1. THE Cart SHALL ship free.
`;
const DUPLICATE = `${REQUIREMENTS}
### Requirement 1: Pricing again
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
const SOURCE = "export const f = (a: number) => a < 10;\n";
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

const harness = (requirements: string) => {
  const files = new Map<string, string>([
    [`${ROOT}/.kiro/specs/demo/requirements.md`, requirements],
    [`${ROOT}/mutants/demo/oath-1.1-boundary.json`, MUTANT],
    [`${ROOT}/src/f.ts`, SOURCE],
  ]);
  const errOut: string[] = [];
  let suiteCalls = 0;
  const isDir = (path: string): boolean => [...files.keys()].some((f) => f.startsWith(`${path}/`));
  const deps: CliDeps = {
    cwd: CWD,
    stdout: () => {},
    stderr: (text) => errOut.push(text),
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
    },
    suite: {
      async run() {
        suiteCalls += 1;
        return ok({
          durationMs: 10,
          files: [
            { path: "test/a.test.ts", tests: [{ name: "a", status: "passed", startLine: 1 }] },
          ],
        });
      },
    },
    mechanical: {
      async run() {
        return ok({ mutants: [], testFiles: {}, ignoreStaticRetried: false });
      },
    },
    git: {
      async diff() {
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
  return { deps, files, errOut: () => errOut.join(""), suiteCalls: () => suiteCalls };
};

describe("small fields carried by the pipeline", () => {
  it("8.25 metadata.specName equals the chosen spec", async () => {
    const h = harness(REQUIREMENTS);
    expect(await runCli(["run", "--project", ROOT], h.deps)).toBe(0);
    const verdict = JSON.parse(h.files.get(`${ROOT}/reports/verdict.json`) as string);
    expect(verdict.metadata.specName).toBe("demo");
  });

  it("8.26 requirements has one entry per requirement heading, in document order", async () => {
    const h = harness(REQUIREMENTS);
    await runCli(["run", "--project", ROOT], h.deps);
    const verdict = JSON.parse(h.files.get(`${ROOT}/reports/verdict.json`) as string);
    expect(verdict.requirements).toEqual([
      { requirement: 1, title: "Pricing" },
      { requirement: 2, title: "Shipping rules" },
    ]);
  });

  it("8.27 the last history line has coverageByCriterion equal to the verdict coverage", async () => {
    const h = harness(REQUIREMENTS);
    await runCli(["run", "--project", ROOT], h.deps);
    const verdict = JSON.parse(h.files.get(`${ROOT}/reports/verdict.json`) as string);
    const lines = (h.files.get(`${ROOT}/reports/history.jsonl`) as string).trim().split("\n");
    const record = JSON.parse(lines.at(-1) as string);
    expect(verdict.coverage.map((c: { criterion: string }) => c.criterion)).toEqual([
      "1.1",
      "1.2",
      "2.1",
    ]);
    expect(record.coverageByCriterion).toEqual(
      verdict.coverage.map((c: { criterion: string; status: string }) => ({
        criterion: c.criterion,
        status: c.status,
      })),
    );
  });

  it("2.10 a duplicate requirement number stops the run before the baseline with exit code 1", async () => {
    const h = harness(DUPLICATE);
    expect(await runCli(["run", "--project", ROOT], h.deps)).toBe(1);
    expect(h.suiteCalls()).toBe(0);
    expect(h.errOut()).toContain("duplicate requirement 1");
    expect(h.files.has(`${ROOT}/reports/verdict.json`)).toBe(false);
  });
});
