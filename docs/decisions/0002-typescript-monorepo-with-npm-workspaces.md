---
status: accepted
date: 2026-11-15
---

# TypeScript monorepo with npm workspaces

## Context and problem statement

The project has three parts that change together: the engine package, the web viewer and the example project the engine attacks. They share report types and must be tested and released consistently.

## Considered options

- One repository with npm workspaces and TypeScript project references.
- One repository with pnpm and a task runner (Turborepo or Nx).
- Separate repositories.

## Decision outcome

Chosen option: **npm workspaces with TypeScript project references**, because it needs no tool beyond Node.js and gives incremental type-checking with `tsc -b`.

- Runtime: Node.js 26 (the active LTS) for development; the published package supports Node.js 22.12 or newer, which CI tests.
- Compiler: TypeScript 7 (the native compiler). A build of a composite project with declaration output was verified before adopting it.
- Strictness: `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` and `erasableSyntaxOnly`, so scripts run directly with Node's type stripping.

### Consequences

- Good: one `npm ci`, one lockfile, one CI pipeline.
- Good: the viewer imports report types from the engine without publishing.
- Bad: tools that need the TypeScript JavaScript API cannot use TypeScript 7 yet; if one becomes necessary it must be pinned to TypeScript 6 separately.
