---
status: accepted
date: 2026-11-15
---

# Functional core, imperative shell

## Context and problem statement

The engine is driven from three places (CLI, MCP server and agent hooks) and touches the file system, child processes and StrykerJS. Its central logic (which mutant was killed by which test, which requirement is guarded) must be easy to test exhaustively, including with property-based tests.

## Decision outcome

- **Functional core:** verdicts, kill attribution, requirement coverage and report building are pure, deterministic functions over plain data.
- **Ports and adapters:** the core depends on small interfaces (for example a mutation runner, a spec reader and a sandbox). StrykerJS, the file system, the CLI, the MCP server and the hooks are adapters behind them.
- **Parse at the boundaries:** every external input (reports, mutant files, configuration, hook events, MCP arguments) is parsed with a zod schema into typed data, failing with a message that names the file and field.
- **Branded identifiers** for mutant, criterion and test ids, so they cannot be mixed up.
- **Errors:** expected failures (invalid mutant, witness mismatch) are returned as a small `Result` union; exceptions are reserved for bugs.

### Consequences

- Good: the core is tested without mocks, and its invariants are natural property-based tests.
- Good: a new entry point is a new adapter, not a change to the core.
- Bad: more types and interfaces than a script would need.
