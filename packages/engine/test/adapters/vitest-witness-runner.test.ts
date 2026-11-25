import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withSandbox } from "../../src/adapters/sandbox.js";
import { SuiteRunner } from "../../src/adapters/vitest-suite-runner.js";
import { type WitnessInput, WitnessRunner } from "../../src/adapters/vitest-witness-runner.js";
import type { MutantId } from "../../src/core/types.js";

const project = join(import.meta.dirname, "..", "fixtures", "witness-runner");
const id = (value: string): MutantId => value as MutantId;

const witnesses: WitnessInput[] = [
  {
    id: id("oath-1.1-value"),
    witness: { from: "src/calc", export: "quadruple", args: [3], expected: 12 },
  },
  {
    id: id("oath-1.2-error"),
    witness: {
      from: "src/calc.ts",
      export: "mustBePositive",
      args: [0],
      expectedError: "NotPositiveError",
    },
  },
  {
    id: id("oath-1.3-broken"),
    witness: { from: "src/broken", export: "broken", args: [], expected: null },
  },
];

describe("WitnessRunner.run", () => {
  it("5.4 reads a returned value and a thrown error class from the outcome files", async () => {
    const run = await withSandbox(project, "witness-values", async (sandbox) =>
      WitnessRunner.run(sandbox.root, witnesses.slice(0, 2), { timeLimitMs: 60_000 }),
    );
    expect(run.ok).toBe(true);
    if (!run.ok || !run.value.ok) return;
    expect(run.value.value[id("oath-1.1-value")]).toEqual({
      ok: true,
      value: { kind: "value", value: 12 },
    });
    expect(run.value.value[id("oath-1.2-error")]).toEqual({
      ok: true,
      value: { kind: "error", className: "NotPositiveError" },
    });
  });

  it("5.5 reports a witness whose import fails without an outcome", async () => {
    const run = await withSandbox(project, "witness-broken", async (sandbox) =>
      WitnessRunner.run(sandbox.root, witnesses, { timeLimitMs: 60_000 }),
    );
    expect(run.ok).toBe(true);
    if (!run.ok || !run.value.ok) return;
    const results = run.value.value;
    expect(results[id("oath-1.1-value")]?.ok).toBe(true);
    const broken = results[id("oath-1.3-broken")];
    expect(broken?.ok).toBe(false);
    if (broken && !broken.ok) expect(broken.error.kind).toBe("NoOutcome");
  });

  it("5.6 writes the generated files under .trickortest/witnesses of the sandbox", async () => {
    const files = await withSandbox(project, "witness-files", async (sandbox) => {
      await WitnessRunner.run(sandbox.root, witnesses.slice(0, 1), { timeLimitMs: 60_000 });
      const { readdir } = await import("node:fs/promises");
      return readdir(join(sandbox.root, ".trickortest", "witnesses"));
    });
    expect(files.ok).toBe(true);
    if (!files.ok) return;
    expect(files.value).toEqual(
      expect.arrayContaining([
        "oath-1.1-value.witness.test.ts",
        "oath-1.1-value.outcome.json",
        "vitest.config.ts",
      ]),
    );
  });

  it("5.16 reports a hanging witness as a timeout and keeps the other outcomes", async () => {
    const hanging: WitnessInput = {
      id: id("oath-1.4-hang"),
      witness: { from: "src/hang", export: "hang", args: [], expected: 1 },
    };
    const run = await withSandbox(project, "witness-hang", async (sandbox) =>
      WitnessRunner.run(sandbox.root, [witnesses[0] as WitnessInput, hanging], {
        timeLimitMs: 60_000,
        witnessTimeLimitMs: 1_000,
      }),
    );
    expect(run.ok).toBe(true);
    if (!run.ok || !run.value.ok) return;
    const results = run.value.value;
    expect(results[id("oath-1.1-value")]).toEqual({
      ok: true,
      value: { kind: "value", value: 12 },
    });
    const outcome = results[id("oath-1.4-hang")];
    expect(outcome?.ok).toBe(true);
    if (outcome?.ok) expect(outcome.value.kind).toBe("timeout");
  });

  it("5.16 gives a message without absolute paths when the import fails", async () => {
    const run = await withSandbox(project, "witness-broken-message", async (sandbox) => ({
      root: sandbox.root,
      result: await WitnessRunner.run(sandbox.root, witnesses, { timeLimitMs: 60_000 }),
    }));
    expect(run.ok).toBe(true);
    if (!run.ok || !run.value.result.ok) return;
    const broken = run.value.result.value[id("oath-1.3-broken")];
    expect(broken?.ok).toBe(false);
    if (!broken || broken.ok) return;
    expect(broken.error.message.length).toBeGreaterThan(0);
    expect(broken.error.message).not.toContain(run.value.root);
    expect(run.value.result.value[id("oath-1.2-error")]).toEqual({
      ok: true,
      value: { kind: "error", className: "NotPositiveError" },
    });
  });

  it("5.7 keeps the generated files out of the target's own suite run", async () => {
    const suite = await withSandbox(project, "witness-suite", async (sandbox) => {
      await WitnessRunner.run(sandbox.root, witnesses.slice(0, 1), { timeLimitMs: 60_000 });
      return SuiteRunner.run(sandbox.root, { timeLimitMs: 60_000 });
    });
    expect(suite.ok).toBe(true);
    if (!suite.ok || !suite.value.ok) return;
    expect(suite.value.value.files.map((file) => file.path)).toEqual(["test/calc.test.ts"]);
  });
});
