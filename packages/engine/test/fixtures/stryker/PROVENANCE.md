# Captured StrykerJS output

All `*.txt` files here are the combined stdout and stderr of real StrykerJS 10.1.1 runs
(`stryker run stryker.config.json` on Node.js 26.13.1, vitest-runner, `perTest` coverage,
output piped through another process, so not a terminal). StrykerJS colours its log lines
with ANSI codes even when piped, so the adapter receives them.

Two edits were made to the captures:

- The ESC byte (0x1b) is written as `^[` (the `cat -v` notation). Tests decode it back.
- The absolute path of the machine that ran StrykerJS is replaced by `/project`.

| File                                | Project                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `run-succeeded.txt`                 | exit 0, three tests pass, 15 mutants                                                             |
| `dry-run-failed-module-constant.txt`| exit 1, a test fails in the initial run; the source has a module-level `const` threshold         |
| `dry-run-failed-inline-literal.txt` | exit 1, a test fails in the initial run; the source has the threshold as an inline literal       |
| `failed-after-dry-run.txt`          | exit 1, the dry run succeeds, then `thresholds.break = 100` fails the run at a score of 50.00    |

Neither failed dry run prints any text about static mutants. StrykerJS 10.1.1 prints a
static-mutant warning only after a successful dry run.

`mutation-report.json` is the JSON report of task 12.10.
