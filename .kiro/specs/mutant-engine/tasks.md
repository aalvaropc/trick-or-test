# Implementation Plan: Mutant Engine

## Overview

The plan builds `packages/engine` in five phases: package setup, the pure core, the adapters, the CLI, and the end-to-end test. The language is TypeScript 7, ES modules, as in `design.md`. Each module comes with its tests in the same task or in the task right after it. Every task is required.

Conventions used in every task:

- Source goes in `packages/engine/src/<area>/`. Tests go in `packages/engine/test/<area>/`, mirroring `src/`.
- Example tests live in `*.test.ts` and property tests in `*.property.test.ts`. No file mixes both kinds.
- Test names start with the acceptance criterion id they guard, for example `it('5.6 ...')`. Property test files open with `// Property <n>: <title>. Validates: Requirements <ids>`.
- Property tests use the fast-check configuration from the Vitest setup file. They never pass an ad-hoc seed.
- Vitest project name for the engine is `engine`. `<file>` in a Validation line is the test file named in the task.
- `examples/pricing/src/` and `examples/pricing/test/` are never edited.

## Tasks

- [x] 1. Set up the `packages/engine` workspace
  - [x] 1.1 Create the workspace package, TypeScript project and Vitest project
    - Create `packages/engine/package.json` with name `trick-or-test`, `"type": "module"`, `bin` for the CLI, `exports` for `.` and `./report`, and `engines.node` `>=22.12`.
    - Add exact-version dependencies: `zod` 4.6.7, `@stryker-mutator/core` 10.1.1, `@stryker-mutator/vitest-runner` 10.1.1, `mutation-testing-report-schema` 3.9.0. Add exact-version devDependencies: `fast-check` 4.10.2 (the version `examples/pricing` already uses), `vitest` 5.1.0, `typescript` 7.0.2, `@types/node` 26.6.6.
    - Add scripts `build` (`tsc -b`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`) and `test:e2e` (`vitest run --config vitest.e2e.config.ts`).
    - Create `packages/engine/tsconfig.json` extending `../../tsconfig.base.json`, add the reference to the root `tsconfig.json`, and create `packages/engine/vitest.config.ts` with project name `engine`, include `test/**/*.test.ts` and exclude `test/e2e/**` and `test/fixtures/**`.
    - Exclude `test/fixtures/**` from the engine's `tsconfig.json`, from the engine's Vitest `include` and from Biome (`biome.json` `files` ignore). One fixture has a type error on purpose and would break `npm run check`, and fixture test files must not run as engine tests.
    - Create `packages/engine/vitest.e2e.config.ts` that includes only `test/e2e/**/*.test.ts` and has a 120-second test timeout.
    - Run `npm install` at the root to update `package-lock.json`.
    - Add the `test:e2e` row to the commands table in `.kiro/steering/tech.md` in the same commit.
    - _Requirements: 10.9_
    - _Validation: npm run typecheck passes_

  - [x] 1.2 Add the fast-check Vitest setup file and test helpers folder
    - Create `packages/engine/test/setup.ts` that calls `fc.configureGlobal({ seed: <fixed number>, numRuns: 100 })`, and register it in `vitest.config.ts` under `setupFiles`.
    - Create `packages/engine/test/helpers/` for generators (outside the published package; `package.json` `files` lists only `dist`).
    - Add one smoke test `packages/engine/test/setup.test.ts` that asserts `fc.readConfigureGlobal().numRuns` is at least 100 and the seed is set.
    - _Requirements: 10.6, 10.7_
    - _Validation: npx vitest run --project engine packages/engine/test/setup.test.ts passes_

- [x] 2. Checkpoint - Setup phase
  - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
  - _Validation: npm run check passes_

- [x] 3. Implement the pure core (`packages/engine/src/core/`)
  - [x] 3.1 Implement `result.ts` and shared types
    - Create `result.ts` with the `Result<T, E>` union and `ok` and `err` helpers.
    - Create `types.ts` with the branded ids (`MutantId`, `CriterionId`, `TestId`), `Criterion`, `Species`, `MutantStatus`, `KillClass`, `CoverageStatus`, `Witness`, `SpecMutant`, `SkipEntry`, `MutantResult`, `EngineConfig`, `CriterionCoverage`, `RunMetadata`, `Verdict` and `HistoryRecord` from `design.md`.
    - Add `test/core/result.test.ts` for `ok` and `err`.
    - The core imports nothing from `node:` except `node:crypto` in `mutant-id.ts`.
    - _Requirements: 10.1, 10.3_
    - _Validation: npx vitest run --project engine packages/engine/test/core/result.test.ts passes_

  - [x] 3.2 Implement `config.ts` (Config_Loader validation) with example tests
    - Implement `validateConfig(raw)` with a strict zod schema (unknown keys are errors) and defaults, and `resolveConfigPaths(config, projectRoot)` as pure string joins.
    - Return errors as structured `{ filePath, field? }` values that name `trickortest.config.json` and the field.
    - Leave `timeoutMs` unset when absent.
    - Write `test/core/config.test.ts`: all fields parsed, one default per absent field, all defaults for an absent file, invalid JSON, wrong type, unknown field, path resolution, `timeoutMs` absent and present.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
    - _Validation: npx vitest run --project engine packages/engine/test/core/config.test.ts passes_

  - [x] 3.3 Implement `requirements.ts` (Requirements_Parser) with example tests
    - Implement `parseRequirements(text, filePath)` as a line-oriented scan that returns `Criterion[]` in document order, with id `<requirement>.<criterion>`, text and 1-based line.
    - Return errors for a duplicate id (file, id, both lines), an item outside any `### Requirement N:` heading (file, line) and a document with no criterion (file).
    - Write `test/core/requirements.test.ts`, including a parse of the fixed fixture `.kiro/specs/cart-pricing/requirements.md` that expects its known requirement and criterion counts and ids.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
    - _Validation: npx vitest run --project engine packages/engine/test/core/requirements.test.ts passes_

  - [x] 3.4 Write the requirements document generator and Property 8: Parser
    - Create `test/helpers/requirements-generator.ts` that generates documents with N requirements of K criteria each, plus documents with no acceptance criteria.
    - Write `test/core/requirements.property.test.ts` with **Property 8: Parser**.
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.7, 2.8**
    - _Requirements: 2.8, 10.6, 10.7_
    - _Validation: npx vitest run --project engine packages/engine/test/core/requirements.property.test.ts passes_

  - [x] 3.5 Implement `species.ts` (Species_Classifier) with example tests
    - Implement `classifySpecies(mutatorName, replacementText)` as a total function over a data constant that copies the table in `.kiro/steering/bestiary.md`. Unknown names return `Unclassified`.
    - Write `test/core/species.test.ts`: one example per table row, an unknown `mutatorName`, the `<`/`<=` and `>`/`>=` boundary replacements, and a test that reads `.kiro/steering/bestiary.md` and checks that the constant matches the table.
    - _Requirements: 3.11, 3.12, 3.13, 8.14_
    - _Validation: npx vitest run --project engine packages/engine/test/core/species.test.ts passes_

  - [x] 3.6 Write Property 9: Species is total
    - Write `test/core/species.property.test.ts` with **Property 9: Species is total**. The generator includes the operator pairs `<`/`<=` and `>`/`>=` as replacement samples.
    - **Validates: Requirements 3.11, 3.12, 3.13, 8.14**
    - _Requirements: 3.11, 3.12, 3.13, 8.14_
    - _Validation: npx vitest run --project engine packages/engine/test/core/species.property.test.ts passes_

  - [x] 3.7 Implement `mutation.ts` with example tests
    - Implement `applyMutation(source, mutant)` (requires exactly one occurrence of `original`, returns the mutated text and span) and `revertMutation(mutated, mutant, span)`.
    - Write `test/core/mutation.test.ts`: exactly one occurrence, zero occurrences, two occurrences (NotApplicable), occurrence at the start and at the end of the source.
    - _Requirements: 5.2_
    - _Validation: npx vitest run --project engine packages/engine/test/core/mutation.test.ts passes_

  - [x] 3.8 Write Property 1: Replacement round trip
    - Write `test/core/mutation.round-trip.property.test.ts` with **Property 1: Replacement round trip**. Check that revert after apply gives the original text and that no character outside the span changes.
    - **Validates: Requirements 5.2**
    - _Requirements: 5.2_
    - _Validation: npx vitest run --project engine packages/engine/test/core/mutation.round-trip.property.test.ts passes_

  - [x] 3.9 Write Property 2: Uniqueness
    - Write `test/core/mutation.uniqueness.property.test.ts` with **Property 2: Uniqueness**. The generator produces sources where `original` occurs exactly 0, exactly 2 and many times. Check the NotApplicable error and that the source is unchanged.
    - **Validates: Requirements 4.4, 5.2**
    - _Requirements: 4.4, 5.2_
    - _Validation: npx vitest run --project engine packages/engine/test/core/mutation.uniqueness.property.test.ts passes_

  - [x] 3.10 Implement `spec-mutants.ts` (Spec_Mutant_Loader validation) with example tests
    - Implement `validateSpecMutant(raw, filePath)` (zod schema, exactly one of `expected` and `expectedError`, `from` defaulting to `file`), `validateSkipFile(raw, filePath)` and `checkCrossFileRules(mutants, skipEntries, criteria)` (duplicate id naming both files, unknown requirement, empty reason, skip entry for an unknown criterion or a criterion that has a mutant).
    - Return mutants ordered by id. A bad file yields an error and the other files still load.
    - Write `test/core/spec-mutants.test.ts` with one example per rule above, including a witness with both `expected` and `expectedError` and a witness with neither.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/spec-mutants.test.ts passes_

  - [x] 3.11 Implement `suite-time-limit.ts` with boundary example tests
    - Implement `computeSuiteTimeLimit(baselineMs, timeoutMs?)`: `timeoutMs` when set, otherwise `baselineMs * 1.5 + 5000`.
    - Write `test/core/suite-time-limit.test.ts` with boundary examples: baseline 0, a typical baseline, `timeoutMs` set to 0, `timeoutMs` set and smaller than the formula, `timeoutMs` set and larger than the formula.
    - _Requirements: 1.1, 1.7, 5.15_
    - _Validation: npx vitest run --project engine packages/engine/test/core/suite-time-limit.test.ts passes_

  - [x] 3.12 Implement `witness-compare.ts` with example tests
    - Implement `compareWitnessOutcome(expected, actual)` using deep structural equality over JSON values and error class name equality.
    - Write `test/core/witness-compare.test.ts`: equal values, unequal values, key order in objects, nested arrays, `expectedError` match and mismatch, value versus error.
    - _Requirements: 5.6, 5.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/witness-compare.test.ts passes_

  - [x] 3.13 Implement `test-classification.ts` with example tests
    - Implement `classifyTest({ filePath, bodySource }, propertyTestGlobs)`: property when the path matches a glob or the body calls `fc.assert`, `fc.check` or `test.prop`; otherwise example.
    - Write `test/core/test-classification.test.ts`: glob match, each of the three entry points, a plain example body, a body that only mentions `fc.assert` in a comment or a string, and a helper-only case that is classified by glob alone.
    - _Requirements: 6.3, 6.4, 6.5_
    - _Validation: npx vitest run --project engine packages/engine/test/core/test-classification.test.ts passes_

  - [x] 3.14 Write Property 11: Property-test classification
    - Write `test/core/test-classification.property.test.ts` with **Property 11: Property-test classification**. Generate test files that mix property bodies and example bodies, and check the if-and-only-if rule.
    - **Validates: Requirements 6.3, 6.4, 6.5**
    - _Requirements: 6.3, 6.4, 6.5_
    - _Validation: npx vitest run --project engine packages/engine/test/core/test-classification.property.test.ts passes_

  - [x] 3.15 Implement `kill-classification.ts` with example tests
    - Implement `computeKillClass(killingTests)` returning `examples-only`, `properties-only`, `both` or `unattributed` (empty list).
    - Write `test/core/kill-classification.test.ts`: one example per class, and a single-test list for each kind.
    - _Requirements: 6.6, 6.7, 6.8, 6.9_
    - _Validation: npx vitest run --project engine packages/engine/test/core/kill-classification.test.ts passes_

  - [x] 3.16 Write Property 5: Attribution partition
    - Write `test/core/kill-classification.property.test.ts` with **Property 5: Attribution partition**. Include Timeout mutants in the generated sets and check that they get no kill class and are not counted.
    - **Validates: Requirements 6.6, 6.7, 6.8, 6.9, 6.10**
    - _Requirements: 6.6, 6.7, 6.8, 6.9, 6.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/kill-classification.property.test.ts passes_

  - [x] 3.17 Write Property 10: Single-run attribution
    - Write `test/core/kill-classification.single-run.property.test.ts` with **Property 10: Single-run attribution**. Compare the class from the combined list with the class derived from separate example-only and property-only partitions of the same list.
    - **Validates: Requirements 6.1, 6.2**
    - _Requirements: 6.1, 6.2_
    - _Validation: npx vitest run --project engine packages/engine/test/core/kill-classification.single-run.property.test.ts passes_

  - [x] 3.18 Implement `mutant-id.ts` with example tests
    - Implement `computeMutantId(file, original, replacement)` for Mechanical_Mutants only, as a hex-truncated hash from `createHash('sha256')` of `node:crypto`. Do not hand-write a sha256. This is the only core module that imports from `node:`. Keep it out of the `trick-or-test/report` import graph.
    - Spec_Mutants do not pass through this function: a Spec_Mutant keeps the id from its file (`oath-<criterion>-<slug>`), unique per Requirement 4.5.
    - Write `test/core/mutant-id.test.ts`: a fixed known hash, a different file, a different original, a different replacement, and the empty string.
    - _Requirements: 8.7, 10.4_
    - _Validation: npx vitest run --project engine packages/engine/test/core/mutant-id.test.ts passes_

  - [x] 3.19 Write Property 6: Deterministic ids
    - Write `test/core/mutant-id.property.test.ts` with **Property 6: Deterministic ids**. For lists of Mechanical_Mutants, check that each id depends only on file, original text and replacement. For lists that also contain Spec_Mutants, check that each Spec_Mutant keeps the id from its file. Shuffle the list and check that no id changes and that the report output order is the same.
    - **Validates: Requirements 4.5, 8.7**
    - _Requirements: 4.5, 8.7_
    - _Validation: npx vitest run --project engine packages/engine/test/core/mutant-id.property.test.ts passes_

  - [x] 3.20 Implement `coverage.ts` with example tests
    - Implement `computeCoverage(criteria, mutantResults, skipEntries)` assigning one Coverage_Status per criterion (Timeout counts as killed, only Killed, Survived and Timeout are valid), carrying the skip reason, and computing the headline count of surviving Spec_Mutants and the separate count of strays.
    - Write `test/core/coverage.test.ts`: guarded, unguarded, unattacked, skipped, all-Timeout criterion, a criterion whose only mutants are Ghost or InvalidWitness (unattacked), mixed Killed and Survived, strays kept apart from the headline.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/coverage.test.ts passes_

  - [x] 3.21 Write Property 3: No invalid mutant is counted
    - Write `test/core/coverage.invalid.property.test.ts` with **Property 3: No invalid mutant is counted**.
    - **Validates: Requirements 7.6, 7.7**
    - _Requirements: 7.6, 7.7_
    - _Validation: npx vitest run --project engine packages/engine/test/core/coverage.invalid.property.test.ts passes_

  - [x] 3.22 Write Property 4: Coverage partition
    - Write `test/core/coverage.partition.property.test.ts` with **Property 4: Coverage partition**.
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.8**
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.8_
    - _Validation: npx vitest run --project engine packages/engine/test/core/coverage.partition.property.test.ts passes_

  - [x] 3.23 Write Property 12: Skip is not attack
    - Write `test/core/coverage.skip.property.test.ts` with **Property 12: Skip is not attack**. Include skip entries with empty reasons and entries that name a criterion that has a valid mutant, and check them through `checkCrossFileRules` and `computeCoverage`.
    - **Validates: Requirements 4.8, 4.9, 7.3, 7.4, 7.5**
    - _Requirements: 4.8, 4.9, 7.3, 7.4, 7.5_
    - _Validation: npx vitest run --project engine packages/engine/test/core/coverage.skip.property.test.ts passes_

  - [x] 3.24 Implement the report schemas and `buildMutationReport` with example tests
    - In `report.ts` define the zod schemas for the Verdict, the History record and the mutation report types, and implement `buildMutationReport(input)`: include Mechanical_Mutants and Spec_Mutants, map Ghost, InvalidWitness and NotApplicable to `Ignored` with a `statusReason` naming the engine status, CompileError to CompileError, Timeout to Timeout, assign Oathbreaker to every Spec_Mutant, and keep one mutant (the Spec_Mutant, tied to its criterion) when both kinds make the same change. The mutant ids arrive as input data (Spec_Mutants keep their file ids, Mechanical_Mutants carry the hash computed by the CLI). `report.ts` does not import `mutant-id.ts` and never computes ids. Detect the same change by comparing file, span and replacement, not ids.
    - Write `test/core/report.test.ts`: each status mapping, `statusReason` text, duplicate change with different ids, a validation of one built report against `mutation-testing-report-schema`.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.14, 8.15_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.test.ts passes_

  - [x] 3.25 Write Property 7: Report validity
    - Write `test/core/report.validity.property.test.ts` with **Property 7: Report validity**. Validate every generated report with `mutation-testing-report-schema`, check the status mapping and check the parse-back equality.
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.validity.property.test.ts passes_

  - [x] 3.26 Write Property 15: One creature per change
    - Write `test/core/report.dedup.property.test.ts` with **Property 15: One creature per change**. Pairs are matched by file, span and replacement, and the generated ids differ between the two kinds.
    - **Validates: Requirements 8.15**
    - _Requirements: 8.15_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.dedup.property.test.ts passes_

  - [x] 3.27 Implement `buildVerdict` with example tests
    - In `report.ts` implement `buildVerdict(input)`: coverage per criterion, engine status per mutant, kill class per killed mutant, witnesses, the `ignoreStatic` retry flag and the run metadata (commit, seed, versions of the engine, Node.js, StrykerJS, Vitest and TypeScript). Validate with the zod schema before returning.
    - Write `test/core/verdict.test.ts`: all fields present, kill class only on Killed mutants, the retry flag, a build that fails the schema returns an error, and the output is the same for the same input except `metadata.timestamp`.
    - _Requirements: 8.5, 8.6, 8.10, 8.13_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict.test.ts passes_

  - [x] 3.28 Write Property 16: Verdict round trip
    - Write `test/core/verdict.property.test.ts` with **Property 16: Verdict round trip**. Serialize, parse and serialize again with the engine's own serializer, and check that both contents are identical.
    - **Validates: Requirements 8.5, 8.10, 8.12**
    - _Requirements: 8.5, 8.10, 8.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict.property.test.ts passes_

  - [x] 3.29 Implement `buildHistoryRecord` with example tests
    - In `report.ts` implement `buildHistoryRecord(verdict, previousRecord)` with time, commit, seed, config, mutant ids and statuses, count per Mutant_Status, count per Coverage_Status and `newlyKilledIds`. Implement an `appendHistory(records, record)` pure function that returns the old records unchanged plus the new one. Validate with the zod schema.
    - Write `test/core/history.test.ts`: first record (no previous), a previous record with some ids already killed, a run that kills nothing new, and a record that fails the schema.
    - _Requirements: 8.8, 8.9, 8.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/history.test.ts passes_

  - [x] 3.30 Write Property 14: History is append-only
    - Write `test/core/history.property.test.ts` with **Property 14: History is append-only**.
    - **Validates: Requirements 8.8, 8.9**
    - _Requirements: 8.8, 8.9_
    - _Validation: npx vitest run --project engine packages/engine/test/core/history.property.test.ts passes_

  - [x] 3.31 Add the `trick-or-test/report` subpath and its no-`node:` test
    - Create `src/report/index.ts` that re-exports only the report types and schemas. Check that `package.json` `exports["./report"]` points to its build output.
    - Write `test/report/no-node-imports.test.ts` that walks the import graph of `src/report/index.ts` and fails on any `node:` import.
    - _Requirements: 10.1, 10.4_
    - _Validation: npx vitest run --project engine packages/engine/test/report/no-node-imports.test.ts passes_

- [x] 4. Checkpoint - Core phase
  - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
  - _Validation: npm run check passes_

- [ ] 5. Implement the adapters (`packages/engine/src/adapters/`)
  - [x] 5.1 Implement `file-system-adapter.ts` with tests
    - Define the `FileSystem` interface (`readFile`, `writeFile`, `copyDir`, `removeDir`, `exists`) and implement it over `node:fs/promises`. Writes return a `Result` error that names the path when the path cannot be written.
    - Write `test/adapters/file-system-adapter.test.ts` on a temp directory: read, write, copy with an exclude list, remove, exists, and a write into a read-only directory that returns the error with the path.
    - _Requirements: 8.11, 10.2_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/file-system-adapter.test.ts passes_

  - [x] 5.2 Implement `sandbox.ts` with tests
    - Implement `Sandbox.create(projectRoot, id)` that copies the project to `.trickortest/sandboxes/<id>/`, excluding `node_modules`, `.git`, `.trickortest`, `.stryker-tmp` and the output directory, writes `.trickortest/.gitignore` containing `*`, and `Sandbox.destroy(handle)`. Provide `withSandbox(projectRoot, id, fn)` that destroys in a `finally`.
    - Write `test/adapters/sandbox.test.ts`: the excluded folders are absent from the copy, `.trickortest/.gitignore` exists, destroy removes the folder, `withSandbox` removes it when `fn` throws.
    - _Requirements: 5.1, 5.13, 3.14_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/sandbox.test.ts passes_

  - [x] 5.3 Write Property 13: Sandbox isolation
    - Write `test/adapters/sandbox.property.test.ts` with **Property 13: Sandbox isolation**. Generate sequences of runs that pass, throw and time out inside `withSandbox` on a temp project, then compare a hash of every file outside `.trickortest/` before and after and check that `.trickortest/sandboxes/` is empty.
    - **Validates: Requirements 3.14, 5.1, 5.13, 10.10**
    - _Requirements: 3.14, 5.1, 5.13, 10.10_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/sandbox.property.test.ts passes_

  - [x] 5.4 Implement `git-adapter.ts` with tests
    - Implement `Git.changedRanges(ref)` that runs `git diff --unified=0 <ref>` and parses hunks into `file:start-end` ranges, plus a `Git.currentCommit()` for the run metadata. Parse the output with a zod-validated structure.
    - Write `test/adapters/git-adapter.test.ts` on a temp git repository: one changed range, several ranges in one file, a deleted-only hunk, no change, an unknown ref (returns an error).
    - _Requirements: 3.9, 3.10_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/git-adapter.test.ts passes_

  - [x] 5.5 Implement `test-body-extractor.ts` with tests
    - Implement `extractTestBody(fileText, startLine)` as a bracket-matching scanner that skips string literals, template literals, regular expression literals and comments.
    - Write `test/adapters/test-body-extractor.test.ts`: a simple test, a body with braces inside strings, templates and comments, a regex literal containing a bracket, a nested `describe`, and a start line past the end of the file.
    - _Requirements: 6.2, 6.4_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/test-body-extractor.test.ts passes_

  - [x] 5.6 Implement `typecheck-adapter.ts` with tests
    - Implement `Typecheck.run(sandboxRoot)` that runs the TypeScript compiler from the target project with `--noEmit` and returns a `CompileError` result with the first error line.
    - Write `test/adapters/typecheck-adapter.test.ts` on two small fixture projects under `packages/engine/test/fixtures/` (for example `typecheck-ok/` and `typecheck-error/`): one that type-checks and one with a type error on purpose.
    - _Requirements: 5.3_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/typecheck-adapter.test.ts passes_

  - [x] 5.7 Implement `vitest-suite-runner.ts` with tests
    - Implement `SuiteRunner.run(root, options)` that runs the target's Vitest with the JSON reporter and `includeTaskLocation`, parses the output with a zod schema into `durationMs` and per-file tests (name, status, start line), and enforces the suite time limit as a process timeout that reports a Timeout result.
    - Write `test/adapters/vitest-suite-runner.test.ts` on a small fixture project under `packages/engine/test/fixtures/` (for example `suite-runner/`): all passing, one failing test with its start line, and a hanging test that hits a short time limit.
    - _Requirements: 5.8, 5.9, 5.10, 5.11, 6.2_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/vitest-suite-runner.test.ts passes_

  - [x] 5.8 Implement `vitest-witness-runner.ts` with tests
    - Implement `WitnessRunner.run(sandboxRoot, witnesses)`: generate `.trickortest/witnesses/<mutant id>.witness.test.ts` that imports the `export` from `witness.from`, calls it with `args` and writes `{ kind: 'value', value }` or `{ kind: 'error', className }` to `<mutant id>.outcome.json`. Generate `.trickortest/witnesses/vitest.config.ts` that extends the target config and includes only the witness files. Read outcomes from the files, never from console output, and parse them with a zod schema.
    - Write `test/adapters/vitest-witness-runner.test.ts` on a small fixture project under `packages/engine/test/fixtures/` (for example `witness-runner/`) with extensionless TypeScript imports: a returned value, a thrown error class, a witness that fails to import, and a check that the target's own suite run ignores the generated files.
    - _Requirements: 5.4, 5.5, 5.6, 5.7_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/vitest-witness-runner.test.ts passes_

  - [x] 5.9 Implement the Stryker options builder in `stryker-adapter.ts` with tests
    - Implement `buildStrykerOptions(input)` as a pure function: `plugins` lists the Vitest runner, incremental mode with `incrementalFile`, the JSON reporter with `fileName`, `tempDirName` and `disableBail`, all under `.trickortest/`; `tsconfigFile` set to a nonexistent path only when TypeScript is 7 or newer; `mutate` patterns as `file:start-end` from Changed_Ranges; exclusion of non-build folders including symlinked directories and every file under `.stryker-tmp`; `ignoreStatic` only on retry.
    - Write `test/adapters/stryker-options.test.ts`: TypeScript 6 versus 7 versus 8, the `plugins` entry, the `.trickortest/` paths, mutate patterns for one and several ranges, a symlinked directory, and `.stryker-tmp` exclusion.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8, 3.9, 3.14_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-options.test.ts passes_

  - [ ] 5.10 Implement the Stryker run, retry and result parsing in `stryker-adapter.ts` with tests
    - Implement `MechanicalRunner.run(options)`: return zero mutants without starting StrykerJS when `--since` finds no changed line; run StrykerJS; retry exactly once with `ignoreStatic` when the initial test run fails because of static mutants and flag the retry; return the first error line as a `Result` error for any other StrykerJS failure; parse the JSON report with a zod schema into mutants with `killedBy` and `testFiles`.
    - Write `test/adapters/stryker-adapter.test.ts` with a fake process runner: a clean run, the static-mutant failure followed by a successful retry, a retry that fails again (no second retry), another error returning the first error line, and no changed lines (the runner is never called).
    - _Requirements: 3.5, 3.6, 3.10, 6.1_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts passes_

- [ ] 6. Checkpoint - Adapters phase
  - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
  - _Validation: npm run check passes_

- [ ] 7. Implement the CLI (`packages/engine/src/cli/`)
  - [ ] 7.1 Implement the argument parser with tests
    - Implement a dependency-free parser for the commands `run` and `measure` and the options `--since <ref>`, `--project <path>`, `--spec <name>` and the output directory option of `measure`. An unknown command or option returns a usage error. No option changes the exit code by survivor count.
    - Write `test/cli/args.test.ts`: each command and option, defaults (cwd as project), a missing option value, an unknown command, an unknown option.
    - _Requirements: 9.3, 9.4, 9.5, 9.8, 9.10_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/args.test.ts passes_

  - [ ] 7.2 Implement the load and validate stage of the orchestration with tests
    - In `orchestrate.ts` implement the first stage: read and validate the config, find the spec directories that have a `requirements.md` (or the one given by `--spec`), parse the requirements, load the mutants and the Skip_File, and run the cross-file rules. Any error returns before the baseline and before StrykerJS. Adapters come in through interfaces.
    - Write `test/cli/orchestrate-load.test.ts` with fake adapters: a valid project, an invalid config, a parse error, a malformed mutant file (the other files still load and the run ends before the baseline), and a spec directory without `requirements.md` that is skipped.
    - _Requirements: 4.4, 9.1, 9.5, 10.2, 10.3_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-load.test.ts passes_

  - [ ] 7.3 Implement the baseline and mechanical stage of the orchestration with tests
    - In `orchestrate.ts` add the baseline run (record its duration) and the mechanical run through `MechanicalRunner`, with `--since` ranges from `Git`. A failing baseline returns the failing tests and a StrykerJS error returns its first error line. Neither writes a Verdict_File. Compute the id of each mechanical mutant here with `computeMutantId(file, original, replacement)`. Classify the species and the kill class of each mechanical mutant from `killedBy`, the extracted test bodies and the property-test globs.
    - Write `test/cli/orchestrate-mechanical.test.ts` with fake adapters: baseline failure, StrykerJS error, a normal run with killed and survived mutants, `--since` with no changes (zero mechanical mutants), a killed mutant whose killing tests are unknown (`unattributed`), and the same mechanical mutant getting the same hash id on two runs.
    - _Requirements: 3.6, 3.15, 6.1, 6.9, 9.1, 9.3_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-mechanical.test.ts passes_

  - [ ] 7.4 Implement the spec mutant stage of the orchestration with tests
    - In `orchestrate.ts` add the spec mutant pipeline: one pristine sandbox for the witnesses on the original code, then per mutant a sandbox, `applyMutation`, type-check, InvalidWitness check, mutated witness run, Ghost check, one suite run with the time limit from `computeSuiteTimeLimit`, status mapping (Killed, Survived, Timeout), kill class from the failing tests, and sandbox removal in a `finally`. Keep the order of mutants stable (by id). A Spec_Mutant keeps the id from its file; the pipeline never recomputes it.
    - Write `test/cli/orchestrate-spec-mutants.test.ts` with fake adapters, one example per path: NotApplicable, CompileError, InvalidWitness (reports both outcomes), Ghost, Killed, Survived, Timeout, a crash in the suite runner (sandbox still removed), and the same status on two runs.
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.13, 5.14, 5.15, 6.2_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-spec-mutants.test.ts passes_

  - [ ] 7.5 Implement the reporting stage of the orchestration with tests
    - In `orchestrate.ts` add the final stage: compute coverage, build the mutation report, the verdict and the history record (with the previous record read through the `FileSystem`), then write the report, the verdict and the appended history to the output directory. Pass the mutant ids to `report.ts` as data (file ids for Spec_Mutants, `computeMutantId` hashes from task 7.3 for Mechanical_Mutants). A write failure returns an error that names the path.
    - Write `test/cli/orchestrate-report.test.ts` with a fake file system: the three outputs are written, the history keeps earlier records, a write failure names the path, two runs with the same inputs write identical report and verdict content except `metadata.timestamp`.
    - _Requirements: 8.1, 8.5, 8.8, 8.11, 8.13, 9.1_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-report.test.ts passes_

  - [ ] 7.6 Implement the CLI entry point, summary and exit codes with tests
    - Create `src/cli/main.ts` and the `bin` entry. `run` uses the configured output directory. `measure` writes into the output directory given for the command. Print the summary: surviving Spec_Mutants, count per Coverage_Status, strays and the paths written. Exit 0 on a completed run even when Spec_Mutants survive. On a configuration, parsing, baseline, StrykerJS or runtime error print the message to stderr and exit 1. An unknown command or option prints the usage to stderr and exits 1.
    - Write `test/cli/main.test.ts` with fake adapters: summary content, exit 0 with survivors, exit 1 for each error kind, usage on an unknown command and option, `measure` output directory.
    - _Requirements: 9.1, 9.2, 9.6, 9.7, 9.9, 9.10_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/main.test.ts passes_

  - [ ] 7.7 Add the no-LLM, no-network test
    - Write `test/cli/no-network.test.ts` that scans the files under `src/` and `package.json` for imports or dependencies of HTTP clients and LLM SDKs, for `fetch(`, `node:http`, `node:https` and `node:net`, and for any reference to an API key variable. The test fails with the file name.
    - _Requirements: 9.11_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/no-network.test.ts passes_

- [ ] 8. Checkpoint - CLI phase
  - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
  - _Validation: npm run check passes_

- [ ] 9. Write the end-to-end test
  - [ ] 9.1 Write the end-to-end test for `examples/pricing`
    - Create `test/e2e/pricing.test.ts` that runs the built CLI (`trick-or-test measure --project examples/pricing --spec cart-pricing`, output into a temp directory) with the real StrykerJS and Vitest, and checks that the mutation report validates against `mutation-testing-report-schema`, that `verdict.json` and the history file exist and match their zod schemas, that the exit code is 0, and that a second run appends exactly one history record.
    - Hash `examples/pricing/src/` and `examples/pricing/test/` before and after the run and check that they are byte-identical, and check that `.trickortest/sandboxes/` is empty afterwards.
    - Precondition supplied by the user: before this task starts, the user adds `examples/pricing/mutants/cart-pricing/` with the 24 spec mutants bred by a Kiro agent from the cart-pricing spec. This task does not invent or add any mutant. Against the current tests, 23 are killed and `oath-7.4` survives.
    - Check that all 24 spec mutants are valid (none has the status Ghost, InvalidWitness, CompileError or NotApplicable), that `oath-7.4` is Survived and criterion 7.4 is unguarded in `verdict.json`, and that the other 23 are Killed.
    - The test runs only from `npm run test:e2e --workspace trick-or-test`, never from `npm test`.
    - _Requirements: 10.8, 10.9, 10.10_
    - _Validation: npm run test:e2e --workspace trick-or-test passes_

- [ ] 10. Final checkpoint - Whole engine
  - Run `npm run check` from the repository root, then run the end-to-end test. Ensure all tests pass, ask the user if questions arise.
  - _Validation: npm run check passes_

## Notes

- Every task is required. No task is optional.
- Each of the 16 correctness properties in `design.md` has its own task: P1 (3.8), P2 (3.9), P3 (3.21), P4 (3.22), P5 (3.16), P6 (3.19), P7 (3.25), P8 (3.4), P9 (3.6), P10 (3.17), P11 (3.14), P12 (3.23), P13 (5.3), P14 (3.30), P15 (3.26), P16 (3.28).
- `computeSuiteTimeLimit` has no property test. Example tests at the boundaries in task 3.11 cover it.
- Property tests and example tests are in separate files. The suffix `.property.test.ts` marks property tests.
- `npm test` runs every engine test except `test/e2e/`. `npm run test:e2e --workspace trick-or-test` runs the end-to-end test.
- Update the commands table in `.kiro/steering/tech.md` in the same commit that adds a script (task 1.1).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["3.1"] },
    {
      "id": 3,
      "tasks": ["3.2", "3.3", "3.5", "3.7", "3.10", "3.11", "3.12", "3.13", "3.15", "3.18", "3.20"]
    },
    {
      "id": 4,
      "tasks": ["3.4", "3.6", "3.8", "3.9", "3.14", "3.16", "3.17", "3.19", "3.21", "3.22", "3.23", "3.24"]
    },
    { "id": 5, "tasks": ["3.25", "3.26", "3.27"] },
    { "id": 6, "tasks": ["3.28", "3.29"] },
    { "id": 7, "tasks": ["3.30", "3.31"] },
    { "id": 8, "tasks": ["5.1", "5.4", "5.5", "5.6", "5.7", "5.9"] },
    { "id": 9, "tasks": ["5.2", "5.8", "5.10"] },
    { "id": 10, "tasks": ["5.3", "7.1"] },
    { "id": 11, "tasks": ["7.2"] },
    { "id": 12, "tasks": ["7.3"] },
    { "id": 13, "tasks": ["7.4"] },
    { "id": 14, "tasks": ["7.5"] },
    { "id": 15, "tasks": ["7.6"] },
    { "id": 16, "tasks": ["7.7"] },
    { "id": 17, "tasks": ["9.1"] }
  ]
}
```
