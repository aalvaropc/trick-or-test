import { describe, expect, it } from "vitest";
import type { CompileError } from "../../src/adapters/typecheck-adapter.js";
import type { SuiteError, SuiteResult } from "../../src/adapters/vitest-suite-runner.js";
import type { WitnessFailure, WitnessRunError } from "../../src/adapters/vitest-witness-runner.js";
import {
  type LoadedProject,
  runSpecMutants,
  type SpecMutantAdapters,
} from "../../src/cli/orchestrate.js";
import { err, ok, type Result } from "../../src/core/result.js";
import type { CriterionId, MutantId, SpecMutant } from "../../src/core/types.js";
import type { WitnessOutcome } from "../../src/core/witness-compare.js";

const ROOT = "/proj";
const SOURCE = "export const f = (a: number) => a < 10;\n";

const project: LoadedProject = {
  config: {
    specDir: `${ROOT}/.kiro/specs`,
    sourceGlobs: ["src/**/*.ts"],
    testGlobs: ["test/**/*.test.ts"],
    propertyTestGlobs: ["test/**/*.property.test.ts"],
    mutantsDir: `${ROOT}/mutants`,
    outputDir: `${ROOT}/reports`,
  },
  specs: [],
};

const specMutant = (id: string, over: Partial<SpecMutant> = {}): SpecMutant => ({
  id: id as MutantId,
  requirement: "1.1" as CriterionId,
  file: "src/f.ts",
  original: "a < 10",
  mutated: "a <= 10",
  why: "boundary",
  witness: { from: "src/f.ts", export: "f", args: [10], expected: false },
  ...over,
});

const value = (v: unknown): WitnessOutcome => ({ kind: "value", value: v });

type Setup = {
  /** Witness outcome on the original code, by mutant id. Default: `false`. */
  original?: Record<string, WitnessOutcome>;
  /** Witness outcome on the mutated code, by mutant id. Default: `true`. */
  mutated?: Record<string, WitnessOutcome>;
  typecheck?: Result<void, CompileError>;
  mutatedWitnessError?: WitnessRunError;
  suite?: Result<SuiteResult, SuiteError>;
  suiteThrows?: boolean;
  source?: string;
};

