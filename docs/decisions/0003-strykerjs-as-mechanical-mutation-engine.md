---
status: accepted
date: 2026-11-15
---

# StrykerJS as the mechanical mutation engine

## Context and problem statement

Trick or Test needs two kinds of mutants: mechanical ones (operator and literal changes) and spec mutants tied to acceptance criteria. Writing a mechanical mutator for TypeScript is a large, well-solved problem.

## Considered options

- Use StrykerJS with its Vitest runner.
- Write a custom AST mutator.

## Decision outcome

Chosen option: **StrykerJS**, because it is mature, supports incremental runs and line ranges, and produces reports in the open `mutation-testing-report-schema` that other tools can read.

Trick or Test adds what StrykerJS does not do: spec mutants with executable witnesses, requirement coverage and agent hooks. Its own data that the schema cannot hold goes in a sidecar file.

### Consequences

- Good: no custom mutator to maintain; reports stay compatible with the Stryker ecosystem.
- Bad: only JavaScript and TypeScript projects that StrykerJS supports are in scope.
