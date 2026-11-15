import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  addedLines,
  commitMessages,
  formatFinding,
  messageLines,
  parsePatterns,
  pathLines,
  scan,
} from "./guard.ts";

const here = dirname(fileURLToPath(import.meta.url));
const guardScript = join(here, "guard.ts");
const publicPatterns = parsePatterns(
  readFileSync(join(here, "guard-patterns.txt"), "utf8"),
  "public",
);

function matchesPublic(text: string): boolean {
  return scan([{ where: "sample", text }], publicPatterns).length > 0;
}

describe("parsePatterns", () => {
  it("skips blank lines and comments and numbers the rest", () => {
    const patterns = parsePatterns("# comment\n\nfoo\n  bar  \n", "private");
    expect(patterns.map((p) => p.id)).toEqual(["private#1", "private#2"]);
    expect(patterns[1]?.regex.source).toBe("bar");
  });

  it("is case-insensitive unless the line starts with case:", () => {
    const [loose, strict] = parsePatterns("secret\ncase:\\bX1\\b", "private");
    expect(loose?.regex.test("SECRET")).toBe(true);
    expect(strict?.regex.test("x1")).toBe(false);
    expect(strict?.regex.test("X1")).toBe(true);
  });
});

describe("public patterns", () => {
  it.each([
    "see /home/alice/project/notes.md",
    'const p = "/Users/bob/work"',
    "C:\\Users\\carol\\repo",
    "Co-authored-by: Some Bot <noreply@example.com>",
    "Generated with [Some Tool](https://example.com)",
  ])("rejects %j", (text) => {
    expect(matchesPublic(text)).toBe(true);
  });

  it.each([
    "feat(engine): attribute kills per acceptance criterion",
    "Co-authored-by: Jane Doe <jane@example.com>",
    "Co-authored-by: Jane <123+jane@users.noreply.github.com>",
    "import { join } from 'node:path'",
    "visit https://example.com/homepage",
    "/tmp/project/src/index.ts",
  ])("accepts %j", (text) => {
    expect(matchesPublic(text)).toBe(false);
  });
});

describe("scan", () => {
  const privatePatterns = parsePatterns("forbiddenword", "private");

  it("exempts the pattern list from public patterns only", () => {
    const line = {
      where: "x",
      text: "/home/alice/ forbiddenword",
      file: "scripts/guard-patterns.txt",
    };
    const findings = scan([line], [...publicPatterns, ...privatePatterns]);
    expect(findings.map((f) => f.pattern.source)).toEqual(["private"]);
  });

  it("never prints private patterns", () => {
    const [finding] = scan([{ where: "a.ts:3", text: "forbiddenword" }], privatePatterns);
    expect(finding).toBeDefined();
    if (finding) expect(formatFinding(finding)).toBe("  a.ts:3  private#1");
  });
});

describe("messageLines", () => {
  it("drops git comments and everything below the scissors line", () => {
    const message = [
      "feat: add guard",
      "",
      "# Please enter the commit message",
      "# ------------------------ >8 ------------------------",
      "+ diff content /home/alice/x",
    ].join("\n");
    expect(messageLines(message, "msg").map((l) => l.text)).toEqual(["feat: add guard", ""]);
  });
});

describe("addedLines", () => {
  it("returns added lines with file and line number, ignoring headers and removals", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 111..222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -10,2 +10,3 @@ function f() {",
      "-const old = 1;",
      "+const kept = 1;",
      " context line",
      "+const added = 2;",
      "diff --git a/gone.ts b/gone.ts",
      "deleted file mode 100644",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-removed",
    ].join("\n");
    expect(addedLines(diff)).toEqual([
      { where: "src/a.ts:10", text: "const kept = 1;", file: "src/a.ts" },
      { where: "src/a.ts:12", text: "const added = 2;", file: "src/a.ts" },
    ]);
  });
});

describe("commitMessages and pathLines", () => {
  it("splits NUL-separated log output per commit", () => {
    const log = "aaaaaaaaaaaaaaaa\0feat: one\n\0bbbbbbbbbbbbbbbb\0fix: two\n\0";
    expect(commitMessages(log).map((l) => `${l.where}|${l.text}`)).toEqual([
      "commit aaaaaaaaaaaa:1|feat: one",
      "commit aaaaaaaaaaaa:2|",
      "commit bbbbbbbbbbbb:1|fix: two",
      "commit bbbbbbbbbbbb:2|",
    ]);
  });

  it("checks paths as text", () => {
    expect(pathLines(["docs/a.md"])).toEqual([
      { where: "path docs/a.md", text: "docs/a.md", file: "docs/a.md" },
    ]);
  });
});

describe("CLI", () => {
  let repo: string | undefined;

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
    repo = undefined;
  });

  function run(args: string[], env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [guardScript, ...args], {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...process.env,
        GUARD_PRIVATE_PATTERNS: "",
        GUARD_PRIVATE_PATTERNS_FILE: "/nonexistent",
        GUARD_REQUIRE_PRIVATE: "",
        ...env,
      },
    });
  }

  function newRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "guard-"));
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", ["config", "user.name", "Test Author"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    return dir;
  }

  it("blocks a staged file with a forbidden line and passes a clean one", () => {
    repo = newRepo();
    writeFileSync(join(repo, "clean.ts"), "export const ok = 1;\n");
    execFileSync("git", ["add", "clean.ts"], { cwd: repo });
    expect(run(["staged"]).status).toBe(0);

    writeFileSync(join(repo, "leak.md"), "notes in /home/alice/stuff\n");
    execFileSync("git", ["add", "leak.md"], { cwd: repo });
    const result = run(["staged"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("leak.md:1");
  });

  it("applies private patterns from the environment without echoing them", () => {
    repo = newRepo();
    const message = join(repo, "MSG");
    writeFileSync(message, "chore: mention zebracorn\n");
    const result = run(["message", message], { GUARD_PRIVATE_PATTERNS: "zebracorn" });
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("zebracorn");
  });

  it("checks the identity of the commit being created", () => {
    repo = newRepo();
    execFileSync("git", ["config", "user.email", "dev@zebracorn.example"], { cwd: repo });
    const message = join(repo, "MSG");
    writeFileSync(message, "chore: fine\n");
    const result = run(["message", message], { GUARD_PRIVATE_PATTERNS: "zebracorn" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("identity GIT_AUTHOR_IDENT");
  });

  it("checks author identities across a commit range", () => {
    repo = newRepo();
    const commit = (email: string, name: string) => {
      writeFileSync(join(repo as string, name), `${name}\n`);
      execFileSync("git", ["add", name], { cwd: repo });
      execFileSync(
        "git",
        [
          "-c",
          "commit.gpgsign=false",
          "-c",
          `user.email=${email}`,
          "commit",
          "-qm",
          `chore: ${name}`,
        ],
        { cwd: repo },
      );
    };
    commit("test@example.com", "first");
    commit("dev@zebracorn.example", "second");
    const result = run(["range", "HEAD~1", "HEAD"], { GUARD_PRIVATE_PATTERNS: "zebracorn" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/commit [0-9a-f]{12}:1 {2}private#1/);
  });

  it("fails when private patterns are required but missing", () => {
    repo = newRepo();
    const message = join(repo, "MSG");
    writeFileSync(message, "chore: fine\n");
    expect(run(["message", message], { GUARD_REQUIRE_PRIVATE: "1" }).status).toBe(2);
  });
});
