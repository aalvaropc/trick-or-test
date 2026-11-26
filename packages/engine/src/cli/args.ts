import { err, ok, type Result } from "../core/result.js";
import type { RunScope } from "../core/types.js";

export interface CliOptions {
  readonly command: "run" | "measure";
  readonly project: string;
  readonly since?: string;
  readonly spec?: string;
  /** The Run_Scope (9.17). Absent means `full`; read it with `scopeOf`. */
  readonly scope?: RunScope;
  /** Only for `measure`. */
  readonly output?: string;
}

export interface UsageError {
  readonly kind: "usage";
  readonly message: string;
}

export const USAGE_TEXT = `Usage: trick-or-test <command> [options]

Commands:
  run                 Attack one spec and write the report, verdict and history
  measure             Same as run, writing the results into --output

Options:
  --since <ref>       Restrict mechanical mutants to ranges changed since a git ref
  --scope <full|spec-only>
                      full runs StrykerJS and the spec mutants, spec-only runs the spec mutants
                      only (default: full; cannot be combined with --since)
  --project <path>    Target project root (default: current directory)
  --spec <name>       The spec to attack (required when the project has more than one)
  --output <dir>      Output directory (measure only, default: reports)
`;

const DEFAULT_MEASURE_OUTPUT = "reports";
const COMMON_OPTIONS = ["--since", "--project", "--spec", "--scope"] as const;

const usageError = (message: string): Result<never, UsageError> => err({ kind: "usage", message });

/** Parses the arguments after the program name. `cwd` is the default project root. */
export const parseArgs = (argv: readonly string[], cwd: string): Result<CliOptions, UsageError> => {
  const [command, ...rest] = argv;
  if (command === undefined) return usageError("Missing command");
  if (command !== "run" && command !== "measure") {
    return usageError(`Unknown command: ${command}`);
  }

  const allowed: readonly string[] =
    command === "measure" ? [...COMMON_OPTIONS, "--output"] : COMMON_OPTIONS;
  const values = new Map<string, string>();

  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i] as string;
    if (!allowed.includes(name)) return usageError(`Unknown option: ${name}`);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith("--")) {
      return usageError(`Missing value for option ${name}`);
    }
    values.set(name, value);
  }

  const scope = values.get("--scope");
  if (scope !== undefined && scope !== "full" && scope !== "spec-only") {
    return usageError(`Invalid value for option --scope: ${scope} (expected full or spec-only)`);
  }
  const since = values.get("--since");
  if (scope === "spec-only" && since !== undefined) {
    return usageError(
      "The options --scope spec-only and --since cannot be combined: --since restricts mechanical mutants and a spec-only run has none",
    );
  }
  const spec = values.get("--spec");
  const output =
    command === "measure" ? (values.get("--output") ?? DEFAULT_MEASURE_OUTPUT) : undefined;

  return ok({
    command,
    project: values.get("--project") ?? cwd,
    ...(since !== undefined && { since }),
    ...(spec !== undefined && { spec }),
    ...(scope !== undefined && { scope }),
    ...(output !== undefined && { output }),
  });
};
