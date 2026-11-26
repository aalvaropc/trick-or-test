import { afterEach, describe, expect, it } from "vitest";
import { createProcessRunner } from "../../src/adapters/process-runner.js";

const PARENT_ONLY = "TRICKORTEST_PARENT_ONLY_VAR";
const script = `process.stdout.write(JSON.stringify({ marker: process.env.MARKER ?? null, parent: process.env.${PARENT_ONLY} ?? null }))`;

afterEach(() => {
  delete process.env[PARENT_ONLY];
});

describe("ProcessRunner env", () => {
  it("3.21 a child started with env sees only the given variables", async () => {
    process.env[PARENT_ONLY] = "from-parent";
    const runner = createProcessRunner();
    const result = await runner.run(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, MARKER: "x" },
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ marker: "x", parent: null });
  });

  it("3.21 a child started without env inherits the parent's variables", async () => {
    process.env[PARENT_ONLY] = "from-parent";
    const runner = createProcessRunner();
    const result = await runner.run(process.execPath, ["-e", script], { cwd: process.cwd() });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ marker: null, parent: "from-parent" });
  });
});
