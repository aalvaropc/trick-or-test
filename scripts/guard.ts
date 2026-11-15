/**
 * Commit guard: rejects commit messages and changes that match forbidden patterns.
 *
 * Usage:
 *   node scripts/guard.ts message <file>     check a commit message file (commit-msg hook)
 *   node scripts/guard.ts staged             check staged paths and added lines (pre-commit hook)
 *   node scripts/guard.ts range <base> <head> check commits and changes in base..head (CI)
 *   node scripts/guard.ts history            check every commit reachable from any ref
 *
 * Patterns come from scripts/guard-patterns.txt (public) and, when configured, from a private
 * list: the GUARD_PRIVATE_PATTERNS variable, the file named by GUARD_PRIVATE_PATTERNS_FILE, or
 * ~/.config/trick-or-test/private-patterns.txt. Private patterns and matched text are never
 * printed, so CI logs stay safe to publish.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type PatternSource = "public" | "private";

export interface Pattern {
  readonly id: string;
  readonly source: PatternSource;
  readonly regex: RegExp;
}

export interface Line {
  readonly where: string;
  readonly text: string;
  readonly file?: string;
}

export interface Finding {
  readonly where: string;
  readonly pattern: Pattern;
}

/** Files that legitimately contain public patterns: the list itself and its tests. */
const PUBLIC_EXEMPT: ReadonlySet<string> = new Set([
  "scripts/guard-patterns.txt",
  "scripts/guard.test.ts",
]);

const SCISSORS = /^# -+ >8 -+$/;

export function parsePatterns(text: string, source: PatternSource): Pattern[] {
  const patterns: Pattern[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const caseSensitive = line.startsWith("case:");
    const body = caseSensitive ? line.slice("case:".length) : line;
    patterns.push({
      id: `${source}#${patterns.length + 1}`,
      source,
      regex: new RegExp(body, caseSensitive ? "" : "i"),
    });
  }
  return patterns;
}

export function scan(lines: readonly Line[], patterns: readonly Pattern[]): Finding[] {
  const findings: Finding[] = [];
  for (const line of lines) {
    for (const pattern of patterns) {
      const exempt =
        pattern.source === "public" && line.file !== undefined && PUBLIC_EXEMPT.has(line.file);
      if (!exempt && pattern.regex.test(line.text)) {
        findings.push({ where: line.where, pattern });
      }
    }
  }
  return findings;
}

/** Lines of a commit message, without git comments or the verbose diff below the scissors. */
export function messageLines(message: string, label: string): Line[] {
  const lines: Line[] = [];
  const all = message.split(/\r?\n/);
  for (const [index, text] of all.entries()) {
    if (SCISSORS.test(text)) break;
    if (text.startsWith("#")) continue;
    lines.push({ where: `${label}:${index + 1}`, text });
  }
  return lines;
}

/** Added lines of a unified diff (any context size), with their file and new line number. */
export function addedLines(diff: string): Line[] {
  const lines: Line[] = [];
  let file: string | undefined;
  let inHeader = false;
  let lineNumber = 0;
  for (const text of diff.split("\n")) {
    if (text.startsWith("diff --git ")) {
      inHeader = true;
      file = undefined;
      continue;
    }
    if (inHeader) {
      if (text.startsWith("+++ ")) {
        file = text.startsWith("+++ b/") ? text.slice("+++ b/".length) : undefined;
        continue;
      }
      if (!text.startsWith("@@")) continue;
      inHeader = false;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      lineNumber = Number(hunk[1]);
      continue;
    }
    if (file === undefined) continue;
    if (text.startsWith("+")) {
      lines.push({ where: `${file}:${lineNumber}`, text: text.slice(1), file });
      lineNumber += 1;
    } else if (text.startsWith(" ")) {
      lineNumber += 1;
    }
  }
  return lines;
}

export function pathLines(paths: readonly string[]): Line[] {
  return paths.map((path) => ({ where: `path ${path}`, text: path, file: path }));
}

/** `git log` format: hash, then author and committer identities followed by the message. */
const LOG_FORMAT = "--format=%H%x00Author: %an <%ae>%nCommitter: %cn <%ce>%n%B%x00";

