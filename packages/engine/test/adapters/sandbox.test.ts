import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Sandbox, withSandbox } from "../../src/adapters/sandbox.js";

let project: string;

const present = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "tot-sandbox-"));
  for (const dir of [
    "node_modules",
    ".git",
    ".trickortest/old",
    ".stryker-tmp",
    "reports",
    "src",
  ]) {
    await mkdir(join(project, dir), { recursive: true });
    await writeFile(join(project, dir, "f.txt"), dir);
  }
  await writeFile(join(project, "package.json"), "{}");
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

describe("Sandbox", () => {
  it("5.1 copies project files into .trickortest/sandboxes/<id> and excludes working folders", async () => {
    const created = await Sandbox.create(project, "m1", { outputDir: "reports" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const root = created.value.root;
    expect(root).toBe(join(project, ".trickortest", "sandboxes", "m1"));
    expect(await readFile(join(root, "src", "f.txt"), "utf8")).toBe("src");
    expect(await present(join(root, "package.json"))).toBe(true);
    for (const excluded of ["node_modules", ".git", ".trickortest", ".stryker-tmp", "reports"]) {
      expect(await present(join(root, excluded))).toBe(false);
    }
  });

  it("3.14 writes .trickortest/.gitignore containing *", async () => {
    await Sandbox.create(project, "m1");
    expect((await readFile(join(project, ".trickortest", ".gitignore"), "utf8")).trim()).toBe("*");
  });

  it("5.13 destroy removes the sandbox folder", async () => {
    const created = await Sandbox.create(project, "m1");
    if (!created.ok) throw new Error(created.error);
    expect(await present(created.value.root)).toBe(true);
    const destroyed = await Sandbox.destroy(created.value);
    expect(destroyed.ok).toBe(true);
    expect(await present(created.value.root)).toBe(false);
  });

  it("5.13 withSandbox removes the sandbox when fn throws", async () => {
    let seen = "";
    await expect(
      withSandbox(project, "m2", async (handle) => {
        seen = handle.root;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(seen).not.toBe("");
    expect(await present(seen)).toBe(false);
  });

  it("5.13 withSandbox returns fn's value and removes the sandbox", async () => {
    let seen = "";
    const result = await withSandbox(project, "m3", async (handle) => {
      seen = handle.root;
      return 42;
    });
    expect(result).toEqual({ ok: true, value: 42 });
    expect(await present(seen)).toBe(false);
  });
});
