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
    - Note: task 12.29 adds the path and id safety rules (Requirements 4.11, 4.12).
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
    - Note: task 12.6 adds the outcomes `timeout` and `no-outcome` (Requirement 5.16).
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
    - Note: the Occurrence_Index added to the hash in Requirement 8.7 is implemented by task 3.32.
    - Write `test/core/mutant-id.test.ts`: a fixed known hash, a different file, a different original, a different replacement, and the empty string.
    - _Requirements: 8.7, 10.4_
    - _Validation: npx vitest run --project engine packages/engine/test/core/mutant-id.test.ts passes_

  - [x] 3.19 Write Property 6: Deterministic ids
    - Write `test/core/mutant-id.property.test.ts` with **Property 6: Deterministic ids**. For lists of Mechanical_Mutants, check that each id depends only on file, original text and replacement. For lists that also contain Spec_Mutants, check that each Spec_Mutant keeps the id from its file. Shuffle the list and check that no id changes and that the report output order is the same.
    - Note: tasks 3.33 and 3.34 extend this property (Occurrence_Index, shuffled `buildMutationReport` input).
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
    - Note: tasks 12.13 and 12.26 change the same-change check to start and end location and relativize every path (Requirements 8.15, 8.17).
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.14, 8.15_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.test.ts passes_

  - [x] 3.25 Write Property 7: Report validity
    - Write `test/core/report.validity.property.test.ts` with **Property 7: Report validity**. Validate every generated report with `mutation-testing-report-schema`, check the status mapping and check the parse-back equality.
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.validity.property.test.ts passes_

  - [x] 3.26 Write Property 15: One creature per change
    - Write `test/core/report.dedup.property.test.ts` with **Property 15: One creature per change**. Pairs are matched by file, span and replacement, and the generated ids differ between the two kinds.
    - Note: task 3.45 adds Spec_Mutants without twins and span-end differences to this property.
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

  - [x] 3.32 Add the Occurrence_Index to `computeMutantId`
    - In `core/mutant-id.ts` change the signature to `computeMutantId(file, original, replacement, occurrenceIndex)` and hash all four values (no timestamp, no line number).
    - Add the pure helper `assignOccurrenceIndexes(mutants)` that groups Mechanical_Mutants by (file, original, replacement), sorts each group by line then column, and returns each mutant's 0-based position in its group. The CLI (task 7.3) calls it.
    - Note: task 12.12 orders the groups by the real StrykerJS location and moves the helper to `core/occurrence.ts`.
    - Update `test/core/mutant-id.test.ts`: two identical changes on different lines get different ids, the same change keeps its id when unrelated lines above it move, index 0 versus index 1, and `assignOccurrenceIndexes` on a group of three with unordered input.
    - _Requirements: 8.7, 4.5, 8.13_
    - _Validation: npx vitest run --project engine packages/engine/test/core/mutant-id.test.ts passes_

  - [x] 3.33 Extend Property 6 for the Occurrence_Index
    - In `test/core/mutant-id.property.test.ts` add the clause: two mutants with the same file, original text and replacement but different locations get different ids, and moving unrelated lines (without changing the order inside a group) changes no id. The generators include groups of mutants that share file, original text and replacement.
    - **Validates: Requirements 8.7, 4.5, 8.13**
    - _Requirements: 8.7, 4.5, 8.13_
    - _Validation: npx vitest run --project engine packages/engine/test/core/mutant-id.property.test.ts passes_

  - [x] 3.34 Fix the report-order clause of Property 6
    - In `test/core/mutant-id.property.test.ts` replace the comparison against a sorted stand-in: shuffle the input list of `buildMutationReport` itself and check that the two outputs are equal.
    - **Validates: Requirements 8.13**
    - _Requirements: 8.13_
    - _Validation: npx vitest run --project engine packages/engine/test/core/mutant-id.property.test.ts passes_

  - [x] 3.35 Record the `ignoreStatic` retry in the Mutation_Report
    - In `core/report.ts` make `buildMutationReport` put the retry flag in the schema's free-form `config` object (the Verdict keeps `ignoreStaticRetried`).
    - Add examples to `test/core/report.test.ts`: retry true, retry false.
    - _Requirements: 3.5_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.test.ts passes_

  - [x] 3.36 Extend Property 7 with the retry flag
    - In `test/core/report.validity.property.test.ts` generate the retry flag, check that every generated report validates against `mutation-testing-report-schema` with it, and that the report's `config` records the flag.
    - **Validates: Requirements 3.5, 8.1**
    - _Requirements: 3.5, 8.1_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.validity.property.test.ts passes_

  - [x] 3.37 Expand braces in the property-test glob matcher
    - In `core/test-classification.ts` expand brace groups before matching, so `test/**/*.{property,prop}.test.ts` matches `test/a.property.test.ts` and `test/a.prop.test.ts`.
    - Add examples to `test/core/test-classification.test.ts`: each expansion of a brace group matches, a name outside the group does not, and a glob without braces still works.
    - _Requirements: 6.3_
    - _Validation: npx vitest run --project engine packages/engine/test/core/test-classification.test.ts passes_

  - [x] 3.38 Extend Property 11 with brace globs
    - In `test/core/test-classification.property.test.ts` add generated globs with brace groups and check that a file path matching any expansion is a Property_Test.
    - **Validates: Requirements 6.3, 6.4, 6.5**
    - _Requirements: 6.3_
    - _Validation: npx vitest run --project engine packages/engine/test/core/test-classification.property.test.ts passes_

  - [x] 3.39 Fix regular expression detection in the test-body scanner
    - In `src/adapters/test-body-extractor.ts` treat `/` as the start of a regular expression when the previous token is an operator, an opening bracket, or one of `return`, `typeof`, `case`, `in`, `of`, `delete`, `void`, `throw`, `new`, `instanceof`, `yield`, `await`; otherwise treat it as division.
    - Add one example per keyword to `test/adapters/test-body-extractor.test.ts`, each with a regex that holds a quote or a bracket, for instance `const f = (s) => { return /"/.test(s) }; fc.assert(p);` is classified as a property body. Add a division example (`a / b`) that is still division.
    - _Requirements: 6.4_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/test-body-extractor.test.ts passes_

  - [x] 3.40 Ignore fenced code blocks in the requirements parser
    - In `core/requirements.ts` treat lines inside a fence (opened by ``` or ~~~, closed by a fence of the same character) as neither headings nor criteria.
    - Add examples to `test/core/requirements.test.ts`: a `#` line inside a fence does not end the criteria section, a numbered line inside a fence is not a criterion, a `~~~` fence, a ``` fence containing `~~~`, and an unclosed fence.
    - _Requirements: 2.1_
    - _Validation: npx vitest run --project engine packages/engine/test/core/requirements.test.ts passes_

  - [x] 3.41 Extend the Property 8 generator with fenced blocks
    - In `test/helpers/requirements-generator.ts` insert fenced blocks whose lines look like requirement headings, criteria headings or numbered items. `test/core/requirements.property.test.ts` still expects exactly the ids `n.k`.
    - **Validates: Requirements 2.1, 2.2, 2.8**
    - _Requirements: 2.1, 2.8_
    - _Validation: npx vitest run --project engine packages/engine/test/core/requirements.property.test.ts passes_

  - [x] 3.42 Compare witness values by their JSON form
    - In `core/witness-compare.ts` serialize and parse each value before the deep comparison, so `-0` and `0` are equal.
    - Add examples to `test/core/witness-compare.test.ts`: `-0` versus `0`, `-0` inside an array and an object, `undefined` object members dropped by the JSON form.
    - _Requirements: 5.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/witness-compare.test.ts passes_

  - [x] 3.43 Make `validateConfig(null)` an error
    - In `core/config.ts` return an error that names `trickortest.config.json` for `null` and for every other non-object value (array, string, number). Only a missing file gives defaults, and the caller decides that without calling `validateConfig`.
    - Add examples to `test/core/config.test.ts`: `null`, an array, a string, a number, and `{}` (still all defaults).
    - _Requirements: 1.3, 1.5_
    - _Validation: npx vitest run --project engine packages/engine/test/core/config.test.ts passes_

  - [x] 3.44 Add a span-end example for the same-change check
    - In `test/core/report.test.ts` add an example where a Spec_Mutant and a Mechanical_Mutant have the same file, span start and replacement and differ only in the span end. Both mutants stay in the report. Add the mirror example with an identical span, where only the Spec_Mutant stays.
    - _Requirements: 8.15_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.test.ts passes_

  - [x] 3.45 Generate Spec_Mutants without twins in Property 15
    - In `test/core/report.dedup.property.test.ts` generate Spec_Mutants with a mechanical twin and Spec_Mutants without one, plus Mechanical_Mutants that differ from a Spec_Mutant only in the span end, the span start, the file or the replacement. Check that a Spec_Mutant without a twin is always kept and that a differing Mechanical_Mutant is always kept.
    - **Validates: Requirements 8.15**
    - _Requirements: 8.15_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.dedup.property.test.ts passes_

  - [x] 3.46 Add the JSON Lines functions for `history.jsonl`
    - Note: task 3.29 built `appendHistory(records, record)` over an in-memory list. This task adds the file format. `history.jsonl` is JSON Lines, one HistoryRecord per line, with no JSON array and no pretty-printing.
    - In `core/report.ts` implement `serializeHistoryRecord(record): string` (a single-line JSON object with no embedded newline, validated with the zod schema first) and `parseHistoryLines(text): Result<HistoryRecord[], HistoryError>` (parses each non-empty line as one complete JSON object, in order, and returns an error that names the line number for a malformed or schema-invalid line).
    - Export both functions and the HistoryRecord schema from `src/report/index.ts` so the viewer reads exactly this format through `trick-or-test/report`.
    - Write `test/core/history-lines.test.ts`: one record gives one line without `\n`, a record whose string fields contain newlines stays on one line, an empty file gives an empty list, a trailing newline, a blank line between records, a malformed line (error names its line number), a line that holds a JSON array instead of an object, and a schema-invalid line.
    - _Requirements: 8.8, 8.9, 8.10, 8.16_
    - _Validation: npx vitest run --project engine packages/engine/test/core/history-lines.test.ts passes_

  - [x] 3.47 Write Property 17: History lines round trip
    - Write `test/core/history-lines.property.test.ts` with **Property 17: History lines round trip**. Generate sequences of HistoryRecord values (including strings with newlines and quotes), serialize each record, join the lines as `history.jsonl` would hold them, parse with `parseHistoryLines`, and check that the same records come back in the same order, that each line is one complete JSON object, and that appending one more line leaves the earlier lines byte-identical.
    - **Validates: Requirements 8.9, 8.10, 8.16**
    - _Requirements: 8.9, 8.10, 8.16_
    - _Validation: npx vitest run --project engine packages/engine/test/core/history-lines.property.test.ts passes_

- [x] 4. Checkpoint - Core phase
  - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
  - _Validation: npm run check passes_

- [x] 5. Implement the adapters (`packages/engine/src/adapters/`)
  - [x] 5.1 Implement `file-system-adapter.ts` with tests
    - Define the `FileSystem` interface (`readFile`, `writeFile`, `copyDir`, `removeDir`, `exists`) and implement it over `node:fs/promises`. Writes return a `Result` error that names the path when the path cannot be written.
    - Write `test/adapters/file-system-adapter.test.ts` on a temp directory: read, write, copy with an exclude list, remove, exists, and a write into a read-only directory that returns the error with the path.
    - _Requirements: 8.11, 10.2_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/file-system-adapter.test.ts passes_

  - [x] 5.2 Implement `sandbox.ts` with tests
    - Implement `Sandbox.create(projectRoot, id)` that copies the project to `.trickortest/sandboxes/<id>/`, excluding `node_modules`, `.git`, `.trickortest`, `.stryker-tmp` and the output directory, writes `.trickortest/.gitignore` containing `*`, and `Sandbox.destroy(handle)`. Provide `withSandbox(projectRoot, id, fn)` that destroys in a `finally`.
    - Write `test/adapters/sandbox.test.ts`: the excluded folders are absent from the copy, `.trickortest/.gitignore` exists, destroy removes the folder, `withSandbox` removes it when `fn` throws.
    - Note: tasks 12.34, 12.38 and 12.44 add the path containment check, symlink handling, the project-relative output directory exclusion and the cleanup of leftover Sandboxes (Requirements 5.17-5.20).
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
    - Note: tasks 12.18 and 12.20 restrict the diff to the Target_Project with `--relative` and move the parsing to the core (Requirement 3.9).
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
    - Note: tasks 12.3 and 12.50 count file-level failures as Failing_Tests and exclude `.trickortest/**` from every run (Requirements 3.15, 3.20, 5.21).
    - _Requirements: 5.8, 5.9, 5.10, 5.11, 6.2_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/vitest-suite-runner.test.ts passes_

  - [x] 5.8 Implement `vitest-witness-runner.ts` with tests
    - Implement `WitnessRunner.run(sandboxRoot, witnesses)`: generate `.trickortest/witnesses/<mutant id>.witness.test.ts` that imports the `export` from `witness.from`, calls it with `args` and writes `{ kind: 'value', value }` or `{ kind: 'error', className }` to `<mutant id>.outcome.json`. Generate `.trickortest/witnesses/vitest.config.ts` that extends the target config and includes only the witness files. Read outcomes from the files, never from console output, and parse them with a zod schema.
    - Write `test/adapters/vitest-witness-runner.test.ts` on a small fixture project under `packages/engine/test/fixtures/` (for example `witness-runner/`) with extensionless TypeScript imports: a returned value, a thrown error class, a witness that fails to import, and a check that the target's own suite run ignores the generated files.
    - Note: task 12.8 adds the `timeout` and `no-outcome` results (Requirement 5.16).
    - _Requirements: 5.4, 5.5, 5.6, 5.7_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/vitest-witness-runner.test.ts passes_

  - [x] 5.9 Implement the Stryker options builder in `stryker-adapter.ts` with tests
    - Implement `buildStrykerOptions(input)` as a pure function: `plugins` lists the Vitest runner, incremental mode with `incrementalFile`, the JSON reporter with `fileName`, `tempDirName` and `disableBail`, all under `.trickortest/`; `tsconfigFile` set to a nonexistent path only when TypeScript is 7 or newer; `mutate` patterns as `file:start-end` from Changed_Ranges; exclusion of non-build folders including symlinked directories and every file under `.stryker-tmp`; `ignoreStatic` only on retry.
    - Write `test/adapters/stryker-options.test.ts`: TypeScript 6 versus 7 versus 8, the `plugins` entry, the `.trickortest/` paths, mutate patterns for one and several ranges, a symlinked directory, and `.stryker-tmp` exclusion.
    - Note: tasks 12.39 and 12.41 compute the exclusions in the core and pass the non-build and symlinked directories (Requirement 3.7).
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8, 3.9, 3.14_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-options.test.ts passes_

  - [x] 5.10 Implement the Stryker run, retry and result parsing in `stryker-adapter.ts` with tests
    - Implement `MechanicalRunner.run(options)`: return zero mutants without starting StrykerJS when `--since` finds no changed line; run StrykerJS; retry exactly once with `ignoreStatic` when the initial test run fails because of static mutants and flag the retry; return the first error line as a `Result` error for any other StrykerJS failure; parse the JSON report with a zod schema into mutants with `killedBy` and `testFiles`.
    - Write `test/adapters/stryker-adapter.test.ts` with a fake process runner: a clean run, the static-mutant failure followed by a successful retry, a retry that fails again (no second retry), another error returning the first error line, and no changed lines (the runner is never called).
    - Note: tasks 12.10, 12.11, 12.15, 12.17, 12.35, 12.43 and 12.53 change the error line, the retry rule, the location, the binary, the temporary directory and the test fixtures (Requirements 3.5, 3.6, 3.16-3.19, 10.12).
    - _Requirements: 3.5, 3.6, 3.10, 6.1_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts passes_

- [x] 6. Checkpoint - Adapters phase
  - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
  - _Validation: npm run check passes_

- [x] 7. Implement the CLI (`packages/engine/src/cli/`)
  - [x] 7.1 Implement the argument parser with tests
    - Implement a dependency-free parser for the commands `run` and `measure` and the options `--since <ref>`, `--project <path>`, `--spec <name>` and the option `--output <dir>` of `measure`. An unknown command or option returns a usage error. No option changes the exit code by survivor count.
    - Write `test/cli/args.test.ts`: each command and option, defaults (cwd as project), a missing option value, an unknown command, an unknown option.
    - _Requirements: 9.3, 9.4, 9.5, 9.8, 9.10_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/args.test.ts passes_

  - [x] 7.2 Implement the load and validate stage of the orchestration with tests
    - In `orchestrate.ts` implement the first stage: read and validate the config, find the spec directories that have a `requirements.md` (or the one given by `--spec`), parse the requirements, load the mutants and the Skip_File, and run the cross-file rules. Any error returns before the baseline and before StrykerJS. Adapters come in through interfaces.
    - Write `test/cli/orchestrate-load.test.ts` with fake adapters: a valid project, an invalid config, a parse error, a malformed mutant file (the other files still load and the run ends before the baseline), and a spec directory without `requirements.md` that is skipped.
    - Note: task 12.45 removes leftover Sandboxes at startup (Requirement 5.20), and task 12.46 selects the one spec to attack (Requirements 9.5, 9.16).
    - _Requirements: 4.4, 9.1, 9.5, 10.2, 10.3_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-load.test.ts passes_

  - [x] 7.3 Implement the baseline and mechanical stage of the orchestration with tests
    - In `orchestrate.ts` add the baseline run (record its duration) and the mechanical run through `MechanicalRunner`, with `--since` ranges from `Git`. A failing baseline returns the failing tests and a StrykerJS error returns its first error line. Neither writes a Verdict_File. Compute the id of each mechanical mutant here with `assignOccurrenceIndexes` and `computeMutantId(file, original, replacement, occurrenceIndex)` from task 3.32. Classify the species and the kill class of each mechanical mutant from `killedBy`, the extracted test bodies and the property-test globs.
    - Write `test/cli/orchestrate-mechanical.test.ts` with fake adapters: baseline failure, StrykerJS error, a normal run with killed and survived mutants, `--since` with no changes (zero mechanical mutants), a killed mutant whose killing tests are unknown (`unattributed`), and the same mechanical mutant getting the same hash id on two runs.
    - Note: tasks 12.4, 12.14, 12.21 and 12.42 change the baseline failure rule, the locations, `--since` and the StrykerJS exclusions.
    - _Requirements: 3.6, 3.15, 6.1, 6.9, 9.1, 9.3_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-mechanical.test.ts passes_

  - [x] 7.4 Implement the spec mutant stage of the orchestration with tests
    - In `orchestrate.ts` add the spec mutant pipeline: one pristine sandbox for the witnesses on the original code, then per mutant a sandbox, `applyMutation`, type-check, InvalidWitness check, mutated witness run, Ghost check, one suite run with the time limit from `computeSuiteTimeLimit`, status mapping (Killed, Survived, Timeout), kill class from the failing tests, and sandbox removal in a `finally`. Keep the order of mutants stable (by id). A Spec_Mutant keeps the id from its file; the pipeline never recomputes it.
    - Write `test/cli/orchestrate-spec-mutants.test.ts` with fake adapters, one example per path: NotApplicable, CompileError, InvalidWitness (reports both outcomes), Ghost, Killed, Survived, Timeout, a crash in the suite runner (sandbox still removed), and the same status on two runs.
    - Note: tasks 12.5, 12.9, 12.24 and 12.52 change file-level kills, the witness timeout and the InvalidWitness outcomes.
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.13, 5.14, 5.15, 6.2_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-spec-mutants.test.ts passes_

  - [x] 7.5 Implement the reporting stage of the orchestration with tests
    - In `orchestrate.ts` add the final stage: compute coverage, build the mutation report, the verdict and the history record, then write the report and the verdict to the output directory. Write `history.jsonl` as JSON Lines: read the existing file through the `FileSystem`, parse it with `parseHistoryLines` (task 3.46) to get the previous record, and append exactly one line made by `serializeHistoryRecord` (ending in `\n`), leaving every earlier line byte-identical. Never write the history as a JSON array. A history file that does not parse returns an error that names the path and the line. Pass the mutant ids to `report.ts` as data (file ids for Spec_Mutants, `computeMutantId` hashes from task 7.3 for Mechanical_Mutants). A write failure returns an error that names the path.
    - Write `test/cli/orchestrate-report.test.ts` with a fake file system: the three outputs are written, `history.jsonl` is a first line for a first run and gains exactly one line per later run with earlier lines byte-identical, every line is one JSON object, a corrupt history line is an error, a write failure names the path, two runs with the same inputs write identical report and verdict content except `metadata.timestamp`.
    - Note: task 12.28 scrubs run-time paths (Requirement 8.17).
    - _Requirements: 8.1, 8.5, 8.8, 8.9, 8.11, 8.13, 8.16, 9.1_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-report.test.ts passes_

  - [x] 7.6 Implement the CLI entry point, summary and exit codes with tests
    - Create `src/cli/main.ts` and the `bin` entry. `run` uses the configured output directory. `measure` writes into the output directory given for the command. Print the summary: surviving Spec_Mutants, count per Coverage_Status, strays and the paths written. Exit 0 on a completed run even when Spec_Mutants survive. On a configuration, parsing, baseline, StrykerJS or runtime error print the message to stderr and exit 1. An unknown command or option prints the usage to stderr and exits 1.
    - Write `test/cli/main.test.ts` with fake adapters: summary content, exit 0 with survivors, exit 1 for each error kind, usage on an unknown command and option, `measure` output directory.
    - Note: tasks 12.48 and 12.49 add SIGINT and SIGTERM handling with exit codes 130 and 143 (Requirement 9.15).
    - _Requirements: 9.1, 9.2, 9.6, 9.7, 9.9, 9.10_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/main.test.ts passes_

  - [x] 7.7 Add the no-LLM, no-network test
    - Write `test/cli/no-network.test.ts` that scans the files under `src/` and `package.json` for imports or dependencies of HTTP clients and LLM SDKs, for `fetch(`, `node:http`, `node:https` and `node:net`, and for any reference to an API key variable. The test fails with the file name.
    - _Requirements: 9.11_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/no-network.test.ts passes_

  - [x] 7.8 Pin the exact Mechanical_Mutant id in a test
    - Note: task 3.32 changed `test/core/mutant-id.test.ts` so that it only checks the 32-character hex format. Without a pinned value, a change to the hashing would pass every test.
    - Create `test/cli/mutant-id-pin.test.ts`. It calls `computeMutantId` with one fixed input (file `src/price.ts`, original `a < b`, replacement `a <= b`, occurrence index `0`) and expects the exact 32-character id string, written as a literal in the test (compute it once with the final implementation and paste it in). Add a second case with occurrence index `1` that expects a different literal id.
    - The test name states that a change to the hash input or the hash function must change the pinned values on purpose.
    - _Requirements: 8.7_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/mutant-id-pin.test.ts passes_

  - [x] 7.9 Add the root `measure` npm script
    - In the root `package.json` add the script `measure` that builds the engine and runs the built CLI as `trick-or-test measure --project examples/pricing --spec cart-pricing --output reports`, so the output directory is `reports`.
    - Add `trick-or-test` as a workspace so the `trick-or-test` bin resolves from the root scripts (it is already a workspace through `packages/*`; run `npm install` if the link is missing).
    - Add the `measure` row to the commands table in `.kiro/steering/tech.md` in the same commit. State there that files in `reports/` are generated only by `npm run measure` and are never edited by hand.
    - Write `test/cli/measure-script.test.ts` that reads the root `package.json` and checks that the `measure` script contains `trick-or-test measure`, `--project examples/pricing`, `--spec cart-pricing` and `--output reports`.
    - _Requirements: 9.2, 9.12, 9.14_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/measure-script.test.ts passes_

- [x] 8. Checkpoint - CLI phase
  - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
  - _Validation: npm run check passes_

- [x] 9. Write the end-to-end test
  - [x] 9.1 Write the end-to-end test for `examples/pricing`
    - Create `test/e2e/pricing.test.ts` that runs the built CLI (`trick-or-test measure --project examples/pricing --spec cart-pricing`, output into a temp directory) with the real StrykerJS and Vitest, and checks that the mutation report validates against `mutation-testing-report-schema`, that `verdict.json` and the history file exist and match their zod schemas, that the exit code is 0, and that a second run appends exactly one history record.
    - Hash `examples/pricing/src/` and `examples/pricing/test/` before and after the run and check that they are byte-identical, and check that `.trickortest/sandboxes/` is empty afterwards.
    - Precondition supplied by the user: before this task starts, the user adds `examples/pricing/mutants/cart-pricing/` with the 24 spec mutants bred by a Kiro agent from the cart-pricing spec. This task does not invent or add any mutant. Against the current tests, 23 are killed and `oath-7.4` survives.
    - Check that all 24 spec mutants are valid (none has the status Ghost, InvalidWitness, CompileError or NotApplicable), that `oath-7.4` is Survived and criterion 7.4 is unguarded in `verdict.json`, and that the other 23 are Killed.
    - The test runs only from `npm run test:e2e --workspace trick-or-test`, never from `npm test`.
    - Note: task 12.54 strengthens this test (git status, absolute paths, `stryker-tmp` size) and requires a new run of it.
    - _Requirements: 10.8, 10.9, 10.10_
    - _Validation: npm run test:e2e --workspace trick-or-test passes_

  - [x] 9.2 Run `npm run measure` once and commit `reports/`
    - Run `npm run measure` from the repository root. The command writes the mutation report (`reports/mutation-report.json`), `reports/verdict.json` and `reports/history.jsonl` through the CLI. Nobody edits these files by hand. If the output is wrong, fix the engine and run the script again.
    - Check that `reports/history.jsonl` has exactly one line for this first run, and that the line parses as one JSON object.
    - Commit the three files in `reports/` with `git add reports` and a Conventional Commits message (for example `chore(reports): add first measure run`).
    - A first run stored resolved absolute paths in the configuration of the history record. Fix: `writeReports` records the configuration relative to the Target_Project root (Requirement 8.17). Test in `test/cli/orchestrate-report-paths.test.ts`. Delete the generated `reports/` files and run the script again, so history starts with one line.
    - Note: task 12.55 regenerates `reports/` after the fixes of task 12.
    - Precondition: tasks 7.9 and 9.1 are done, and `examples/pricing/mutants/cart-pricing/` holds the spec mutants.
    - _Requirements: 8.2, 8.17, 9.2, 9.13, 9.14_
    - _Validation: npm run measure && test -f reports/mutation-report.json && test -f reports/verdict.json && test -f reports/history.jsonl passes_

- [x] 10. Final checkpoint - Whole engine
  - Run `npm run check` from the repository root, then run the end-to-end test. Ensure all tests pass, ask the user if questions arise.
  - _Validation: npm run check passes_

- [x] 11. Give Property 13 an explicit timeout
  - test/adapters/sandbox.property.test.ts runs 100 generated sequences of real sandbox copies and removals. It is I/O bound and timed out at Vitest's default 5 seconds when the machine was busy (two worktrees running npm run check at once). Pass an explicit timeout of 60 seconds to that test (the last argument of it). Do not lower numRuns and do not change what the property checks.
  - _Requirements: 3.14, 5.1, 5.13, 10.10_
  - _Validation: npx vitest run --project engine packages/engine/test/adapters/sandbox.property.test.ts passes_

- [ ] 12. Fix the defects found in the independent review of the adapters and the CLI
  - Source of the fixes: `requirements.md` criteria 3.5-3.7, 3.9, 3.15-3.20, 4.5, 4.11, 4.12, 5.6, 5.8-5.11, 5.16-5.21, 8.17, 9.5, 9.15, 9.16, 10.11-10.13, and properties 18-25 in `design.md`. The design decides that one run attacks exactly one spec, and that the Baseline_Run and the StrykerJS run happen once per run.
  - One fix per task. Each task writes its tests in the same task: examples in `*.test.ts`, properties in `*.property.test.ts` with the name `Property N: <title>`.
  - Completed tasks keep their status and text. Where an earlier task contradicts a rule below, it carries a short note that points to the fix task.
  - Tests that parse StrykerJS output or a Vitest JSON result use output captured from a real run (StrykerJS 10.1.1, the Vitest of the repository), stored under `packages/engine/test/fixtures/`. Run the real tool with the shell, then write the captured text with the file tools. Do not write invented output.

  - [x] 12.1 Count file-level failures as Failing_Tests in `core/suite-result.ts`
    - Create `core/suite-result.ts` with `extractFailingTests(vitestJson): FailingTest[]` as in `design.md`: every test with status `failed` is a Failing_Test; a test file with status `failed` and no assertion results (an error at import or collection) is one Failing_Test whose name and `filePath` are the file path; a failed file that also has failed assertions yields only those assertions.
    - Write `test/core/suite-result.test.ts`: a failed assertion, a file that throws at import, a file that fails at collection, a failed file with failed assertions (only the assertions), a passing run (empty list), several failed files in file order.
    - _Requirements: 3.15, 5.9, 5.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/suite-result.test.ts passes_

  - [x] 12.2 Write Property 21: Failing tests include file-level failures
    - Write `test/core/suite-result.property.test.ts` with **Property 21: Failing tests include file-level failures**. Generate Vitest JSON results with passed, failed and file-level-failed entries and check the rule stated in the property.
    - **Validates: Requirements 3.15, 5.9, 5.10**
    - _Requirements: 3.15, 5.9, 5.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/suite-result.property.test.ts passes_

  - [x] 12.3 Use `extractFailingTests` in the suite runner
    - In `adapters/vitest-suite-runner.ts` build the list of failing tests with `extractFailingTests`, so a run with a file-level failure is not reported as passing. Add a fixture project under `test/fixtures/` whose test file throws at import; the Vitest JSON result for it is captured from a real run.
    - Add examples to `test/adapters/vitest-suite-runner.test.ts`: the import-error fixture returns one failing test named after the file, and a normal failing test still returns its start line.
    - _Requirements: 3.15, 5.9_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/vitest-suite-runner.test.ts passes_

  - [x] 12.4 Abort the run on a file-level failure in the Baseline_Run
    - In `cli/orchestrate.ts` make the baseline stage abort when the suite runner returns any Failing_Test, including a file-level failure, report the failing tests (the file path for a file-level failure) and write no Verdict_File.
    - Add examples to `test/cli/orchestrate-mechanical.test.ts`: a baseline whose only failure is a file that fails to load aborts the run, names the file and writes nothing.
    - _Requirements: 3.15_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-mechanical.test.ts passes_

  - [x] 12.5 Kill a Spec_Mutant on a file-level failure
    - In `cli/orchestrate.ts` (spec mutant stage) map a suite run with a file-level failure to the Mutant_Status Killed, with the file path as the killing test. A mutant that only breaks an import is Killed, not Survived.
    - Add examples to `test/cli/orchestrate-spec-mutants.test.ts`: a mutant that makes a test file fail at import is Killed with that file in its killing tests; a run with no failure is still Survived.
    - _Requirements: 5.9, 5.10, 6.2_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-spec-mutants.test.ts passes_

  - [x] 12.6 Add witness outcomes `timeout` and `no-outcome` to `core/witness-compare.ts`
    - Implement `matchesExpectation(expected, actual)` and `compareOutcomes(original, mutated): "same" | "different"` over a `WitnessOutcome` of kind `value`, `error`, `timeout` or `no-outcome` (with a message). Export the `WitnessOutcome` type from this module. A `timeout` or `no-outcome` never matches an expectation. A `timeout` of the mutated code against an original outcome that is not itself a `timeout` is `different`. Values keep the JSON-form comparison of task 3.42. Keep `compareWitnessOutcome` only if other code still calls it, and delegate it to the new functions.
    - Add examples to `test/core/witness-compare.test.ts`: timeout on the mutated code, timeout on both, timeout on the original only, `no-outcome` against a value, equal and unequal values, `-0` against `0`.
    - _Requirements: 5.6, 5.7, 5.12, 5.16_
    - _Validation: npx vitest run --project engine packages/engine/test/core/witness-compare.test.ts passes_

  - [x] 12.7 Write Property 22: A witness timeout is a difference, not a kill
    - Write `test/core/witness-compare.property.test.ts` with **Property 22: A witness timeout is a difference, not a kill**. Check `compareOutcomes`, `matchesExpectation` for `timeout` and `no-outcome`, and that no function of the witness stage returns the Mutant_Status Timeout or Killed.
    - **Validates: Requirements 5.6, 5.7, 5.8, 5.11, 5.12, 5.16**
    - _Requirements: 5.6, 5.7, 5.8, 5.11, 5.12, 5.16_
    - _Validation: npx vitest run --project engine packages/engine/test/core/witness-compare.property.test.ts passes_

  - [x] 12.8 Report witness timeout and missing outcome from the witness runner
    - In `adapters/vitest-witness-runner.ts` give each witness a time limit and return the outcome `timeout` when it is exceeded and `no-outcome` with a message when the outcome file is missing or unreadable (the file is still the only source of the outcome). Parse every outcome with the zod schema.
    - Add a hanging function to the `witness-runner/` fixture and add examples to `test/adapters/vitest-witness-runner.test.ts`: a witness that hangs gives `timeout`, a witness whose import fails gives `no-outcome` with a message, and the other witnesses of the same run still give their outcomes.
    - _Requirements: 5.4, 5.5, 5.16_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/vitest-witness-runner.test.ts passes_

  - [x] 12.9 Run the suite when the witness times out on the mutated code
    - In `cli/orchestrate.ts` (spec mutant stage) use `compareOutcomes` and `matchesExpectation`. A `timeout` of the mutated code is a difference, so the suite runs and the status comes from that run (Killed, Survived or Timeout by the suite time limit). A witness timeout alone never gives Timeout or Killed. A `timeout` or `no-outcome` on the original code gives InvalidWitness.
    - Add examples to `test/cli/orchestrate-spec-mutants.test.ts`: witness timeout on mutated code with a passing suite is Survived; with a failing suite is Killed; witness timeout on the original code is InvalidWitness; the suite runner is called in the first case.
    - _Requirements: 5.6, 5.8, 5.16_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-spec-mutants.test.ts passes_

  - [x] 12.10 Keep the StrykerJS mutant location in `core/stryker-output.ts`
    - Create `core/stryker-output.ts` with `parseStrykerReport(raw): Result<StrykerReport, ParseError>`: a zod schema that keeps for each mutant `location` (start and end line and column), `mutatorName`, `replacement`, `status`, `killedBy` and `testFiles`.
    - Capture a real StrykerJS 10.1.1 JSON report from a small throwaway project and store it under `test/fixtures/stryker/`.
    - Write `test/core/stryker-output.test.ts`: the captured report parses and every mutant keeps its four location numbers, a report without `location` is an error that names the field, an unknown extra field is accepted.
    - _Requirements: 3.16, 10.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/stryker-output.test.ts passes_

  - [x] 12.11 Return the location from `MechanicalRunner`
    - In `adapters/stryker-adapter.ts` replace the local report parsing by `parseStrykerReport` and return the start and end line and column on each mechanical mutant.
    - Add examples to `test/adapters/stryker-adapter.test.ts`, with the captured report as the fake process output: each returned mutant has its start line, start column, end line and end column.
    - _Requirements: 3.16, 10.12_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts passes_

  - [ ] 12.12 Order the Occurrence_Index by the real location
    - Put `assignOccurrenceIndexes` in `core/occurrence.ts` as in `design.md` (no `node:` import; if task 3.32 left it in `core/mutant-id.ts`, move it and its tests and update the imports). Group by file, original and replacement, sort each group by start line and then start column from the StrykerJS location, and return each position.
    - Add `test/core/occurrence.test.ts`: three mutants in one group given in shuffled order, two groups, two mutants on the same line ordered by column, and a mutant whose id does not change when unrelated lines above it move.
    - _Requirements: 8.7, 3.16_
    - _Validation: npx vitest run --project engine packages/engine/test/core/occurrence.test.ts passes_

  - [ ] 12.13 Write the location into the Mutation_Report and compare it in the same-change check
    - In `core/report.ts` write the start and end line and column of each Mechanical_Mutant into the schema `location`, and use start and end location plus replacement in the 8.15 same-change check (no span offsets, no ids).
    - Add examples to `test/core/report.test.ts`: the report location equals the input location, a Spec_Mutant and a Mechanical_Mutant with equal start and end location and replacement give one mutant, and the same pair differing only in the end column gives two.
    - _Requirements: 3.16, 8.15_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.test.ts passes_

  - [ ] 12.14 Pass real locations through the mechanical stage
    - In `cli/orchestrate.ts` (mechanical stage) pass the StrykerJS locations to `assignOccurrenceIndexes` and to the report input, so ids and the report use the real positions.
    - Add examples to `test/cli/orchestrate-mechanical.test.ts`: two identical changes at different lines get different ids, the ids do not change when unrelated lines move, and the report input carries the location. Note: the pinned ids of task 7.8 do not change.
    - _Requirements: 3.16, 8.7_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-mechanical.test.ts passes_

  - [ ] 12.15 Select the StrykerJS error line and the retry condition from real output
    - In `core/stryker-output.ts` add `extractStrykerError(output)` (first ERROR-level line, otherwise the last non-empty line, a fixed message that names the missing output for an empty string, total on any string) and `shouldRetryWithIgnoreStatic(attempt)` (true only when the dry run failed and the output shows static mutants). Copy the log markers from captured output.
    - Capture real StrykerJS 10.1.1 output for: a successful run, a failed dry run with static mutants, a failed dry run without static mutants, and a failure after a successful dry run. Store them under `test/fixtures/stryker/`.
    - Add examples to `test/core/stryker-output.test.ts`, one per captured output, plus an empty output and an output with only blank lines.
    - _Requirements: 3.5, 3.6, 3.17, 10.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/stryker-output.test.ts passes_

  - [ ] 12.16 Write Property 23: StrykerJS error selection
    - Write `test/core/stryker-output.property.test.ts` with **Property 23: StrykerJS error selection**. Generate outputs with and without ERROR-level lines, with blank lines and arbitrary text, and attempts that failed before and after a successful dry run.
    - **Validates: Requirements 3.5, 3.6, 3.17**
    - _Requirements: 3.5, 3.6, 3.17_
    - _Validation: npx vitest run --project engine packages/engine/test/core/stryker-output.property.test.ts passes_

  - [ ] 12.17 Use the error line and the retry rule in `MechanicalRunner`
    - In `adapters/stryker-adapter.ts` return `extractStrykerError` output for a failed run, retry exactly once with `ignoreStatic` only when `shouldRetryWithIgnoreStatic` is true, never retry after a successful dry run, and set the retry flag only when a retry happened.
    - Add examples to `test/adapters/stryker-adapter.test.ts` with the captured outputs as the fake process output: the failed dry run with static mutants is retried once and flagged, a second failure is not retried, a failure after a successful dry run is not retried and not flagged, and the error line is the first ERROR-level line.
    - _Requirements: 3.5, 3.6, 3.17, 10.12_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts passes_

  - [ ] 12.18 Parse relative Changed_Ranges in `core/changed-ranges.ts`
    - Create `core/changed-ranges.ts` with `parseChangedRanges(diffText, sourceGlobs): ChangedRange[]` for the output of `git diff --relative --unified=0`: project-relative paths, only files that match the source globs, no range for a pure deletion, `start <= end`, sorted by file and then start line.
    - Write `test/core/changed-ranges.test.ts`: one hunk, several hunks in one file, a pure deletion, a file outside the source globs, a file outside the project directory (path with `..` or not relative), a count-less hunk header (`@@ -1 +1 @@`), an empty diff.
    - _Requirements: 3.9, 3.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/changed-ranges.test.ts passes_

  - [ ] 12.19 Write Property 25: Changed ranges are relative and match the source globs
    - Write `test/core/changed-ranges.property.test.ts` with **Property 25: Changed ranges are relative and match the source globs**. Generators produce diffs with files outside the source globs and files outside the project directory.
    - **Validates: Requirements 3.9, 3.10**
    - _Requirements: 3.9, 3.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/changed-ranges.property.test.ts passes_

  - [ ] 12.20 Restrict the git diff to the Target_Project in `git-adapter.ts`
    - In `adapters/git-adapter.ts` run `git diff --relative --unified=0 <ref> -- .` from the Target_Project root and return the diff text; remove the range parsing from the adapter (the core function parses it).
    - Add examples to `test/adapters/git-adapter.test.ts` on a temp git repository whose Target_Project is a subdirectory (a monorepo layout): a change inside the project gives a project-relative path, a change in a sibling directory does not appear, no change gives an empty text, an unknown ref returns an error.
    - _Requirements: 3.9, 3.10_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/git-adapter.test.ts passes_

  - [ ] 12.21 Use `parseChangedRanges` for `--since` in the mechanical stage
    - In `cli/orchestrate.ts` read the diff through the git adapter, call `parseChangedRanges` with the source globs and build the mutate patterns from the result. No changed line in a source file gives zero Mechanical_Mutants and StrykerJS is not started.
    - Add examples to `test/cli/orchestrate-mechanical.test.ts` with a fake git adapter: patterns are project-relative, a changed file outside the source globs is dropped, no changed line never calls the runner.
    - _Requirements: 3.9, 3.10, 9.3_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-mechanical.test.ts passes_

  - [ ] 12.22 Write both outcomes of an InvalidWitness mutant into the Verdict
    - In `core/types.ts` and `core/report.ts` add `invalidWitness: { expected, originalOutcome }` to the Verdict entry of a mutant with status InvalidWitness, with its zod schema, and no such field for other statuses.
    - Add examples to `test/core/verdict.test.ts`: an InvalidWitness mutant carries both outcomes, `originalOutcome` of kind `timeout` and `no-outcome` validates, a Killed mutant has no `invalidWitness`.
    - _Requirements: 5.6, 8.5_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict.test.ts passes_

  - [ ] 12.23 Extend Property 16 with InvalidWitness and outcome kinds
    - In `test/core/verdict.property.test.ts` generate mutants with status InvalidWitness that carry `invalidWitness`, and outcomes of kind `timeout` and `no-outcome`. The write, read, write round trip still produces identical content.
    - **Validates: Requirements 5.6, 8.5, 8.10, 8.12**
    - _Requirements: 5.6, 8.5, 8.10, 8.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict.property.test.ts passes_

  - [ ] 12.24 Carry both outcomes from the pipeline to the Verdict
    - In `cli/orchestrate.ts` make the InvalidWitness result carry the expectation and the outcome of the original code into the report input.
    - Add examples to `test/cli/orchestrate-spec-mutants.test.ts`: an InvalidWitness result holds `expected` and `originalOutcome` for a value, an error class and a timeout.
    - _Requirements: 5.6_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-spec-mutants.test.ts passes_

  - [ ] 12.25 Add `core/paths.ts`
    - Create `core/paths.ts` with `relativizePath(projectRoot, p)`, `scrubAbsolutePaths(text, projectRoot)` and `containsAbsolutePath(text)` as in `design.md`, without `node:` imports.
    - Write `test/core/paths.test.ts`: a path under the root, the root itself, a path outside the root (`<outside-project>/<basename>`), a Windows drive path, a UNC path, a URL (not a path), free text with several paths, text without paths, and `containsAbsolutePath` on each.
    - _Requirements: 8.17_
    - _Validation: npx vitest run --project engine packages/engine/test/core/paths.test.ts passes_

  - [ ] 12.26 Relativize every path in the report builders
    - In `core/report.ts` give each builder the `projectRoot` as data, relativize every path and scrub every free-text field (mutant descriptions, `statusReason`, error text, NotApplicable read errors, NoOutcome messages, configuration paths) through `core/paths.ts` before the field is created.
    - Add examples to `test/core/report.test.ts`, `test/core/verdict.test.ts` and `test/core/history.test.ts`: an absolute path inside a message becomes the relative path, a path outside the root becomes `<outside-project>/<basename>`, a config path under the root is relative, and `containsAbsolutePath` is false for every string in each output.
    - _Requirements: 8.17_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.test.ts packages/engine/test/core/verdict.test.ts packages/engine/test/core/history.test.ts passes_

  - [ ] 12.27 Write Property 20: No absolute path in any report field
    - Write `test/core/report.paths.property.test.ts` with **Property 20: No absolute path in any report field**. Generate run inputs with absolute paths under and outside the root in every string field, check every string in the three outputs, and check `join(root, relativizePath(root, p)) === p` for paths under the root.
    - **Validates: Requirements 8.17**
    - _Requirements: 8.17_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.paths.property.test.ts passes_

  - [ ] 12.28 Scrub run-time paths in the orchestration and extend the path test
    - In `cli/orchestrate.ts` pass `projectRoot` to every builder and make the NotApplicable read errors and the NoOutcome messages enter the report input as they are (the core scrubs them).
    - Extend `test/cli/orchestrate-report-paths.test.ts`: add one NotApplicable mutant (a read error that holds an absolute path) and one NoOutcome mutant (a message that holds an absolute path) to the existing no-absolute-path run, and check that no string in the written report, verdict and history line contains an absolute path.
    - _Requirements: 8.17_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-report-paths.test.ts passes_

  - [ ] 12.29 Validate Spec_Mutant paths and ids in the loader
    - In `core/spec-mutants.ts` add `isSafeRelativePath` and `isSafeMutantId` and make `validateSpecMutant` reject a `file` or `witness.from` (after the default of 4.3) that is empty, absolute (`/`, drive letter, UNC, leading `~`), has a `..` segment, a backslash or a NUL, and an `id` outside `^[A-Za-z0-9._-]+$` or with `..`. Each error names the mutant file and the field.
    - Add examples to `test/core/spec-mutants.test.ts`: one example per rejected form for `file`, `witness.from` and `id`, an accepted nested relative path, and a mutant without `from` whose `file` is unsafe.
    - _Requirements: 4.3, 4.11, 4.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/spec-mutants.test.ts passes_

  - [ ] 12.30 Write Property 18: Spec mutant path safety
    - Write `test/core/spec-mutants.property.test.ts` with **Property 18: Spec mutant path safety**. Generators mix safe values with absolute paths, `..` at the start, middle and end, separators in ids, and ids with spaces and Unicode.
    - **Validates: Requirements 4.3, 4.11, 4.12**
    - _Requirements: 4.3, 4.11, 4.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/spec-mutants.property.test.ts passes_

  - [ ] 12.31 Add `resolveInside` in `core/sandbox-plan.ts`
    - Create `core/sandbox-plan.ts` with `resolveInside(root, relative): Result<string, PathEscapeError>`: join, normalize and fail when the result is not inside `root`. Define the `ProjectEntry` type (`path`, `kind`, `target?`).
    - Write `test/core/sandbox-plan.test.ts`: a nested path, `..` that stays inside, `..` that escapes, an absolute path, the root itself, a sibling directory with the root as name prefix (`/a/b` against `/a/bc`).
    - _Requirements: 5.17_
    - _Validation: npx vitest run --project engine packages/engine/test/core/sandbox-plan.test.ts passes_

  - [ ] 12.32 Plan symlinks and fixed exclusions in `planSandboxCopy`
    - In `core/sandbox-plan.ts` add `planSandboxCopy(entries, outputDirRelative)` returning `copy`, `skip` or `link` for each entry: always skip `node_modules`, `.git`, `.trickortest` and `.stryker-tmp`; a symlink whose resolved target is outside the project is `skip`; one inside is `link` with a relative target inside the Sandbox. The output directory rule comes in task 12.36.
    - Add examples to `test/core/sandbox-plan.test.ts`: link inside, link outside, link to a file and to a directory, the four fixed skips, a nested `node_modules` skip.
    - _Requirements: 5.18_
    - _Validation: npx vitest run --project engine packages/engine/test/core/sandbox-plan.test.ts passes_

  - [ ] 12.33 List project entries in the file system adapter
    - In `adapters/file-system-adapter.ts` add `listEntries(root): ProjectEntry[]`: files, directories and symlinks with project-relative paths and symlink targets resolved to project-relative paths (a target outside the project is kept as an outside marker the plan can detect). Add it to the `FileSystem` interface.
    - Add examples to `test/adapters/file-system-adapter.test.ts` on a temp directory: files, nested directories, a link to a file inside, a link to a directory inside, a link outside the project, a broken link.
    - _Requirements: 5.18, 3.7_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/file-system-adapter.test.ts passes_

  - [ ] 12.34 Make the Sandbox copy follow the plan and check every write
    - In `adapters/sandbox.ts` build the copy from `listEntries` and `planSandboxCopy`, call `resolveInside` before every write, recreate inside links as relative links, skip outside links and log a warning. A path that escapes the Sandbox returns an error, destroys the Sandbox and ends the run with exit code 1.
    - Add examples to `test/adapters/sandbox.test.ts` on a temp project: a link to a directory outside the project is not in the Sandbox and nothing outside is written through it, a link inside works inside the Sandbox, an escaping path returns an error and leaves no Sandbox.
    - _Requirements: 5.17, 5.18_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/sandbox.test.ts passes_

  - [ ] 12.35 Run the StrykerJS binary from `node_modules/.bin`
    - In `adapters/stryker-adapter.ts` build the command from `<project>/node_modules/.bin/stryker`, or from the package manager with `--no-install`, so that a missing binary is an error and never a download.
    - Add examples to `test/adapters/stryker-adapter.test.ts`: the fake process runner receives the local binary path, a project without the binary returns an error that names the missing binary, and no argument list contains a bare `npx` without `--no-install`. Add `test/cli/no-npx.test.ts` that scans `src/` for `npx` calls without `--no-install`.
    - _Requirements: 3.18_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts packages/engine/test/cli/no-npx.test.ts passes_

  - [ ] 12.36 Exclude the output directory by its project-relative path
    - In `core/sandbox-plan.ts` make `planSandboxCopy` skip only the entry whose project-relative path equals `outputDirRelative`.
    - Add examples to `test/core/sandbox-plan.test.ts`: `reports` is skipped when it is the output directory, `src/reports` is copied, an output directory nested like `out/reports` is skipped only at that path.
    - _Requirements: 5.19_
    - _Validation: npx vitest run --project engine packages/engine/test/core/sandbox-plan.test.ts passes_

  - [ ] 12.37 Write Property 19: Sandbox path containment
    - Write `test/core/sandbox-plan.property.test.ts` with **Property 19: Sandbox path containment**. Generate project listings with links inside and outside the project, `..` segments and an output directory, and check every statement of the property.
    - **Validates: Requirements 5.17, 5.18, 5.19**
    - _Requirements: 5.17, 5.18, 5.19_
    - _Validation: npx vitest run --project engine packages/engine/test/core/sandbox-plan.property.test.ts passes_

  - [ ] 12.38 Apply the relative output directory rule in the Sandbox adapter
    - In `adapters/sandbox.ts` pass the output directory relative to the project root to `planSandboxCopy`. Replace any exclusion by directory name.
    - Add examples to `test/adapters/sandbox.test.ts`: with the output directory `reports`, `reports/` is absent from the Sandbox and `src/reports/` is present.
    - _Requirements: 5.19_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/sandbox.test.ts passes_

  - [ ] 12.39 Compute the StrykerJS exclusions in `core/stryker-exclusions.ts`
    - Create `core/stryker-exclusions.ts` with `computeStrykerExclusions(listing, buildRoots)` as in `design.md`: every top-level directory that is not a build root in `nonBuildDirs`, every directory reached through a symlink in `symlinkedDirs`, `ignorePatterns` as the sorted, de-duplicated union with `.stryker-tmp`, `.trickortest` and the output directory as `<dir>/**`.
    - Write `test/core/stryker-exclusions.test.ts`: a typical project, a build root never listed, a symlinked directory, a symlink to a file (not listed), `.stryker-tmp` and `.trickortest` always present, input order changed gives the same output.
    - _Requirements: 3.7, 3.8_
    - _Validation: npx vitest run --project engine packages/engine/test/core/stryker-exclusions.test.ts passes_

  - [ ] 12.40 Write Property 24: Stryker exclusion list
    - Write `test/core/stryker-exclusions.property.test.ts` with **Property 24: Stryker exclusion list**.
    - **Validates: Requirements 3.7, 3.8**
    - _Requirements: 3.7, 3.8_
    - _Validation: npx vitest run --project engine packages/engine/test/core/stryker-exclusions.property.test.ts passes_

  - [ ] 12.41 Pass the exclusions to StrykerJS in `buildStrykerOptions`
    - In `adapters/stryker-adapter.ts` take the result of `computeStrykerExclusions` as an input of `buildStrykerOptions` and pass `nonBuildDirs`, `symlinkedDirs` and `ignorePatterns` to the Stryker sandbox exclusion and ignore options.
    - Add examples to `test/adapters/stryker-options.test.ts`: a non-build directory and a symlinked directory appear in the options, a build root does not, `.stryker-tmp/**` is ignored.
    - _Requirements: 3.7, 3.8_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-options.test.ts passes_

  - [ ] 12.42 List the project and compute the exclusions in the mechanical stage
    - In `cli/orchestrate.ts` call `listEntries`, derive the build roots from the source and test globs, call `computeStrykerExclusions` and pass the result to the Stryker adapter.
    - Add examples to `test/cli/orchestrate-mechanical.test.ts` with a fake file system: the options passed to the fake runner list a non-build directory and a symlinked directory.
    - _Requirements: 3.7, 3.8_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-mechanical.test.ts passes_

  - [ ] 12.43 Remove the StrykerJS temporary directory after every run
    - In `adapters/stryker-adapter.ts` remove the directory `.trickortest/stryker-tmp` in a `finally`, on success and on failure, and also after the retry.
    - Add examples to `test/adapters/stryker-adapter.test.ts` with a fake file system: removed after a clean run, after a failed run, after a retry, and after a thrown error.
    - _Requirements: 3.19_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts passes_

  - [ ] 12.44 Remove leftover Sandboxes in `sandbox.ts`
    - In `adapters/sandbox.ts` add `removeLeftoverSandboxes(projectRoot)` that removes every entry under `.trickortest/sandboxes` and returns the number removed. A missing directory is not an error.
    - Add examples to `test/adapters/sandbox.test.ts`: two leftover Sandboxes are removed, a missing directory returns zero, files outside `.trickortest/sandboxes` are untouched.
    - _Requirements: 5.20_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/sandbox.test.ts passes_

  - [ ] 12.45 Call the leftover cleanup at startup
    - In `cli/orchestrate.ts` call `removeLeftoverSandboxes` before the load stage.
    - Add an example to `test/cli/orchestrate-load.test.ts`: a fake Sandbox adapter that reports two leftovers is called once, before the first config read.
    - _Requirements: 5.20_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-load.test.ts passes_

  - [ ] 12.46 Select the one spec to attack in `core/select-spec.ts` and wire the load stage and the CLI
    - Create `core/select-spec.ts` with `selectSpec(specNames, requested?): Result<string, SpecSelectionError>` as in `design.md`. It returns the requested name when it is in the list. When `requested` is absent it returns the single name of a one-name list, and an error that lists every spec name (sorted) and asks for `--spec <name>` when the list has several names. It returns an error that names the unlisted `--spec` value and lists the available names when `requested` is not in the list, and a "no spec found" error for an empty list. The function is pure, has no `node:` import and does not read the file system; the shell supplies the list.
    - Write `test/core/select-spec.test.ts`: requested name listed, requested name listed among several, one spec without `requested`, several specs without `requested` (the error lists all names and asks for `--spec <name>`), unlisted `requested` (the error names it and lists the available names), empty list with and without `requested`, input order does not change the message.
    - In `cli/orchestrate.ts` (load stage, after the leftover cleanup of task 12.45) list the spec directories that have a `requirements.md` through the `FileSystem`, call `selectSpec` with the `--spec` value, and on an error return it before the baseline and before StrykerJS, so the CLI prints it to stderr and exits 1 through the existing error path of task 7.6. Load the requirements, the Spec_Mutants and the Skip_File of the selected spec only. Criterion ids and mutant ids keep their plain format.
    - Write `test/cli/orchestrate-select-spec.test.ts` with fake adapters, run through the CLI entry point: two specs without `--spec` exit 1 with an error on stderr that lists both names and asks for `--spec <name>`, and neither the baseline nor StrykerJS runs; two specs with `--spec <name>` attack only that spec (the other spec's mutants are never loaded); one spec without `--spec` still runs; an unknown `--spec` exits 1 with an error that lists the available names; no spec directory with a `requirements.md` exits 1 with the "no spec found" error.
    - _Requirements: 9.5, 9.16, 9.9_
    - _Validation: npx vitest run --project engine packages/engine/test/core/select-spec.test.ts packages/engine/test/cli/orchestrate-select-spec.test.ts passes_

  - [ ] 12.47 Track and kill child process groups in the process runner
    - In `adapters/process-runner.ts` (create it if the spawn code is elsewhere and route the Vitest, StrykerJS, type-check and git adapters through it) spawn each child in its own process group, keep a registry of live children and add `killAll(signal)` that stops every group.
    - Write `test/adapters/process-runner.test.ts` with real short-lived Node child processes: a child that spawns a grandchild is stopped together with it, `killAll` with no child does nothing, a finished child leaves the registry.
    - _Requirements: 9.15_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/process-runner.test.ts passes_

  - [ ] 12.48 Add the shutdown coordinator in `cli/shutdown.ts`
    - Create `cli/shutdown.ts` with `installShutdown({ process, runner, removeLeftoverSandboxes, projectRoot })`: on SIGINT or SIGTERM call `runner.killAll`, remove the Sandboxes, then exit with code 130 or 143. A second signal during cleanup does not start a second cleanup. The process object is injected.
    - Write `test/cli/shutdown.test.ts` with fakes: SIGINT gives 130, SIGTERM gives 143, the order is kill children, remove Sandboxes, exit, a second signal is ignored, a cleanup error still exits with the signal code.
    - _Requirements: 9.15_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/shutdown.test.ts passes_

  - [ ] 12.49 Install the shutdown handlers in the CLI entry point
    - In `cli/main.ts` install the handlers at the start of `run` and `measure`, before any child is spawned.
    - Add examples to `test/cli/main.test.ts`: the handlers are installed before the first adapter call, and a signal during a fake long run ends with 130 or 143 and calls the cleanup.
    - _Requirements: 9.15_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/main.test.ts passes_

  - [ ] 12.50 Exclude `.trickortest/**` from every suite run
    - In `adapters/vitest-suite-runner.ts` pass an exclusion of `.trickortest/**` (and the generated Witness files) to every run of the suite, so the Baseline_Run and the Sandbox runs never run the tests inside a StrykerJS sandbox or a Witness file.
    - Add examples to `test/adapters/vitest-suite-runner.test.ts` with a fixture that holds a failing test file under `.trickortest/stryker-tmp/`: the run passes and does not list that file.
    - _Requirements: 3.20, 5.21_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/vitest-suite-runner.test.ts passes_

  - [ ] 12.51 Make the narrow-include suite runner test able to fail
    - In `test/adapters/vitest-suite-runner.test.ts` replace the test that uses the narrow-include fixture: the fixture holds a passing test that matches the include and a failing test that the include does not match, and the test asserts the exact list of test files that ran and the failing count. Check that the test fails when the exclusion of task 12.50 or the include is removed (run it once with the exclusion removed and put the result in the commit body).
    - _Requirements: 10.13_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/vitest-suite-runner.test.ts passes_

  - [ ] 12.52 Read the written Verdict in the InvalidWitness test
    - Create `test/cli/orchestrate-invalid-witness.test.ts`: run the pipeline with fake adapters that give an InvalidWitness result, take the content that the Reporter writes to the fake file system, parse `verdict.json` with the zod schema and check status, `expected` and `originalOutcome` in the parsed file. Remove the same assertion on an in-memory value from `test/cli/orchestrate-spec-mutants.test.ts` only if it is a duplicate; do not weaken the other assertions.
    - _Requirements: 10.13, 5.6_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-invalid-witness.test.ts passes_

  - [ ] 12.53 Replace invented StrykerJS output in the adapter tests
    - In `test/adapters/stryker-adapter.test.ts` replace every fake process output that was written by hand (clean run, static-mutant failure, other error) by the captured real StrykerJS 10.1.1 fixtures of tasks 12.10 and 12.15. If a case has no captured output yet (for example a failed run without a JSON report), capture it from a real run.
    - Check with `grep` that no inline StrykerJS log text remains in the test file.
    - _Requirements: 10.12_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts passes_

  - [ ] 12.54 Strengthen the end-to-end test
    - In `test/e2e/pricing.test.ts` add: `git status --porcelain examples/pricing` shows no change outside `.trickortest/` after the run; every string in the written report, verdict and history line satisfies `containsAbsolutePath === false`; the size of `.trickortest/stryker-tmp` after the second run is not larger than after the first run; `.trickortest/sandboxes/` is empty.
    - Note: this task changes the test only. Re-run `npm run test:e2e --workspace trick-or-test` after the fixes of tasks 12.1 to 12.53, because they change ids, locations and paths in the written files.
    - _Requirements: 10.10, 10.11_
    - _Validation: npm run test:e2e --workspace trick-or-test passes_

  - [ ] 12.55 Regenerate `reports/` with `npm run measure`
    - Note: task 9.2 committed `reports/` before these fixes. Mutant locations, Occurrence_Index ids and relative paths changed, so the committed files are stale. Delete the generated files in `reports/`, run `npm run measure` from the repository root, check that `reports/history.jsonl` has exactly one line and that no string in the three files holds an absolute path, and commit the three files. Nobody edits them by hand.
    - _Requirements: 8.17, 9.13, 9.14_
    - _Validation: npm run measure && test -f reports/mutation-report.json && test -f reports/verdict.json && test -f reports/history.jsonl passes_

  - [ ] 12.56 Checkpoint - Review fixes
    - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

## Notes

- Task 12 collects the fixes of the independent review. Properties 18 to 25 of `design.md` have their own tasks: P18 (12.30), P19 (12.37), P20 (12.27), P21 (12.2), P22 (12.7), P23 (12.16), P24 (12.40), P25 (12.19). Task 12.23 extends Property 16.
- Every task is required. No task is optional.
- Each of the 17 correctness properties in `design.md` has its own task: P1 (3.8), P2 (3.9), P3 (3.21), P4 (3.22), P5 (3.16), P6 (3.19), P7 (3.25), P8 (3.4), P9 (3.6), P10 (3.17), P11 (3.14), P12 (3.23), P13 (5.3), P14 (3.30), P15 (3.26), P16 (3.28), P17 (3.47).
- `history.jsonl` is JSON Lines, one HistoryRecord per line. Tasks 3.46 and 3.47 add the line functions that task 7.5 uses, and the viewer reads the same format through `trick-or-test/report`.
- The files in `reports/` are generated only by `npm run measure` (task 9.2) and are never edited by hand.
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
    { "id": 8, "tasks": ["3.46", "5.1", "5.4", "5.5", "5.6", "5.7", "5.9"] },
    { "id": 9, "tasks": ["3.47", "5.2", "5.8", "5.10"] },
    { "id": 10, "tasks": ["5.3", "7.1"] },
    { "id": 11, "tasks": ["7.2"] },
    { "id": 12, "tasks": ["7.3"] },
    { "id": 13, "tasks": ["7.4"] },
    { "id": 14, "tasks": ["7.5"] },
    { "id": 15, "tasks": ["7.6"] },
    { "id": 16, "tasks": ["7.7"] },
    { "id": 17, "tasks": ["9.1"] },
    { "id": 18, "tasks": ["3.32", "3.35", "3.37", "3.39", "3.40", "3.42", "3.43"] },
    { "id": 19, "tasks": ["3.33", "3.36", "3.38", "3.41", "3.44"] },
    { "id": 20, "tasks": ["3.34", "3.45"] },
    { "id": 21, "tasks": ["7.8", "7.9"] },
    { "id": 22, "tasks": ["9.2"] },
    { "id": 23, "tasks": ["11"] },
    {
      "id": 24,
      "tasks": ["12.1", "12.6", "12.10", "12.12", "12.13", "12.18", "12.25", "12.31"]
    },
    {
      "id": 25,
      "tasks": ["12.2", "12.3", "12.7", "12.8", "12.11", "12.15", "12.19", "12.20", "12.32"]
    },
    {
      "id": 26,
      "tasks": ["12.4", "12.16", "12.17", "12.29", "12.33", "12.36", "12.39", "12.50"]
    },
    {
      "id": 27,
      "tasks": ["12.5", "12.30", "12.34", "12.35", "12.37", "12.40", "12.51"]
    },
    { "id": 28, "tasks": ["12.9", "12.22", "12.38", "12.41"] },
    { "id": 29, "tasks": ["12.14", "12.23", "12.26", "12.43", "12.44"] },
    { "id": 30, "tasks": ["12.21", "12.27", "12.47"] },
    { "id": 31, "tasks": ["12.48", "12.53"] },
    { "id": 32, "tasks": ["12.24", "12.49"] },
    { "id": 33, "tasks": ["12.28", "12.52"] },
    { "id": 34, "tasks": ["12.42"] },
    { "id": 35, "tasks": ["12.45"] },
    { "id": 36, "tasks": ["12.46"] },
    { "id": 37, "tasks": ["12.54"] },
    { "id": 38, "tasks": ["12.55"] }
  ]
}
```