/** Splits `git log` output in LOG_FORMAT (NUL-separated hash and body) into lines per commit. */
export function commitMessages(log: string): Line[] {
  const parts = log.split("\0");
  const lines: Line[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const sha = (parts[i] ?? "").trim();
    lines.push(...messageLines(parts[i + 1] ?? "", `commit ${sha.slice(0, 12)}`));
  }
  return lines;
}

export function formatFinding(finding: Finding): string {
  const shown = finding.pattern.source === "public" ? ` ${finding.pattern.regex.source}` : "";
  return `  ${finding.where}  ${finding.pattern.id}${shown}`;
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

function nulList(output: string): string[] {
  return output.split("\0").filter((entry) => entry !== "");
}

/** Author and committer of the commit being created, without the timestamp. */
function pendingIdentities(): Line[] {
  return (["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"] as const).map((variable) => ({
    where: `identity ${variable}`,
    text: git(["var", variable]).replace(/\s+\d+\s+[+-]\d{4}\s*$/, ""),
  }));
}

function loadPublicPatterns(): Pattern[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return parsePatterns(readFileSync(join(here, "guard-patterns.txt"), "utf8"), "public");
}

function loadPrivatePatterns(): Pattern[] {
  const inline = process.env.GUARD_PRIVATE_PATTERNS;
  if (inline !== undefined && inline.trim() !== "") return parsePatterns(inline, "private");
  const file =
    process.env.GUARD_PRIVATE_PATTERNS_FILE ??
    join(homedir(), ".config", "trick-or-test", "private-patterns.txt");
  return existsSync(file) ? parsePatterns(readFileSync(file, "utf8"), "private") : [];
}

function collect(mode: string, args: readonly string[]): Line[] {
  const diffFlags = ["-U0", "--no-color", "--no-ext-diff", "--diff-filter=ACMR"];
  switch (mode) {
    case "message": {
      const file = args[0];
      if (file === undefined) throw new Error("usage: guard.ts message <file>");
      return [
        ...pendingIdentities(),
        ...messageLines(readFileSync(file, "utf8"), "commit message"),
      ];
    }
    case "staged":
      return [
        ...pathLines(nulList(git(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]))),
        ...addedLines(git(["diff", "--cached", ...diffFlags])),
      ];
    case "range": {
      const [base, head] = args;
      if (base === undefined || head === undefined) {
        throw new Error("usage: guard.ts range <base> <head>");
      }
      return [
        ...commitMessages(git(["log", LOG_FORMAT, `${base}..${head}`])),
        ...pathLines(
          nulList(git(["diff", "--name-only", "-z", "--diff-filter=ACMR", `${base}...${head}`])),
        ),
        ...addedLines(git(["diff", ...diffFlags, `${base}...${head}`])),
      ];
    }
    case "history":
      return [
        ...commitMessages(git(["log", "--all", LOG_FORMAT])),
        ...pathLines([
          ...new Set(nulList(git(["log", "--all", "--name-only", "-z", "--format="]))),
        ]),
        ...addedLines(git(["log", "--all", "-p", "--format=", ...diffFlags])),
      ];
    default:
      throw new Error(`unknown mode "${mode}". Use message, staged, range or history.`);
  }
}

export function main(argv: readonly string[]): number {
  const [mode, ...args] = argv;
  if (mode === undefined) {
    console.error("usage: guard.ts <message|staged|range|history> [args]");
    return 2;
  }
  const privatePatterns = loadPrivatePatterns();
  if (privatePatterns.length === 0) {
    if (process.env.GUARD_REQUIRE_PRIVATE === "1") {
      console.error("guard: private patterns are required here but none are configured.");
      return 2;
    }
    console.warn("guard: no private patterns configured; checking public patterns only.");
  }
  const findings = scan(collect(mode, args), [...loadPublicPatterns(), ...privatePatterns]);
  if (findings.length === 0) return 0;
  console.error(
    `guard: ${findings.length} forbidden match(es). Rewrite the message or the change:`,
  );
  for (const finding of findings) console.error(formatFinding(finding));
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
