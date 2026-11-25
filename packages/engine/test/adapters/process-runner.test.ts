import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProcessRunner } from "../../src/adapters/process-runner.js";

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitFor = async (check: () => Promise<boolean> | boolean, limitMs = 10_000) => {
  const started = Date.now();
  while (Date.now() - started < limitMs) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A child that starts a grandchild, writes the grandchild pid to `file`, then idles. */
const parentScript = (file: string): string => `
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync(${JSON.stringify(file)}, String(grandchild.pid));
setInterval(() => {}, 1000);
`;

describe("process runner", () => {
  it("9.15 a child that spawns a grandchild is stopped together with it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trickortest-runner-"));
    dirs.push(dir);
    const pidFile = join(dir, "grandchild.pid");
    const runner = createProcessRunner({ graceMs: 200 });
    const running = runner.run(process.execPath, ["-e", parentScript(pidFile)], { cwd: dir });
    expect(
      await waitFor(() =>
        readFile(pidFile, "utf8").then(
          (t) => t !== "",
          () => false,
        ),
      ),
    ).toBe(true);
    const grandchildPid = Number(await readFile(pidFile, "utf8"));
    expect(isAlive(grandchildPid)).toBe(true);
    expect(runner.liveCount()).toBe(1);

    await runner.killAll("SIGTERM");
    const result = await running;

    expect(result.signal).toBe("SIGTERM");
    expect(await waitFor(() => !isAlive(grandchildPid))).toBe(true);
    expect(runner.liveCount()).toBe(0);
  });

  it("9.15 killAll escalates to SIGKILL for a child that ignores the signal", async () => {
    const runner = createProcessRunner({ graceMs: 100 });
    const script = `process.on("SIGTERM", () => {}); console.log("ready"); setInterval(() => {}, 1000);`;
    const running = runner.run(process.execPath, ["-e", script], { cwd: tmpdir() });
    expect(await waitFor(() => runner.liveCount() === 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    await runner.killAll("SIGTERM");
    const result = await running;
    expect(result.signal).toBe("SIGKILL");
  });

  it("9.15 killAll with no child does nothing", async () => {
    const runner = createProcessRunner();
    await expect(runner.killAll("SIGTERM")).resolves.toBeUndefined();
    expect(runner.liveCount()).toBe(0);
  });

  it("9.15 a finished child leaves the registry", async () => {
    const runner = createProcessRunner();
    const result = await runner.run(process.execPath, ["-e", `console.log("hi")`], {
      cwd: tmpdir(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hi");
    expect(runner.liveCount()).toBe(0);
  });

  it("9.15 the timeout kills the whole group", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trickortest-runner-"));
    dirs.push(dir);
    const pidFile = join(dir, "grandchild.pid");
    const runner = createProcessRunner({ graceMs: 100 });
    const result = await runner.run(process.execPath, ["-e", parentScript(pidFile)], {
      cwd: dir,
      timeoutMs: 700,
    });
    expect(result.timedOut).toBe(true);
    const grandchildPid = Number(await readFile(pidFile, "utf8"));
    expect(await waitFor(() => !isAlive(grandchildPid))).toBe(true);
    expect(runner.liveCount()).toBe(0);
  });

  it("9.15 a missing command reports a spawn error and leaves the registry", async () => {
    const runner = createProcessRunner();
    const result = await runner.run("trickortest-no-such-command", [], { cwd: tmpdir() });
    expect(result.spawnError).toBeDefined();
    expect(runner.liveCount()).toBe(0);
  });
});
