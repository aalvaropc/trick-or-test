import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Git } from "../../src/adapters/git-adapter.js";
import { gitCommit } from "../../src/cli/main.js";
import { withoutGitLocation } from "../../src/core/git-env.js";

let root: string;
let target: string;
let decoy: string;
let targetCommit: string;
let decoyCommit: string;

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: withoutGitLocation(process.env) });

const makeRepo = async (dir: string, file: string, committed: string, changed: string) => {
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "commit.gpgsign", "false");
  await writeFile(join(dir, file), `${committed}\n`);
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", `init ${committed}`);
  await writeFile(join(dir, file), `${changed}\n`);
  return git(dir, "rev-parse", "HEAD").trim();
};

const snapshot = async (dir: string): Promise<Record<string, string>> => {
  const read = async (path: string): Promise<string> => (await readFile(path)).toString("base64");
  return {
    head: await read(join(dir, ".git", "HEAD")),
    config: await read(join(dir, ".git", "config")),
    index: await read(join(dir, ".git", "index")),
    tree: await read(join(dir, "decoy.txt")),
  };
};

const withEnv = async (vars: Record<string, string>, body: () => Promise<void>) => {
  const saved: Record<string, string | undefined> = {};
  for (const name of Object.keys(vars)) saved[name] = process.env[name];
  Object.assign(process.env, vars);
  try {
    await body();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "git-adapter-env-"));
  target = join(root, "target");
  decoy = join(root, "decoy");
  await mkdir(target);
  await mkdir(decoy);
  targetCommit = await makeRepo(target, "target.txt", "target-old", "target-new");
  decoyCommit = await makeRepo(decoy, "decoy.txt", "decoy-old", "decoy-new");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("Git adapter with GIT_DIR in the environment", () => {
  it("3.21 setup makes the two repositories differ", () => {
    expect(targetCommit).not.toBe(decoyCommit);
  });

  it("3.21 Git.diff returns the Target_Project diff when GIT_DIR names another repository", async () => {
    await withEnv({ GIT_DIR: join(decoy, ".git") }, async () => {
      const result = await Git.diff("HEAD", target);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toContain("+++ b/target.txt");
      expect(result.value).toContain("+target-new");
      expect(result.value).not.toContain("decoy");
    });
  });

  it("3.21 Git.currentCommit returns the Target_Project commit when GIT_DIR names another repository", async () => {
    await withEnv({ GIT_DIR: join(decoy, ".git") }, async () => {
      expect(await Git.currentCommit(target)).toEqual({ ok: true, value: targetCommit });
    });
  });

  it("3.9 the rev-parse call of cli/main returns the Target_Project commit when GIT_DIR names another repository", async () => {
    await withEnv({ GIT_DIR: join(decoy, ".git") }, async () => {
      expect(await gitCommit(target)).toBe(targetCommit);
    });
  });

  it("3.21 GIT_DIR with GIT_WORK_TREE does not redirect Git.diff or Git.currentCommit", async () => {
    await withEnv({ GIT_DIR: join(decoy, ".git"), GIT_WORK_TREE: decoy }, async () => {
      const diff = await Git.diff("HEAD", target);
      expect(diff.ok).toBe(true);
      if (!diff.ok) return;
      expect(diff.value).toContain("+++ b/target.txt");
      expect(diff.value).not.toContain("decoy");
      expect(await Git.currentCommit(target)).toEqual({ ok: true, value: targetCommit });
      expect(await gitCommit(target)).toBe(targetCommit);
    });
  });

  it("3.21 the decoy HEAD, config, index and working tree are byte-identical afterwards", async () => {
    const before = await snapshot(decoy);
    await withEnv({ GIT_DIR: join(decoy, ".git"), GIT_WORK_TREE: decoy }, async () => {
      await Git.diff("HEAD", target);
      await Git.currentCommit(target);
      await gitCommit(target);
    });
    expect(await snapshot(decoy)).toEqual(before);
    expect(git(decoy, "rev-parse", "HEAD").trim()).toBe(decoyCommit);
  });

  it("3.21 the environment variables are restored after the test body", async () => {
    const before = process.env.GIT_DIR;
    await withEnv({ GIT_DIR: join(decoy, ".git") }, async () => {});
    expect(process.env.GIT_DIR).toBe(before);
  });
});
