import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileSystem, type FileSystem } from "../../src/adapters/file-system-adapter.js";
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

describe("Sandbox copy plan", () => {
  it("5.18 a link to a directory outside the project is skipped and nothing outside is written", async () => {
    const outside = await mkdtemp(join(tmpdir(), "tot-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "secret");
      await symlink(outside, join(project, "src", "out-link"));
      const warnings: string[] = [];
      const created = await Sandbox.create(project, "s1", { warn: (m) => warnings.push(m) });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const linkInSandbox = join(created.value.root, "src", "out-link");
      expect(await present(linkInSandbox)).toBe(false);
      expect(await readdir(outside)).toEqual(["secret.txt"]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("src/out-link");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("5.18 a link inside the project is recreated as a relative link that works in the Sandbox", async () => {
    await mkdir(join(project, "lib"), { recursive: true });
    await writeFile(join(project, "lib", "real.txt"), "real");
    await symlink(join(project, "lib"), join(project, "src", "lib-link"));
    const created = await Sandbox.create(project, "s2");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const link = join(created.value.root, "src", "lib-link");
    expect(await readlink(link)).toBe("../lib");
    expect(await readFile(join(link, "real.txt"), "utf8")).toBe("real");
    await writeFile(join(link, "new.txt"), "x");
    expect(await present(join(created.value.root, "lib", "new.txt"))).toBe(true);
    expect(await present(join(project, "lib", "new.txt"))).toBe(false);
  });

  it("5.17 a path that escapes the Sandbox returns an error and leaves no Sandbox", async () => {
    const real = createFileSystem();
    const fs: FileSystem = {
      ...real,
      listEntries: async () => [{ path: "../escaped.txt", kind: "file" }],
    };
    const created = await Sandbox.create(project, "s3", { fs });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error).toContain("../escaped.txt");
    expect(await present(join(project, ".trickortest", "sandboxes", "s3"))).toBe(false);
    expect(await present(join(project, ".trickortest", "sandboxes", "escaped.txt"))).toBe(false);
    expect(await present(join(project, ".trickortest", "escaped.txt"))).toBe(false);
  });
});
