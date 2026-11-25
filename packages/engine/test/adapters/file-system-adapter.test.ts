import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileSystem } from "../../src/adapters/file-system-adapter.js";

const fsa = createFileSystem();
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "tot-fs-"));
});

afterEach(async () => {
  await chmod(join(root, "readonly"), 0o755).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
});

const seedTree = async (base: string): Promise<void> => {
  await mkdir(join(base, "src", "node_modules"), { recursive: true });
  await mkdir(join(base, "node_modules"), { recursive: true });
  await mkdir(join(base, "out", "keep"), { recursive: true });
  await mkdir(join(base, "keep", "out"), { recursive: true });
  await writeFile(join(base, "a.txt"), "a");
  await writeFile(join(base, "src", "b.txt"), "b");
  await writeFile(join(base, "src", "node_modules", "c.txt"), "c");
  await writeFile(join(base, "node_modules", "d.txt"), "d");
  await writeFile(join(base, "out", "keep", "e.txt"), "e");
  await writeFile(join(base, "keep", "out", "f.txt"), "f");
};

describe("FileSystem adapter", () => {
  it("8.11 writes a file, creating missing parents, and reads it back", async () => {
    const path = join(root, "a", "b", "file.txt");
    expect((await fsa.writeFile(path, "hello")).ok).toBe(true);
    expect(await fsa.readFile(path)).toEqual({ ok: true, value: "hello" });
  });

  it("8.11 read error names the path", async () => {
    const path = join(root, "missing.txt");
    const result = await fsa.readFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`Cannot read ${path}:`);
  });

  it("10.2 copyDir skips excluded names at any depth", async () => {
    const src = join(root, "src-tree");
    const dest = join(root, "dest");
    await seedTree(src);
    expect((await fsa.copyDir(src, dest, ["node_modules"])).ok).toBe(true);
    expect(await fsa.exists(join(dest, "a.txt"))).toBe(true);
    expect(await fsa.exists(join(dest, "src", "b.txt"))).toBe(true);
    expect(await fsa.exists(join(dest, "node_modules"))).toBe(false);
    expect(await fsa.exists(join(dest, "src", "node_modules"))).toBe(false);
  });

  it("10.2 copyDir skips excluded paths relative to the source only", async () => {
    const src = join(root, "src-tree");
    const dest = join(root, "dest");
    await seedTree(src);
    expect((await fsa.copyDir(src, dest, ["out/keep"])).ok).toBe(true);
    expect(await fsa.exists(join(dest, "out", "keep"))).toBe(false);
    expect(await fsa.exists(join(dest, "keep", "out", "f.txt"))).toBe(true);
  });

  it("10.2 copyDir without excludes copies everything", async () => {
    const src = join(root, "src-tree");
    const dest = join(root, "dest");
    await seedTree(src);
    expect((await fsa.copyDir(src, dest)).ok).toBe(true);
    expect(await fsa.exists(join(dest, "node_modules", "d.txt"))).toBe(true);
  });

  it("10.2 copyDir error names the source path", async () => {
    const src = join(root, "nope");
    const result = await fsa.copyDir(src, join(root, "dest"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(src);
  });

  it("10.2 removeDir deletes a tree and tolerates a missing one", async () => {
    const dir = join(root, "tree");
    await seedTree(dir);
    expect((await fsa.removeDir(dir)).ok).toBe(true);
    expect(await fsa.exists(dir)).toBe(false);
    expect((await fsa.removeDir(dir)).ok).toBe(true);
  });

  it("10.2 exists reports files, directories and absent paths", async () => {
    await writeFile(join(root, "f.txt"), "x");
    expect(await fsa.exists(join(root, "f.txt"))).toBe(true);
    expect(await fsa.exists(root)).toBe(true);
    expect(await fsa.exists(join(root, "absent"))).toBe(false);
  });

  it("8.11 write into a read-only directory returns an error naming the path", async () => {
    const dir = join(root, "readonly");
    await mkdir(dir);
    await chmod(dir, 0o555);
    const path = join(dir, "out.json");
    const result = await fsa.writeFile(path, "{}");
    if (process.getuid?.() === 0) return; // root ignores permission bits
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`Cannot write ${path}:`);
    expect(await readdir(dir)).toEqual([]);
  });
});
