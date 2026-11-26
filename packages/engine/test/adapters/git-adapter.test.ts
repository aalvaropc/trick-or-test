import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Git } from "../../src/adapters/git-adapter.js";
import { withoutGitLocation } from "../../src/core/git-env.js";

const SCRATCH_ROOT = join(fileURLToPath(new URL("../../../../", import.meta.url)), ".trickortest");

// Monorepo layout: the git repository root holds `app/` (the Target_Project) and `sibling/`.
let repo: string;
let project: string;

const git = (...args: string[]): string =>
  execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: withoutGitLocation(process.env),
  });

const lines = (count: number): string =>
  `${Array.from({ length: count }, (_, i) => `line ${i + 1}`).join("\n")}\n`;

const diff = async (ref: string): Promise<string> => {
  const result = await Git.diff(ref, project);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

beforeEach(async () => {
  await mkdir(SCRATCH_ROOT, { recursive: true });
  repo = await mkdtemp(join(SCRATCH_ROOT, "git-adapter-"));
  project = join(repo, "app");
  await mkdir(join(project, "src"), { recursive: true });
  await mkdir(join(repo, "sibling"), { recursive: true });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  await writeFile(join(project, "src", "a.ts"), lines(20));
  await writeFile(join(repo, "sibling", "b.ts"), lines(20));
  git("add", ".");
  git("commit", "-q", "-m", "init");
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("Git adapter", () => {
  it("3.9 a change inside the project gives a project-relative path", async () => {
    await writeFile(join(project, "src", "a.ts"), lines(20).replace("line 5\n", "changed 5\n"));
    const text = await diff("HEAD");
    expect(text).toContain("+++ b/src/a.ts\n");
    expect(text).toContain("@@ -5 +5 @@");
    expect(text).not.toContain("app/");
  });

  it("3.9 a change in a sibling directory does not appear", async () => {
    await writeFile(join(repo, "sibling", "b.ts"), lines(20).replace("line 5\n", "changed 5\n"));
    await writeFile(join(project, "src", "a.ts"), lines(20).replace("line 9\n", "changed 9\n"));
    const text = await diff("HEAD");
    expect(text).toContain("src/a.ts");
    expect(text).not.toContain("b.ts");
    expect(text).not.toContain("sibling");
  });

  it("3.10 returns an empty text when nothing changed", async () => {
    expect(await diff("HEAD")).toBe("");
  });

  it("3.10 returns an empty text when only a sibling directory changed", async () => {
    await writeFile(join(repo, "sibling", "b.ts"), lines(20).replace("line 5\n", "changed 5\n"));
    expect(await diff("HEAD")).toBe("");
  });

  it("3.9 returns an error for an unknown ref", async () => {
    const result = await Git.diff("no-such-ref", project);
    expect(result.ok).toBe(false);
  });

  it("3.9 rejects a ref that looks like an option", async () => {
    const result = await Git.diff("--output=/tmp/x", project);
    expect(result.ok).toBe(false);
  });

  it("3.9 returns the current commit hash", async () => {
    const result = await Git.currentCommit(project);
    expect(result).toEqual({ ok: true, value: git("rev-parse", "HEAD").trim() });
  });
});
