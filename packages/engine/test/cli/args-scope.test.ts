import { describe, expect, it } from "vitest";
import { parseArgs, USAGE_TEXT } from "../../src/cli/args.js";
import { scopeOf } from "../../src/core/run-scope.js";

const CWD = "/work/dir";

const parsed = (argv: string[]) => {
  const result = parseArgs(argv, CWD);
  if (!result.ok) throw new Error(`expected ok, got ${result.error.message}`);
  return result.value;
};

const failure = (argv: string[]) => {
  const result = parseArgs(argv, CWD);
  if (result.ok) throw new Error("expected a usage error");
  return result.error;
};

describe("CLI --scope option", () => {
  it.each(["run", "measure"])("9.17 %s without --scope uses full", (command) => {
    expect(scopeOf(parsed([command]))).toBe("full");
  });

  it.each(["run", "measure"])("9.17 %s accepts --scope full", (command) => {
    expect(scopeOf(parsed([command, "--scope", "full"]))).toBe("full");
  });

  it.each(["run", "measure"])("9.17 %s accepts --scope spec-only", (command) => {
    expect(scopeOf(parsed([command, "--scope", "spec-only"]))).toBe("spec-only");
  });

  it.each(["run", "measure"])("9.20 %s rejects a third scope value", (command) => {
    const error = failure([command, "--scope", "mechanical"]);
    expect(error.kind).toBe("usage");
    expect(error.message).toContain("mechanical");
  });

  it("9.20 the usage text describes --scope", () => {
    const line = USAGE_TEXT.split("\n").find((l) => l.trim().startsWith("--scope"));
    expect(line).toContain("<full|spec-only>");
  });

  it.each(["run", "measure"])("9.19 %s rejects --scope spec-only with --since", (command) => {
    const error = failure([command, "--scope", "spec-only", "--since", "main"]);
    expect(error.message).toContain("--scope");
    expect(error.message).toContain("--since");
  });

  it("9.19 rejects --since before --scope spec-only too", () => {
    const error = failure(["run", "--since", "main", "--scope", "spec-only"]);
    expect(error.message).toContain("--scope");
    expect(error.message).toContain("--since");
  });

  it("9.19 accepts --scope full with --since", () => {
    const options = parsed(["run", "--scope", "full", "--since", "main"]);
    expect(scopeOf(options)).toBe("full");
    expect(options.since).toBe("main");
  });

  it("9.17 a missing --scope value is a usage error", () => {
    expect(failure(["run", "--scope"]).message).toContain("Missing value for option --scope");
  });

  it("9.17 a --scope followed by another option is a usage error", () => {
    expect(failure(["run", "--scope", "--spec", "s"]).message).toContain(
      "Missing value for option --scope",
    );
  });
});
