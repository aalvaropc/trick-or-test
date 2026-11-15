---
status: accepted
date: 2026-11-15
---

# No LLM calls inside the engine

## Context and problem statement

Spec mutants are written by an AI agent. The engine could call a model itself, or it could validate and run mutants written elsewhere.

## Considered options

- The engine calls a model API to write mutants.
- Agents in the user's IDE write mutant files; the engine only validates and executes them.

## Decision outcome

Chosen option: **the engine never calls a model.** Kiro agents write spec mutants as files; the engine checks each one against its witness, applies it in a sandbox and runs the tests.

### Consequences

- Good: the package needs no API key, has no usage cost and gives the same report for the same inputs.
- Good: every spec mutant is a reviewable file in the repository.
- Bad: generating mutants requires an agent session; the engine alone produces only mechanical mutants.
