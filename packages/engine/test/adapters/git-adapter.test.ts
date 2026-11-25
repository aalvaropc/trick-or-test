import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatChangedRange, Git } from "../../src/adapters/git-adapter.js";

let repo: string;

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" });

const lines = (count: number): string =>
  `${Array.from({ length: count }, (_, i) => `line ${i + 1}`).join("\n")}\n`;

const ranges = async (ref: string): Promise<string[]> => {
  const result = await Git.changedRanges(ref, repo);
  if (!result.ok) throw new Error(result.error);
  return result.value.map(formatChangedRange);
};

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "tot-git-"));
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  await writeFile(join(repo, "a.txt"), lines(20));
  git("add", ".");
  git("commit", "-q", "-m", "init");
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("Git adapter", () => {
  it("3.9 reports one changed range as file:start-end", async () => {
    await writeFile(join(repo, "a.txt"), lines(20).replace("line 5\n", "changed 5\n"));
    expect(await ranges("HEAD")).toEqual(["a.txt:5-5"]);
  });

  it("3.9 reports several ranges in one file", async () => {
    const text = lines(20)
      .replace("line 3\n", "changed 3\nextra\nextra 2\n")
      .replace("line 15\n", "changed 15\n");
    await writeFile(join(repo, "a.txt"), text);
    expect(await ranges("HEAD")).toEqual(["a.txt:3-5", "a.txt:17-17"]);
  });

  it("3.9 reports no range for a hunk that only deletes lines", async () => {
    await writeFile(join(repo, "a.txt"), lines(20).replace("line 7\n", ""));
    expect(await ranges("HEAD")).toEqual([]);
  });

  it("3.10 returns an empty list when nothing changed", async () => {
    expect(await ranges("HEAD")).toEqual([]);
  });

  it("3.9 returns an error for an unknown ref", async () => {
    const result = await Git.changedRanges("no-such-ref", repo);
    expect(result.ok).toBe(false);
  });

  it("3.9 rejects a ref that looks like an option", async () => {
    const result = await Git.changedRanges("--output=/tmp/x", repo);
    expect(result.ok).toBe(false);
  });

  it("3.9 returns the current commit hash", async () => {
    const result = await Git.currentCommit(repo);
    expect(result).toEqual({ ok: true, value: git("rev-parse", "HEAD").trim() });
  });
});