const fakes = (setup: Setup = {}) => {
  const created: string[] = [];
  const destroyed: string[] = [];
  const suiteLimits: number[] = [];
  const typechecked: string[] = [];
  const written = new Map<string, string>();
  const files: Record<string, string> = {
    "src/f.ts": setup.source ?? SOURCE,
    "test/a.test.ts": 'it("example", () => {\n  expect(f(10)).toBe(false);\n});\n',
    "test/b.property.test.ts": 'it("prop", () => {\n  expect(1).toBe(1);\n});\n',
  };
  const adapters: SpecMutantAdapters = {
    fs: {
      async readFile(path) {
        const text = written.get(path) ?? files[path.replace(/^.*\/sandboxes\/[^/]+\//, "")];
        return text === undefined ? err(`ENOENT ${path}`) : ok(text);
      },
      async writeFile(path, content) {
        written.set(path, content);
        return ok(undefined);
      },
    },
    sandbox: {
      async create(projectRoot, id) {
        created.push(id);
        return ok({ root: `${projectRoot}/.trickortest/sandboxes/${id}` });
      },
      async destroy(handle) {
        destroyed.push(handle.root.split("/").pop() as string);
        return ok(undefined);
      },
    },
    typecheck: {
      async run(root) {
        typechecked.push(root);
        return setup.typecheck ?? ok(undefined);
      },
    },
    witness: {
      async run(root, witnesses) {
        const pristine = root.endsWith("/pristine");
        if (!pristine && setup.mutatedWitnessError !== undefined) {
          return err(setup.mutatedWitnessError);
        }
        const out: Record<string, Result<WitnessOutcome, WitnessFailure>> = {};
        for (const w of witnesses) {
          out[w.id] = ok(
            pristine
              ? (setup.original?.[w.id] ?? value(false))
              : (setup.mutated?.[w.id] ?? value(true)),
          );
        }
        return ok(out);
      },
    },
    suite: {
      async run(_root, options) {
        suiteLimits.push(options.timeLimitMs);
        if (setup.suiteThrows) throw new Error("runner crashed");
        return (
          setup.suite ??
          ok({
            durationMs: 5,
            files: [
              {
                path: "test/a.test.ts",
                tests: [{ name: "example", status: "passed", startLine: 1 }],
              },
            ],
          })
        );
      },
    },
  };
  return { adapters, created, destroyed, suiteLimits, typechecked };
};

const run = (mutants: SpecMutant[], f: ReturnType<typeof fakes>, baselineMs = 1000) =>
  runSpecMutants({ project: ROOT }, project, mutants, { baselineMs }, f.adapters);

const failingSuite = (tests: { file: string; name: string }[]): Result<SuiteResult, SuiteError> =>
  ok({
    durationMs: 5,
    files: tests.map((t) => ({
      path: t.file,
      tests: [{ name: t.name, status: "failed" as const, startLine: 1 }],
    })),
  });

describe("spec mutant stage", () => {
  it("5.2 NotApplicable when original does not appear exactly once", async () => {
    const f = fakes({ source: "export const f = (a: number) => a < 10 || a < 10;\n" });
    const result = await run([specMutant("oath-1.1-a")], f);
    expect(result.ok && result.value[0]?.result.status).toBe("NotApplicable");
    expect(f.suiteLimits).toEqual([]);
    expect(f.destroyed).toContain("oath-1.1-a");
  });

  it("5.3 CompileError when the sandbox does not type-check", async () => {
    const f = fakes({ typecheck: err({ kind: "CompileError", firstError: "error TS2322: bad" }) });
    const result = await run([specMutant("oath-1.1-a")], f);
    expect(result.ok && result.value[0]?.result.status).toBe("CompileError");
    expect(result.ok && result.value[0]?.message).toBe("error TS2322: bad");
    expect(f.suiteLimits).toEqual([]);
  });

  it("5.6 InvalidWitness reports the expected and the original outcome", async () => {
    const f = fakes({ original: { "oath-1.1-a": value(true) } });
    const m = specMutant("oath-1.1-a");
    const result = await run([m], f);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [o] = result.value;
    expect(o?.result.status).toBe("InvalidWitness");
    expect(o?.mutant.witness).toMatchObject({ expected: false });
    expect(o?.originalOutcome).toEqual(value(true));
    expect(f.suiteLimits).toEqual([]);
  });

  it("5.7 Ghost when the mutated code gives the same outcome", async () => {
    const f = fakes({ mutated: { "oath-1.1-a": value(false) } });
    const result = await run([specMutant("oath-1.1-a")], f);
    expect(result.ok && result.value[0]?.result.status).toBe("Ghost");
    expect(f.suiteLimits).toEqual([]);
  });

  it("5.9 Killed with the failing tests and the kill class (6.2)", async () => {
    const f = fakes({
      suite: failingSuite([
        { file: "test/a.test.ts", name: "example" },
        { file: "test/b.property.test.ts", name: "prop" },
      ]),
    });
    const result = await run([specMutant("oath-1.1-a")], f);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.result).toMatchObject({
      status: "Killed",
      species: "Oathbreaker",
      requirement: "1.1",
      killClass: "both",
      killingTests: ["test/a.test.ts::example", "test/b.property.test.ts::prop"],
    });
  });

  it("5.10 Survived when every test passes", async () => {
    const f = fakes();
    const result = await run([specMutant("oath-1.1-a")], f);
    expect(result.ok && result.value[0]?.result.status).toBe("Survived");
    expect(result.ok && result.value[0]?.result.killClass).toBeUndefined();
  });

  it("5.11 Timeout when the suite exceeds the limit, and 5.15 the limit comes from the baseline", async () => {
    const f = fakes({ suite: err({ kind: "Timeout", limitMs: 6500 }) });
    const result = await run([specMutant("oath-1.1-a")], f, 1000);
    expect(result.ok && result.value[0]?.result.status).toBe("Timeout");
    expect(result.ok && result.value[0]?.result.killClass).toBeUndefined();
    expect(f.suiteLimits).toEqual([6500]);
  });

  it("5.13 a crash in the suite runner still removes the sandbox", async () => {
    const f = fakes({ suiteThrows: true });
    const result = await run([specMutant("oath-1.1-a")], f);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ kind: "crash", mutant: "oath-1.1-a" });
    expect(f.created).toEqual(["pristine", "oath-1.1-a"]);
    expect(f.destroyed.sort()).toEqual(["oath-1.1-a", "pristine"]);
  });

  it("5.1 each mutant runs in its own sandbox, removed after the run, in id order", async () => {
    const f = fakes();
    const result = await run([specMutant("oath-1.1-b"), specMutant("oath-1.1-a")], f);
    expect(result.ok && result.value.map((o) => o.result.id)).toEqual(["oath-1.1-a", "oath-1.1-b"]);
    expect(f.created).toEqual(["pristine", "oath-1.1-a", "oath-1.1-b"]);
    expect(f.destroyed.sort()).toEqual(["oath-1.1-a", "oath-1.1-b", "pristine"]);
  });

  it("5.14 gives the same status on two runs", async () => {
    const mutants = [specMutant("oath-1.1-a"), specMutant("oath-1.1-b")];
    const first = await run(mutants, fakes());
    const second = await run(mutants, fakes());
    const statuses = (r: typeof first) => (r.ok ? r.value.map((o) => o.result.status) : []);
    expect(statuses(first)).toEqual(["Survived", "Survived"]);
    expect(statuses(second)).toEqual(statuses(first));
  });
});

describe("spec mutant stage, file-level failures", () => {
  const fileLevelFailure = (file: string): Result<SuiteResult, SuiteError> =>
    ok({
      durationMs: 5,
      files: [
        { path: file, tests: [{ name: file, status: "failed" as const, startLine: 0 }] },
        {
          path: "test/a.test.ts",
          tests: [{ name: "example", status: "passed" as const, startLine: 1 }],
        },
      ],
    });

  it("5.9 Killed with the file path as killing test when a test file fails at import", async () => {
    const f = fakes({ suite: fileLevelFailure("test/broken.test.ts") });
    const result = await run([specMutant("oath-1.1-a")], f);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.result.status).toBe("Killed");
    expect(result.value[0]?.result.killingTests).toEqual(["test/broken.test.ts"]);
  });

  it("5.10 Survived when the suite run has no failure", async () => {
    const f = fakes();
    const result = await run([specMutant("oath-1.1-a")], f);
    expect(result.ok && result.value[0]?.result.status).toBe("Survived");
    expect(result.ok && result.value[0]?.result.killingTests).toEqual([]);
  });
});
