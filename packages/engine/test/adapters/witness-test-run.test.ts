import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProcessRunner } from "../../src/adapters/process-runner.js";
import { type SandboxHandle, withSandbox } from "../../src/adapters/sandbox.js";
import { applyMutation } from "../../src/core/mutation.js";
import type { CriterionId, SpecMutant, Witness } from "../../src/core/types.js";
import { buildWitnessTest } from "../../src/core/witness-test.js";

const pricing = join(import.meta.dirname, "..", "..", "..", "..", "examples", "pricing");
const repoRoot = join(pricing, "..", "..");
const vitestBin = join(repoRoot, "node_modules", "vitest", "vitest.mjs");
const tscBin = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
const WORK = ".trickortest/witness-test";

const loadMutant = async (name: string): Promise<SpecMutant> =>
  JSON.parse(
    await readFile(join(pricing, "mutants", "cart-pricing", `${name}.json`), "utf8"),
  ) as SpecMutant;

/** Writes the generated test, a Vitest config and a strict tsconfig under the sandbox work folder. */
const writeGenerated = async (
  sandbox: SandboxHandle,
  mutant: SpecMutant,
  witness: Witness = mutant.witness,
): Promise<void> => {
  const testFile = `${WORK}/${mutant.id}.test.ts`;
  const built = buildWitnessTest({
    witness,
    criterion: mutant.requirement as CriterionId,
    testFile,
  });
  if (!built.ok) throw new Error(built.error.message);
  await mkdir(join(sandbox.root, WORK), { recursive: true });
  await writeFile(join(sandbox.root, testFile), built.value);
  await writeFile(
    join(sandbox.root, WORK, "vitest.config.ts"),
    `export default { root: ${JSON.stringify(sandbox.root)}, test: { include: [${JSON.stringify(`${WORK}/*.test.ts`)}] } };\n`,
  );
  await writeFile(
    join(sandbox.root, WORK, "tsconfig.json"),
    JSON.stringify({
      extends: "../../tsconfig.json",
      compilerOptions: { strict: true, noEmit: true },
      include: ["./*.test.ts"],
    }),
  );
};

const runVitest = async (sandbox: SandboxHandle): Promise<number | null> => {
  const result = await ProcessRunner.run(
    process.execPath,
    [vitestBin, "run", "--config", join(sandbox.root, WORK, "vitest.config.ts")],
    { cwd: sandbox.root, timeoutMs: 120_000, maxOutputBytes: 1024 * 1024 },
  );
  return result.exitCode;
};

const runTsc = async (sandbox: SandboxHandle): Promise<{ code: number | null; output: string }> => {
  const result = await ProcessRunner.run(
    process.execPath,
    [tscBin, "-p", join(WORK, "tsconfig.json"), "--pretty", "false"],
    { cwd: sandbox.root, timeoutMs: 120_000, maxOutputBytes: 1024 * 1024 },
  );
  return { code: result.exitCode, output: `${result.stdout}\n${result.stderr}` };
};

const applyInSandbox = async (sandbox: SandboxHandle, mutant: SpecMutant): Promise<void> => {
  const path = join(sandbox.root, mutant.file);
  const applied = applyMutation(await readFile(path, "utf8"), mutant);
  if (!applied.ok) throw new Error(`mutant ${mutant.id} does not apply`);
  await writeFile(path, applied.value.mutated);
};

describe("generated witness test", () => {
  it("12.2 a test built from an expected Witness passes on the original and fails with its mutant", async () => {
    const mutant = await loadMutant("oath-5.5-discount-exceeds-subtotal");
    expect("expected" in mutant.witness).toBe(true);
    const run = await withSandbox(pricing, "witness-run-expected", async (sandbox) => {
      await writeGenerated(sandbox, mutant);
      const original = await runVitest(sandbox);
      await applyInSandbox(sandbox, mutant);
      const mutated = await runVitest(sandbox);
      return { original, mutated };
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.value.original).toBe(0);
    expect(run.value.mutated).toBe(1);
  }, 240_000);

  it("12.3 a test built from an expectedError Witness passes on the original and fails with its mutant", async () => {
    const mutant = await loadMutant("oath-3.1-quantity-upper-bound");
    expect("expectedError" in mutant.witness).toBe(true);
    const run = await withSandbox(pricing, "witness-run-error", async (sandbox) => {
      await writeGenerated(sandbox, mutant);
      const original = await runVitest(sandbox);
      await applyInSandbox(sandbox, mutant);
      const mutated = await runVitest(sandbox);
      return { original, mutated };
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.value.original).toBe(0);
    expect(run.value.mutated).toBe(1);
  }, 240_000);

  it("12.2 the generated files type-check in strict mode, also when args do not match the parameter type", async () => {
    const withValue = await loadMutant("oath-5.5-discount-exceeds-subtotal");
    const withError = await loadMutant("oath-3.1-quantity-upper-bound");
    const mismatched: Witness = {
      from: "src/index.ts",
      export: "priceCart",
      args: ["not a cart", 7, { lines: "nope" }],
      expected: null,
    };
    const run = await withSandbox(pricing, "witness-run-types", async (sandbox) => {
      const results: { code: number | null; output: string }[] = [];
      for (const [mutant, witness] of [
        [withValue, withValue.witness],
        [withError, withError.witness],
        [{ ...withValue, id: "oath-5.5-mismatched-args" } as SpecMutant, mismatched],
      ] as const) {
        await writeGenerated(sandbox, mutant, witness);
      }
      results.push(await runTsc(sandbox));
      return results;
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.value[0]?.output.trim()).toBe("");
    expect(run.value[0]?.code).toBe(0);
  }, 240_000);
});
