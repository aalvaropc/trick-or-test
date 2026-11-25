import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/args.js";

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

describe("CLI argument parser", () => {
  it("9.1 parses the run command with defaults", () => {
    expect(parsed(["run"])).toEqual({ command: "run", project: CWD });
  });

  it("9.2 parses the measure command with --output", () => {
    expect(parsed(["measure", "--output", "reports"])).toEqual({
      command: "measure",
      project: CWD,
      output: "reports",
    });
  });

  it("9.3 parses --since <ref>", () => {
    expect(parsed(["run", "--since", "main"]).since).toBe("main");
  });

  it("9.4 parses --project <path> and defaults to the working directory", () => {
    expect(parsed(["run", "--project", "examples/pricing"]).project).toBe("examples/pricing");
    expect(parsed(["measure", "--output", "o"]).project).toBe(CWD);
  });

  it("9.5 parses --spec <name> and leaves it unset by default", () => {
    expect(parsed(["run", "--spec", "cart-pricing"]).spec).toBe("cart-pricing");
    expect(parsed(["run"]).spec).toBeUndefined();
  });

  it("9.5 accepts all options together in any order", () => {
    expect(
      parsed(["measure", "--spec", "s", "--output", "out", "--since", "HEAD~1", "--project", "p"]),
    ).toEqual({ command: "measure", project: "p", since: "HEAD~1", spec: "s", output: "out" });
  });

  it("9.8 offers no option that changes the exit code by survivor count", () => {
    for (const flag of ["--fail-on-survivors", "--exit-code", "--max-survivors"]) {
      expect(failure(["run", flag, "0"]).message).toContain(flag);
    }
  });

  it("9.10 returns a usage error for a missing option value", () => {
    expect(failure(["run", "--since"]).message).toContain("--since");
    expect(failure(["run", "--spec", "--project", "p"]).message).toContain("--spec");
  });

  it("9.10 returns a usage error for an unknown command", () => {
    expect(failure(["frobnicate"]).message).toContain("frobnicate");
  });

  it("9.10 returns a usage error when no command is given", () => {
    expect(failure([]).kind).toBe("usage");
  });

  it("9.10 returns a usage error for an unknown option", () => {
    expect(failure(["run", "--bogus", "x"]).message).toContain("--bogus");
  });

  it("9.10 rejects --output for the run command", () => {
    expect(failure(["run", "--output", "x"]).message).toContain("--output");
  });
});
