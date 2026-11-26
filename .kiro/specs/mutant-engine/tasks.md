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

- [x] 12. Fix the defects found in the independent review of the adapters and the CLI
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

  - [x] 12.12 Order the Occurrence_Index by the real location
    - Put `assignOccurrenceIndexes` in `core/occurrence.ts` as in `design.md` (no `node:` import; if task 3.32 left it in `core/mutant-id.ts`, move it and its tests and update the imports). Group by file, original and replacement, sort each group by start line and then start column from the StrykerJS location, and return each position.
    - Add `test/core/occurrence.test.ts`: three mutants in one group given in shuffled order, two groups, two mutants on the same line ordered by column, and a mutant whose id does not change when unrelated lines above it move.
    - _Requirements: 8.7, 3.16_
    - _Validation: npx vitest run --project engine packages/engine/test/core/occurrence.test.ts passes_

  - [x] 12.13 Write the location into the Mutation_Report and compare it in the same-change check
    - In `core/report.ts` write the start and end line and column of each Mechanical_Mutant into the schema `location`, and use start and end location plus replacement in the 8.15 same-change check (no span offsets, no ids).
    - Add examples to `test/core/report.test.ts`: the report location equals the input location, a Spec_Mutant and a Mechanical_Mutant with equal start and end location and replacement give one mutant, and the same pair differing only in the end column gives two.
    - _Requirements: 3.16, 8.15_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.test.ts passes_

  - [x] 12.14 Pass real locations through the mechanical stage
    - In `cli/orchestrate.ts` (mechanical stage) pass the StrykerJS locations to `assignOccurrenceIndexes` and to the report input, so ids and the report use the real positions.
    - Add examples to `test/cli/orchestrate-mechanical.test.ts`: two identical changes at different lines get different ids, the ids do not change when unrelated lines move, and the report input carries the location. Note: the pinned ids of task 7.8 do not change.
    - _Requirements: 3.16, 8.7_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-mechanical.test.ts passes_

  - [x] 12.15 Select the StrykerJS error line and the retry condition from real output
    - In `core/stryker-output.ts` add `extractStrykerError(output)` (first ERROR-level line, otherwise the last non-empty line, a fixed message that names the missing output for an empty string, total on any string) and `shouldRetryWithIgnoreStatic(attempt)` (true only when the process exited with an error and the output contains the real failed-dry-run line of StrykerJS 10.1.1; StrykerJS prints no "static mutants" text when the dry run fails, so the failed dry run itself is the retry marker). Define `StrykerAttempt` as `{ exitCode, output }`. Copy the log marker from captured output and strip the ANSI colour codes that StrykerJS prints even when piped.
    - Capture real StrykerJS 10.1.1 output for: a successful run, a failed dry run with a module-level constant, a failed dry run without one (both are retried), and a failure after a successful dry run. Store them under `test/fixtures/stryker/`.
    - Add examples to the new file `test/core/stryker-failure.test.ts` (`test/core/stryker-output.test.ts` is sealed), one per captured output, plus an empty output and an output with only blank lines.
    - _Requirements: 3.5, 3.6, 3.17, 10.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/stryker-output.test.ts packages/engine/test/core/stryker-failure.test.ts passes_

  - [x] 12.16 Write Property 23: StrykerJS error selection
    - Write `test/core/stryker-output.property.test.ts` with **Property 23: StrykerJS error selection**. Generate outputs with and without ERROR-level lines, with blank lines and arbitrary text, and attempts that failed before and after a successful dry run.
    - **Validates: Requirements 3.5, 3.6, 3.17**
    - _Requirements: 3.5, 3.6, 3.17_
    - _Validation: npx vitest run --project engine packages/engine/test/core/stryker-output.property.test.ts passes_

  - [x] 12.17 Use the error line and the retry rule in `MechanicalRunner`
    - In `adapters/stryker-adapter.ts` return `extractStrykerError` output for a failed run, retry exactly once with `ignoreStatic` only when `shouldRetryWithIgnoreStatic` is true, never retry after a successful dry run, and set the retry flag only when a retry happened.
    - Add examples to `test/adapters/stryker-adapter.test.ts` with the captured outputs as the fake process output: each failed dry run capture is retried once and flagged, a second failure is not retried, a failure after a successful dry run is not retried and not flagged, and the error line is the first ERROR-level line.
    - _Requirements: 3.5, 3.6, 3.17, 10.12_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts passes_

  - [x] 12.18 Parse relative Changed_Ranges in `core/changed-ranges.ts`
    - Create `core/changed-ranges.ts` with `parseChangedRanges(diffText, sourceGlobs): ChangedRange[]` for the output of `git diff --relative --unified=0`: project-relative paths, only files that match the source globs, no range for a pure deletion, `start <= end`, sorted by file and then start line.
    - Write `test/core/changed-ranges.test.ts`: one hunk, several hunks in one file, a pure deletion, a file outside the source globs, a file outside the project directory (path with `..` or not relative), a count-less hunk header (`@@ -1 +1 @@`), an empty diff.
    - _Requirements: 3.9, 3.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/changed-ranges.test.ts passes_

  - [x] 12.19 Write Property 25: Changed ranges are relative and match the source globs
    - Write `test/core/changed-ranges.property.test.ts` with **Property 25: Changed ranges are relative and match the source globs**. Generators produce diffs with files outside the source globs and files outside the project directory.
    - **Validates: Requirements 3.9, 3.10**
    - _Requirements: 3.9, 3.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/changed-ranges.property.test.ts passes_

  - [x] 12.20 Restrict the git diff to the Target_Project in `git-adapter.ts`
    - In `adapters/git-adapter.ts` run `git diff --relative --unified=0 <ref> -- .` from the Target_Project root and return the diff text; remove the range parsing from the adapter (the core function parses it).
    - Add examples to `test/adapters/git-adapter.test.ts` on a temp git repository whose Target_Project is a subdirectory (a monorepo layout): a change inside the project gives a project-relative path, a change in a sibling directory does not appear, no change gives an empty text, an unknown ref returns an error.
    - _Requirements: 3.9, 3.10_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/git-adapter.test.ts passes_

  - [x] 12.21 Use `parseChangedRanges` for `--since` in the mechanical stage
    - In `cli/orchestrate.ts` read the diff through the git adapter, call `parseChangedRanges` with the source globs and build the mutate patterns from the result. No changed line in a source file gives zero Mechanical_Mutants and StrykerJS is not started.
    - Add examples to `test/cli/orchestrate-mechanical.test.ts` with a fake git adapter: patterns are project-relative, a changed file outside the source globs is dropped, no changed line never calls the runner.
    - _Requirements: 3.9, 3.10, 9.3_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-mechanical.test.ts passes_

  - [x] 12.22 Write both outcomes of an InvalidWitness mutant into the Verdict
    - In `core/types.ts` and `core/report.ts` add `invalidWitness: { expected, originalOutcome }` to the Verdict entry of a mutant with status InvalidWitness, with its zod schema, and no such field for other statuses.
    - Add examples to `test/core/verdict.test.ts`: an InvalidWitness mutant carries both outcomes, `originalOutcome` of kind `timeout` and `no-outcome` validates, a Killed mutant has no `invalidWitness`.
    - _Requirements: 5.6, 8.5_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict.test.ts passes_

  - [x] 12.23 Extend Property 16 with InvalidWitness and outcome kinds
    - In `test/core/verdict.property.test.ts` generate mutants with status InvalidWitness that carry `invalidWitness`, and outcomes of kind `timeout` and `no-outcome`. The write, read, write round trip still produces identical content.
    - **Validates: Requirements 5.6, 8.5, 8.10, 8.12**
    - _Requirements: 5.6, 8.5, 8.10, 8.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict.property.test.ts passes_

  - [x] 12.24 Carry both outcomes from the pipeline to the Verdict
    - In `cli/orchestrate.ts` make the InvalidWitness result carry the expectation and the outcome of the original code into the report input.
    - Add examples to `test/cli/orchestrate-spec-mutants.test.ts`: an InvalidWitness result holds `expected` and `originalOutcome` for a value, an error class and a timeout.
    - _Requirements: 5.6_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-spec-mutants.test.ts passes_

  - [x] 12.25 Add `core/paths.ts`
    - Create `core/paths.ts` with `relativizePath(projectRoot, p)`, `scrubAbsolutePaths(text, projectRoot)` and `containsAbsolutePath(text)` as in `design.md`, without `node:` imports.
    - Write `test/core/paths.test.ts`: a path under the root, the root itself, a path outside the root (`<outside-project>/<basename>`), a Windows drive path, a UNC path, a URL (not a path), free text with several paths, text without paths, and `containsAbsolutePath` on each.
    - _Requirements: 8.17_
    - _Validation: npx vitest run --project engine packages/engine/test/core/paths.test.ts passes_

  - [x] 12.26 Relativize every path in the report builders
    - In `core/report.ts` give each builder the `projectRoot` as data, relativize every path and scrub every free-text field (mutant descriptions, `statusReason`, error text, NotApplicable read errors, NoOutcome messages, configuration paths) through `core/paths.ts` before the field is created.
    - Add examples to `test/core/report.test.ts`, `test/core/verdict.test.ts` and `test/core/history.test.ts`: an absolute path inside a message becomes the relative path, a path outside the root becomes `<outside-project>/<basename>`, a config path under the root is relative, and `containsAbsolutePath` is false for every string in each output.
    - _Requirements: 8.17_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.test.ts packages/engine/test/core/verdict.test.ts packages/engine/test/core/history.test.ts passes_

  - [x] 12.27 Write Property 20: No absolute path in any report field
    - Write `test/core/report.paths.property.test.ts` with **Property 20: No absolute path in any report field**. Generate run inputs with absolute paths under and outside the root in every string field, check every string in the three outputs, and check `join(root, relativizePath(root, p)) === p` for paths under the root.
    - **Validates: Requirements 8.17**
    - _Requirements: 8.17_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.paths.property.test.ts passes_

  - [x] 12.28 Scrub run-time paths in the orchestration and extend the path test
    - In `cli/orchestrate.ts` pass `projectRoot` to every builder and make the NotApplicable read errors and the NoOutcome messages enter the report input as they are (the core scrubs them).
    - Extend `test/cli/orchestrate-report-paths.test.ts`: add one NotApplicable mutant (a read error that holds an absolute path) and one NoOutcome mutant (a message that holds an absolute path) to the existing no-absolute-path run, and check that no string in the written report, verdict and history line contains an absolute path.
    - _Requirements: 8.17_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-report-paths.test.ts passes_

  - [x] 12.29 Validate Spec_Mutant paths and ids in the loader
    - In `core/spec-mutants.ts` add `isSafeRelativePath` and `isSafeMutantId` and make `validateSpecMutant` reject a `file` or `witness.from` (after the default of 4.3) that is empty, absolute (`/`, drive letter, UNC, leading `~`), has a `..` segment, a backslash or a NUL, and an `id` outside `^[A-Za-z0-9._-]+$` or with `..`. Each error names the mutant file and the field.
    - Add examples to `test/core/spec-mutants.test.ts`: one example per rejected form for `file`, `witness.from` and `id`, an accepted nested relative path, and a mutant without `from` whose `file` is unsafe.
    - _Requirements: 4.3, 4.11, 4.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/spec-mutants.test.ts passes_

  - [x] 12.30 Write Property 18: Spec mutant path safety
    - Write `test/core/spec-mutants.property.test.ts` with **Property 18: Spec mutant path safety**. Generators mix safe values with absolute paths, `..` at the start, middle and end, separators in ids, and ids with spaces and Unicode.
    - **Validates: Requirements 4.3, 4.11, 4.12**
    - _Requirements: 4.3, 4.11, 4.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/spec-mutants.property.test.ts passes_

  - [x] 12.31 Add `resolveInside` in `core/sandbox-plan.ts`
    - Create `core/sandbox-plan.ts` with `resolveInside(root, relative): Result<string, PathEscapeError>`: join, normalize and fail when the result is not inside `root`. Define the `ProjectEntry` type (`path`, `kind`, `target?`).
    - Write `test/core/sandbox-plan.test.ts`: a nested path, `..` that stays inside, `..` that escapes, an absolute path, the root itself, a sibling directory with the root as name prefix (`/a/b` against `/a/bc`).
    - _Requirements: 5.17_
    - _Validation: npx vitest run --project engine packages/engine/test/core/sandbox-plan.test.ts passes_

  - [x] 12.32 Plan symlinks and fixed exclusions in `planSandboxCopy`
    - In `core/sandbox-plan.ts` add `planSandboxCopy(entries, outputDirRelative)` returning `copy`, `skip` or `link` for each entry: always skip `node_modules`, `.git`, `.trickortest` and `.stryker-tmp`; a symlink whose resolved target is outside the project is `skip`; one inside is `link` with a relative target inside the Sandbox. The output directory rule comes in task 12.36.
    - Add examples to `test/core/sandbox-plan.test.ts`: link inside, link outside, link to a file and to a directory, the four fixed skips, a nested `node_modules` skip.
    - _Requirements: 5.18_
    - _Validation: npx vitest run --project engine packages/engine/test/core/sandbox-plan.test.ts passes_

  - [x] 12.33 List project entries in the file system adapter
    - In `adapters/file-system-adapter.ts` add `listEntries(root): ProjectEntry[]`: files, directories and symlinks with project-relative paths and symlink targets resolved to project-relative paths (a target outside the project is kept as an outside marker the plan can detect). Add it to the `FileSystem` interface.
    - Add examples to `test/adapters/file-system-adapter.test.ts` on a temp directory: files, nested directories, a link to a file inside, a link to a directory inside, a link outside the project, a broken link.
    - _Requirements: 5.18, 3.7_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/file-system-adapter.test.ts passes_

  - [x] 12.34 Make the Sandbox copy follow the plan and check every write
    - In `adapters/sandbox.ts` build the copy from `listEntries` and `planSandboxCopy`, call `resolveInside` before every write, recreate inside links as relative links, skip outside links and log a warning. A path that escapes the Sandbox returns an error, destroys the Sandbox and ends the run with exit code 1.
    - Add examples to `test/adapters/sandbox.test.ts` on a temp project: a link to a directory outside the project is not in the Sandbox and nothing outside is written through it, a link inside works inside the Sandbox, an escaping path returns an error and leaves no Sandbox.
    - _Requirements: 5.17, 5.18_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/sandbox.test.ts passes_

  - [x] 12.35 Run the StrykerJS binary from `node_modules/.bin`
    - In `adapters/stryker-adapter.ts` build the command from `<project>/node_modules/.bin/stryker`, or from the package manager with `--no-install`, so that a missing binary is an error and never a download.
    - Add examples to `test/adapters/stryker-adapter.test.ts`: the fake process runner receives the local binary path, a project without the binary returns an error that names the missing binary, and no argument list contains a bare `npx` without `--no-install`. Add `test/cli/no-npx.test.ts` that scans `src/` for `npx` calls without `--no-install`.
    - _Requirements: 3.18_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts packages/engine/test/cli/no-npx.test.ts passes_

  - [x] 12.36 Exclude the output directory by its project-relative path
    - In `core/sandbox-plan.ts` make `planSandboxCopy` skip only the entry whose project-relative path equals `outputDirRelative`.
    - Add examples to `test/core/sandbox-plan.test.ts`: `reports` is skipped when it is the output directory, `src/reports` is copied, an output directory nested like `out/reports` is skipped only at that path.
    - _Requirements: 5.19_
    - _Validation: npx vitest run --project engine packages/engine/test/core/sandbox-plan.test.ts passes_

  - [x] 12.37 Write Property 19: Sandbox path containment
    - Write `test/core/sandbox-plan.property.test.ts` with **Property 19: Sandbox path containment**. Generate project listings with links inside and outside the project, `..` segments and an output directory, and check every statement of the property.
    - **Validates: Requirements 5.17, 5.18, 5.19**
    - _Requirements: 5.17, 5.18, 5.19_
    - _Validation: npx vitest run --project engine packages/engine/test/core/sandbox-plan.property.test.ts passes_

  - [x] 12.38 Apply the relative output directory rule in the Sandbox adapter
    - In `adapters/sandbox.ts` pass the output directory relative to the project root to `planSandboxCopy`. Replace any exclusion by directory name.
    - Add examples to `test/adapters/sandbox.test.ts`: with the output directory `reports`, `reports/` is absent from the Sandbox and `src/reports/` is present.
    - _Requirements: 5.19_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/sandbox.test.ts passes_

  - [x] 12.39 Compute the StrykerJS exclusions in `core/stryker-exclusions.ts`
    - Create `core/stryker-exclusions.ts` with `computeStrykerExclusions(listing, buildRoots)` as in `design.md`: every top-level directory that is not a build root in `nonBuildDirs`, every directory reached through a symlink in `symlinkedDirs`, `ignorePatterns` as the sorted, de-duplicated union with `.stryker-tmp`, `.trickortest` and the output directory as `<dir>/**`.
    - Write `test/core/stryker-exclusions.test.ts`: a typical project, a build root never listed, a symlinked directory, a symlink to a file (not listed), `.stryker-tmp` and `.trickortest` always present, input order changed gives the same output.
    - _Requirements: 3.7, 3.8_
    - _Validation: npx vitest run --project engine packages/engine/test/core/stryker-exclusions.test.ts passes_

  - [x] 12.40 Write Property 24: Stryker exclusion list
    - Write `test/core/stryker-exclusions.property.test.ts` with **Property 24: Stryker exclusion list**.
    - **Validates: Requirements 3.7, 3.8**
    - _Requirements: 3.7, 3.8_
    - _Validation: npx vitest run --project engine packages/engine/test/core/stryker-exclusions.property.test.ts passes_

  - [x] 12.41 Pass the exclusions to StrykerJS in `buildStrykerOptions`
    - In `adapters/stryker-adapter.ts` take the result of `computeStrykerExclusions` as an input of `buildStrykerOptions` and pass `nonBuildDirs`, `symlinkedDirs` and `ignorePatterns` to the Stryker sandbox exclusion and ignore options.
    - Add examples to `test/adapters/stryker-options.test.ts`: a non-build directory and a symlinked directory appear in the options, a build root does not, `.stryker-tmp/**` is ignored.
    - _Requirements: 3.7, 3.8_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-options.test.ts passes_

  - [x] 12.42 List the project and compute the exclusions in the mechanical stage
    - In `cli/orchestrate.ts` call `listEntries`, derive the build roots from the source and test globs, call `computeStrykerExclusions` and pass the result to the Stryker adapter.
    - Add examples to `test/cli/orchestrate-mechanical.test.ts` with a fake file system: the options passed to the fake runner list a non-build directory and a symlinked directory.
    - _Requirements: 3.7, 3.8_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-mechanical.test.ts passes_

  - [x] 12.43 Remove the StrykerJS temporary directory after every run
    - In `adapters/stryker-adapter.ts` remove the directory `.trickortest/stryker-tmp` in a `finally`, on success and on failure, and also after the retry.
    - Add examples to `test/adapters/stryker-adapter.test.ts` with a fake file system: removed after a clean run, after a failed run, after a retry, and after a thrown error.
    - _Requirements: 3.19_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts passes_

  - [x] 12.44 Remove leftover Sandboxes in `sandbox.ts`
    - In `adapters/sandbox.ts` add `removeLeftoverSandboxes(projectRoot)` that removes every entry under `.trickortest/sandboxes` and returns the number removed. A missing directory is not an error.
    - Add examples to `test/adapters/sandbox.test.ts`: two leftover Sandboxes are removed, a missing directory returns zero, files outside `.trickortest/sandboxes` are untouched.
    - _Requirements: 5.20_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/sandbox.test.ts passes_

  - [x] 12.45 Call the leftover cleanup at startup
    - In `cli/orchestrate.ts` call `removeLeftoverSandboxes` before the load stage.
    - Add an example to `test/cli/orchestrate-load.test.ts`: a fake Sandbox adapter that reports two leftovers is called once, before the first config read.
    - _Requirements: 5.20_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-load.test.ts passes_

  - [x] 12.46 Select the one spec to attack in `core/select-spec.ts` and wire the load stage and the CLI
    - Create `core/select-spec.ts` with `selectSpec(specNames, requested?): Result<string, SpecSelectionError>` as in `design.md`. It returns the requested name when it is in the list. When `requested` is absent it returns the single name of a one-name list, and an error that lists every spec name (sorted) and asks for `--spec <name>` when the list has several names. It returns an error that names the unlisted `--spec` value and lists the available names when `requested` is not in the list, and a "no spec found" error for an empty list. The function is pure, has no `node:` import and does not read the file system; the shell supplies the list.
    - Write `test/core/select-spec.test.ts`: requested name listed, requested name listed among several, one spec without `requested`, several specs without `requested` (the error lists all names and asks for `--spec <name>`), unlisted `requested` (the error names it and lists the available names), empty list with and without `requested`, input order does not change the message.
    - In `cli/orchestrate.ts` (load stage, after the leftover cleanup of task 12.45) list the spec directories that have a `requirements.md` through the `FileSystem`, call `selectSpec` with the `--spec` value, and on an error return it before the baseline and before StrykerJS, so the CLI prints it to stderr and exits 1 through the existing error path of task 7.6. Load the requirements, the Spec_Mutants and the Skip_File of the selected spec only. Criterion ids and mutant ids keep their plain format.
    - Write `test/cli/orchestrate-select-spec.test.ts` with fake adapters, run through the CLI entry point: two specs without `--spec` exit 1 with an error on stderr that lists both names and asks for `--spec <name>`, and neither the baseline nor StrykerJS runs; two specs with `--spec <name>` attack only that spec (the other spec's mutants are never loaded); one spec without `--spec` still runs; an unknown `--spec` exits 1 with an error that lists the available names; no spec directory with a `requirements.md` exits 1 with the "no spec found" error.
    - _Requirements: 9.5, 9.16, 9.9_
    - _Validation: npx vitest run --project engine packages/engine/test/core/select-spec.test.ts packages/engine/test/cli/orchestrate-select-spec.test.ts passes_

  - [x] 12.47 Track and kill child process groups in the process runner
    - In `adapters/process-runner.ts` (create it if the spawn code is elsewhere and route the Vitest, StrykerJS, type-check and git adapters through it) spawn each child in its own process group, keep a registry of live children and add `killAll(signal)` that stops every group.
    - Write `test/adapters/process-runner.test.ts` with real short-lived Node child processes: a child that spawns a grandchild is stopped together with it, `killAll` with no child does nothing, a finished child leaves the registry.
    - _Requirements: 9.15_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/process-runner.test.ts passes_

  - [x] 12.48 Add the shutdown coordinator in `cli/shutdown.ts`
    - Create `cli/shutdown.ts` with `installShutdown({ process, runner, removeLeftoverSandboxes, projectRoot })`: on SIGINT or SIGTERM call `runner.killAll`, remove the Sandboxes, then exit with code 130 or 143. A second signal during cleanup does not start a second cleanup. The process object is injected.
    - Write `test/cli/shutdown.test.ts` with fakes: SIGINT gives 130, SIGTERM gives 143, the order is kill children, remove Sandboxes, exit, a second signal is ignored, a cleanup error still exits with the signal code.
    - _Requirements: 9.15_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/shutdown.test.ts passes_

  - [x] 12.49 Install the shutdown handlers in the CLI entry point
    - In `cli/main.ts` install the handlers at the start of `run` and `measure`, before any child is spawned.
    - Add examples to `test/cli/main.test.ts`: the handlers are installed before the first adapter call, and a signal during a fake long run ends with 130 or 143 and calls the cleanup.
    - _Requirements: 9.15_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/main.test.ts passes_

  - [x] 12.50 Exclude `.trickortest/**` from every suite run
    - In `adapters/vitest-suite-runner.ts` pass an exclusion of `.trickortest/**` (and the generated Witness files) to every run of the suite, so the Baseline_Run and the Sandbox runs never run the tests inside a StrykerJS sandbox or a Witness file.
    - Add examples to `test/adapters/vitest-suite-runner.test.ts` with a fixture that holds a failing test file under `.trickortest/stryker-tmp/`: the run passes and does not list that file.
    - _Requirements: 3.20, 5.21_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/vitest-suite-runner.test.ts passes_

  - [x] 12.51 Make the narrow-include suite runner test able to fail
    - In `test/adapters/vitest-suite-runner.test.ts` replace the test that uses the narrow-include fixture: the fixture holds a passing test that matches the include and a failing test that the include does not match, and the test asserts the exact list of test files that ran and the failing count. Check that the test fails when the exclusion of task 12.50 or the include is removed (run it once with the exclusion removed and put the result in the commit body).
    - _Requirements: 10.13_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/vitest-suite-runner.test.ts passes_

  - [x] 12.52 Read the written Verdict in the InvalidWitness test
    - Create `test/cli/orchestrate-invalid-witness.test.ts`: run the pipeline with fake adapters that give an InvalidWitness result, take the content that the Reporter writes to the fake file system, parse `verdict.json` with the zod schema and check status, `expected` and `originalOutcome` in the parsed file. Remove the same assertion on an in-memory value from `test/cli/orchestrate-spec-mutants.test.ts` only if it is a duplicate; do not weaken the other assertions.
    - _Requirements: 10.13, 5.6_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-invalid-witness.test.ts passes_

  - [x] 12.53 Replace invented StrykerJS output in the adapter tests
    - In `test/adapters/stryker-adapter.test.ts` replace every fake process output that was written by hand (clean run, static-mutant failure, other error) by the captured real StrykerJS 10.1.1 fixtures of tasks 12.10 and 12.15. If a case has no captured output yet (for example a failed run without a JSON report), capture it from a real run.
    - Check with `grep` that no inline StrykerJS log text remains in the test file.
    - _Requirements: 10.12_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/stryker-adapter.test.ts passes_

  - [x] 12.54 Strengthen the end-to-end test
    - In `test/e2e/pricing.test.ts` add: `git status --porcelain examples/pricing` shows no change outside `.trickortest/` after the run; every string in the written report, verdict and history line satisfies `containsAbsolutePath === false`; the size of `.trickortest/stryker-tmp` after the second run is not larger than after the first run; `.trickortest/sandboxes/` is empty.
    - Note: this task changes the test only. Re-run `npm run test:e2e --workspace trick-or-test` after the fixes of tasks 12.1 to 12.53, because they change ids, locations and paths in the written files.
    - _Requirements: 10.10, 10.11_
    - _Validation: npm run test:e2e --workspace trick-or-test passes_

  - [x] 12.55 Regenerate `reports/` with `npm run measure`
    - Note: task 9.2 committed `reports/` before these fixes. Mutant locations, Occurrence_Index ids and relative paths changed, so the committed files are stale. Delete the generated files in `reports/`, run `npm run measure` from the repository root, check that `reports/history.jsonl` has exactly one line and that no string in the three files holds an absolute path, and commit the three files. Nobody edits them by hand.
    - _Requirements: 8.17, 9.13, 9.14_
    - _Validation: npm run measure && test -f reports/mutation-report.json && test -f reports/verdict.json && test -f reports/history.jsonl passes_

  - [x] 12.56 Checkpoint - Review fixes
    - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

- [x] 13. Write the criterion text and the mutated witness outcome into `verdict.json`
  - Source: requirements 8.18-8.20 and Property 26 in `design.md`. The viewer (bestiary-viewer requirements 7.3 and 7.4) needs both fields. The engine already has them in memory: `parseRequirements` returns each criterion's `text`, and `cli/orchestrate.ts` computes `mutatedOutcome` for each Spec_Mutant.
  - Both fields are optional in the schemas, so a verdict written before this task still parses. Mutant ids, the Mutation_Report and the `history.jsonl` format do not change.
  - Committed test files are sealed. Every test below goes in a new file; no existing test file is edited.
  - [x] 13.1 Add the optional fields to the types and the zod schemas
    - In `core/types.ts` add `text?: string` to `CriterionCoverage` and the type `VerdictWitness = Witness & { mutatedOutcome?: WitnessOutcome }`; `Verdict.witnesses` becomes `Record<MutantId, VerdictWitness>`. `Witness` itself does not change.
    - In `core/report.ts` add `text: z.string().optional()` to `criterionCoverageSchema`, and export `verdictWitnessSchema`: the strict union of `witnessSchema` with `mutatedOutcome: witnessOutcomeSchema.optional()`. `verdictSchema` uses it for `witnesses`. `witnessSchema` (used for mutant files) is unchanged, and every object stays strict.
    - Write `test/core/verdict-fields-schema.test.ts`: a verdict without either field parses (8.20); a verdict with both parses; `mutatedOutcome` of each kind (`value`, `error`, `timeout`, `no-outcome`) parses; an unknown field next to `text` or next to `mutatedOutcome` is rejected; an invalid `mutatedOutcome` kind is rejected; `witnessSchema` still rejects `mutatedOutcome` (a mutant file does not take it); the schemas are exported from `trick-or-test/report` and that subpath still has no `node:` import.
    - _Requirements: 8.20_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict-fields-schema.test.ts passes_
  - [x] 13.2 Write the criterion text in `buildVerdict`
    - In `core/report.ts` let `buildVerdict` copy `text` from each `VerdictInput.coverage` entry, trimmed and passed through `scrubAbsolutePaths`. An entry with no `text` stays without one.
    - Write `test/core/verdict-text.test.ts`: plain text is kept, leading and trailing whitespace and newlines are trimmed, inner whitespace is kept, an absolute path under the root becomes the relative path, a path outside the root becomes `<outside-project>/<basename>`, an entry without text has no `text` key, and `skipped` entries keep `reason` and gain `text`.
    - _Requirements: 8.17, 8.18_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict-text.test.ts passes_
  - [x] 13.3 Write the mutated witness outcome in `buildVerdict`
    - In `core/report.ts` let `buildVerdict` copy `mutatedOutcome` from each `VerdictInput.witnesses` entry, through the same scrubbing function as `originalOutcome` (`message` of `timeout` and `no-outcome`, `className` of `error`). An entry with no `mutatedOutcome` gets no such key.
    - Write `test/core/verdict-mutated-outcome.test.ts`: one example for each outcome kind; an absolute path in a `no-outcome` message and in an error class name is scrubbed; a witness with `expectedError` and one with `expected` both keep the field; an entry without the field has no `mutatedOutcome` key (check with `Object.hasOwn`, not with `=== undefined`).
    - _Requirements: 8.17, 8.19_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict-mutated-outcome.test.ts passes_
  - [x] 13.4 Write Property 26: Verdict carries criterion text and mutated outcome
    - Write `test/core/verdict.fields.property.test.ts` with **Property 26: Verdict carries criterion text and mutated outcome**. The generator produces criteria with plain text, with surrounding whitespace, and with absolute paths under and outside the root; and Spec_Mutants with and without a `mutatedOutcome`, in every outcome kind, with absolute paths in `message` and `className`. Check every bullet of the property, including the round trip and `containsAbsolutePath`. Generators reach the documented boundaries on purpose (per `no-fake-tests.md`): the no-text and no-outcome cases must occur in every run set.
    - **Validates: Requirements 8.12, 8.17, 8.18, 8.19, 8.20**
    - _Requirements: 8.12, 8.17, 8.18, 8.19, 8.20_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict.fields.property.test.ts passes_
  - [x] 13.5 Carry the text and the outcome from the pipeline to the Verdict
    - In `cli/orchestrate.ts` fill `text` in each coverage entry from the matching `Criterion` of `parseRequirements`, and `mutatedOutcome` in the `witnesses` entry of each Spec_Mutant whose `SpecMutantOutcome.mutatedOutcome` is set (Killed, Survived, Timeout and Ghost mutants whose witness ran on the mutated code). An InvalidWitness, CompileError or NotApplicable mutant, whose witness never ran on the mutated code, gets none.
    - Write `test/cli/orchestrate-verdict-fields.test.ts` with fake adapters: take the content that the Reporter writes to the fake file system, parse `verdict.json` with the zod schema, and check in the parsed file the text of each criterion (every criterion of the parsed spec has one), the `mutatedOutcome` of a Survived, a Killed and a Ghost mutant, and no `mutatedOutcome` for an InvalidWitness and a CompileError mutant.
    - _Requirements: 8.18, 8.19, 10.13_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-verdict-fields.test.ts passes_
  - [x] 13.6 Regenerate `reports/` with `npm run measure`
    - Note: the committed `reports/verdict.json` lacks the new fields. Kiro runs `npm run measure` once from the repository root and commits the changed files in `reports/`. This appends one line to `reports/history.jsonl`, which is expected: the earlier lines stay unchanged. Nobody edits the files by hand, and ids and the history format do not change.
    - Check that `reports/history.jsonl` has exactly one more line than before, that every coverage entry of `reports/verdict.json` has a non-empty `text`, that every Spec_Mutant with a `mutatedOutcome` has a status in Killed, Survived, Timeout or Ghost, and that no string in the three files holds an absolute path.
    - _Requirements: 8.17, 8.18, 8.19, 9.13, 9.14_
    - _Validation: npm run measure && test -f reports/mutation-report.json && test -f reports/verdict.json && test -f reports/history.jsonl passes_
  - [x] 13.7 Checkpoint - Verdict fields
    - Run `npm run check` from the repository root, then `npm run test:e2e --workspace trick-or-test`. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

- [x] 14. Run every git command without inherited repository-location variables
  - Source: requirement 3.21 and the git adapter row and the "Git environment" notes in `design.md`. A git hook exports `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and related variables, and in a linked worktree `GIT_DIR` is an absolute path. `Git.diff` and the `rev-parse` call in `cli/main.ts` go through `ProcessRunner`, which passes the inherited environment, so they read the repository that `GIT_DIR` names instead of the Target_Project. The same inheritance made `test/adapters/git-adapter.test.ts` run `git init`, `git config` and `git commit` against the real repository when the pre-push hook ran the tests from a worktree.
  - Committed test files are sealed. Every test below goes in a new file, except task 14.3, which edits one committed test file and says so. `scripts/guard.test.ts` has the same defect and was fixed in commit 832b2aa; it is not part of this task.
  - Every test task in this task is required. No new correctness property is added: the pure helper has a small, discrete input space that example tests cover at its boundaries.
  - [x] 14.1 Add the pure helper `withoutGitLocation`
    - Create `core/git-env.ts` exporting `withoutGitLocation(env)` as in `design.md`: a copy of `env` without `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_NAMESPACE`, `GIT_CEILING_DIRECTORIES` and `GIT_DISCOVERY_ACROSS_FILESYSTEM`, matched by exact name; every other variable is kept. The argument is not modified. The module has no `node:` import and does not read `process.env`.
    - Write `test/core/git-env.test.ts`: each of the nine variables is removed (one example per variable); `PATH`, `HOME`, `GIT_AUTHOR_NAME` and `GIT_CONFIG_GLOBAL` are kept with their values; a variable with an undefined value is handled; a lower-case `git_dir` is kept (names are case-sensitive); an empty environment gives an empty result; the argument object is unchanged after the call and the result is a different object.
    - _Requirements: 3.21_
    - _Validation: npx vitest run --project engine packages/engine/test/core/git-env.test.ts passes_
  - [x] 14.2 Let `ProcessRunner` take an environment
    - In `adapters/process-runner.ts` add `readonly env?: Readonly<Record<string, string | undefined>>` to `RunOptions` and pass it to `spawn`. When `env` is absent the child inherits `process.env` as before, so no other caller changes.
    - Write `test/adapters/process-runner-env.test.ts`: a child started with `env` set to `{ PATH, MARKER: "x" }` prints `MARKER` and does not see a variable that exists only in the parent's `process.env`; a child started without `env` still sees the parent's variables.
    - _Requirements: 3.21_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/process-runner-env.test.ts passes_
  - [x] 14.3 Use the helper in the git adapter and in the `rev-parse` call
    - In `adapters/git-adapter.ts` make `runGit` pass `env: withoutGitLocation(process.env)`, so `Git.diff` and `Git.currentCommit` both use it. In `cli/main.ts` make the `rev-parse HEAD` call pass the same `env`. Export `gitCommit` from `cli/main.ts` if the test needs it. No other code spawns git.
    - Write `test/adapters/git-adapter-env.test.ts`, with real repositories under `/tmp`: create a Target_Project repository with one committed file and an uncommitted change, and a decoy repository with a different commit and a different change; set `GIT_DIR` (and `GIT_WORK_TREE` in a second example) to the decoy for the duration of the test and restore them in a `finally`; check that `Git.diff` returns the diff of the Target_Project and not of the decoy, that `Git.currentCommit` and the `rev-parse` call of `cli/main.ts` return the commit of the Target_Project, and that the decoy's `HEAD`, config, index and working tree are byte-identical before and after. Every git call that the test makes itself passes `env: withoutGitLocation(process.env)`.
    - Edit the committed file `test/adapters/git-adapter.test.ts` so that its own git calls (the `execFileSync("git", ...)` helper that runs `init`, `config`, `add` and `commit` in the throwaway repository) pass `env: withoutGitLocation(process.env)`. This is the one edit of a committed test file in this task, and it is allowed because the file ran `git init`, `config` and `commit` against the real repository when a hook exported `GIT_DIR`. No test name and no assertion changes. Check with `git diff` that the change in that file is only the import and the `env` option.
    - _Requirements: 3.9, 3.21_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/git-adapter-env.test.ts packages/engine/test/adapters/git-adapter.test.ts passes_
  - [x] 14.4 Checkpoint - Git environment
    - Run `GIT_DIR=$(git rev-parse --absolute-git-dir) npm run check` from the repository root, so the variable is set as in a hook, then `npm run check` without it. Ensure all tests pass and that `git status`, `git log -1` and `git config --local --list` of the repository are the same before and after. Ask the user if questions arise.
    - _Validation: npm run check passes_

- [ ] 15. One set of mutant ids and official totals (Gap 1)
  - Source: requirements 8.21 to 8.24, 8.29, 8.31, Properties 29 and 30 in `design.md`. The committed `reports/verdict.json` lists 112 mutants and `reports/mutation-report.json` holds 110, because rule 8.15 drops the Twin from the Mutation_Report only. After this task the Verdict_File, the Mutation_Report and the HistoryRecord of one run list the same ids, and the Verdict_File holds the two totals under two names.
  - Every new field is optional in the schemas, so an older file still parses, and every object stays strict. Committed test files are sealed: every test below goes in a new file. If a committed test asserts that the Verdict_File holds a Twin, do not edit it. Name the test, stop, and report the disagreement between the test and requirement 8.21.
  - [x] 15.1 Add the types and the schemas
    - In `core/types.ts` add `StatusCounts`, `MutantCounts` and `StrykerCounts` as in `design.md`. In `core/report.ts` add the strict zod schemas and the optional fields `mutantCounts` and `strykerCounts` to `verdictSchema`. Every integer is non-negative. Put the sentences of requirement 8.24 in the `.describe()` text of `strykerCounts.total` and of `mutantCounts.twinsMerged`. Export the types and the schemas from `trick-or-test/report`.
    - Write `test/core/totals-schema.test.ts`: a verdict without either field parses (8.29); a verdict with both parses; a `mutantCounts` without `mechanical` parses; a missing status key in `spec` is rejected; an unknown key in each of the three objects is rejected; a negative or fractional count is rejected; the subpath still has no `node:` import.
    - _Requirements: 8.22, 8.23, 8.24, 8.29, 10.4_
    - _Validation: npx vitest run --project engine packages/engine/test/core/totals-schema.test.ts passes_
  - [x] 15.2 Add `dropTwins` and the count functions
    - Create `core/twins.ts` with `dropTwins` (the 8.15 same-change comparison, moved out of `buildMutationReport`, which now calls it) and `core/totals.ts` with `computeMutantCounts` and `computeStrykerCounts`. Both modules are pure and have no `node:` import.
    - Write `test/core/twins.test.ts`: a Twin is dropped and its Spec_Mutant kept; a Mechanical_Mutant that differs only in the start line, the start column, the end line, the end column, the file or the replacement is kept; a list without Twins comes back unchanged (idempotence); `twinsMerged` equals the number dropped; ids play no part. Write `test/core/totals.test.ts`: `computeStrykerCounts` on a list with one mutant of each of the seven statuses gives `detected` 2 (Killed and Timeout), `undetected` 1, `total` 7; an empty list gives zeros; `computeMutantCounts` has all seven status keys for each kind, and no `mechanical` key for the scope `spec-only`.
    - _Requirements: 8.15, 8.22, 8.23_
    - _Validation: npx vitest run --project engine packages/engine/test/core/twins.test.ts packages/engine/test/core/totals.test.ts passes_
  - [x] 15.3 Make the three builders use one list
    - In `core/report.ts` let `buildMutationReport`, `buildVerdict` and `buildHistoryRecord` each apply `dropTwins` to the raw list. `buildVerdict` writes `mutantCounts` (with `twinsMerged`) and `strykerCounts` from the raw list, before `dropTwins`.
    - Write `test/core/report-one-set.test.ts`, with one input that has one Twin: the three outputs list the same ids; the Twin id is in none; `verdict.mutantCounts.twinsMerged` is 1; `verdict.strykerCounts.total` is one more than the number of mechanical mutants in `mutantCounts`; a Twin that StrykerJS killed counts in `strykerCounts.detected` and not in `mutantCounts`; an input without Twins gives `twinsMerged` 0 and equal totals.
    - _Requirements: 8.21, 8.22, 8.23_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report-one-set.test.ts passes_
  - [x] 15.4 Write Property 29: One set of mutant ids and agreeing totals
    - Write `test/core/report.one-set.property.test.ts` with **Property 29** as stated in `design.md`. The generator includes Spec_Mutants with Twins and without, Twins whose status differs from the Spec_Mutant's, and raw lists in a shuffled order.
    - **Validates: Requirements 8.15, 8.21, 8.22, 8.28, 9.18**
    - _Requirements: 8.15, 8.21, 8.22_
    - _Validation: npx vitest run --project engine packages/engine/test/core/report.one-set.property.test.ts passes_
  - [x] 15.5 Write Property 30: Stryker counts come from the produced mutants
    - Write `test/core/totals.property.test.ts` with **Property 30** as stated in `design.md`. The generator makes lists with every status, with and without Twins, and checks the order independence by shuffling.
    - **Validates: Requirements 8.22, 8.23, 8.24**
    - _Requirements: 8.22, 8.23, 8.24_
    - _Validation: npx vitest run --project engine packages/engine/test/core/totals.property.test.ts passes_
  - [x] 15.6 Pass the raw list from the pipeline and read the files back
    - In `cli/orchestrate.ts` pass the whole list of Mechanical_Mutants that StrykerJS produced to the builders (no earlier filtering). Write `test/cli/orchestrate-totals.test.ts` with fake adapters, one Twin among the Mechanical_Mutants: read the three written files, parse them with the zod schemas, and check that the id sets are equal, that `mutantCounts` agrees with the ids listed, and that `strykerCounts` counts the Twin.
    - _Requirements: 8.21, 8.22, 8.23, 10.13_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-totals.test.ts passes_
  - [x] 15.7 Checkpoint - Totals
    - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

- [x] 16. Keep the tests of the Baseline_Run (Gap 2)
  - Source: requirements 6.11 to 6.13, 8.29, Property 31 in `design.md`. The Baseline_Run already knows every test (name, file, start line) and the engine keeps only its duration. The viewer headline is "All N tests still pass", and N is the length of `baselineTests`.
  - Every test below goes in a new file.
  - [x] 16.1 Add the types and the schema
    - In `core/types.ts` add `TestKind` and `BaselineTest` (`claims` is added by task 17). In `core/report.ts` add the strict schema and the optional field `baselineTests` to `verdictSchema`. Export both from `trick-or-test/report`.
    - Write `test/core/baseline-tests-schema.test.ts`: a verdict without the field parses; an entry with a kind other than `property` and `example` is rejected; an unknown key in an entry is rejected; an empty list parses.
    - _Requirements: 6.11, 8.29_
    - _Validation: npx vitest run --project engine packages/engine/test/core/baseline-tests-schema.test.ts passes_
  - [x] 16.2 Add `toTestId` and `buildBaselineTests`
    - Create `core/baseline-tests.ts`. Make the code that builds the ids of killing tests call `toTestId`, so the two formats are one function. The module is pure and has no `node:` import.
    - Write `test/core/baseline-tests.test.ts`: only passed tests are listed (a skipped and a todo test are not); the id is `<file>::<full name>` and equals the id that a killing test of the same test gets; two tests with the same id give two entries; the order is by id and then by start line; a file that matches a property glob gives kind `property`; a body that calls `fc.assert` gives `property`; any other test gives `example`; an empty input gives an empty list.
    - _Requirements: 6.3, 6.4, 6.5, 6.11, 6.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/baseline-tests.test.ts passes_
  - [x] 16.3 Write Property 31: Baseline tests
    - Write `test/core/baseline-tests.property.test.ts` with **Property 31** as stated in `design.md`.
    - **Validates: Requirements 6.3, 6.4, 6.5, 6.11, 6.12, 6.13**
    - _Requirements: 6.11, 6.12, 6.13_
    - _Validation: npx vitest run --project engine packages/engine/test/core/baseline-tests.property.test.ts passes_
  - [x] 16.4 Carry the tests from the Baseline_Run to the Verdict
    - In `cli/orchestrate.ts` keep the passed tests of the Baseline_Run `SuiteResult` (file, full name, start line, status), read each test body with `extractTestBody`, call `buildBaselineTests`, and give the list to `buildVerdict`, which writes `baselineTests`.
    - Write `test/cli/orchestrate-baseline-tests.test.ts` with fake adapters: read the written `verdict.json`; its `baselineTests` length equals the number of passed tests of the fake Baseline_Run; a skipped test is absent; every killing-test id of every mutant in the file is in the list (except a file-level failure, whose id is a file path).
    - _Requirements: 6.11, 6.12, 6.13, 10.13_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-baseline-tests.test.ts passes_
  - [x] 16.5 Checkpoint - Baseline tests
    - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

- [ ] 17. Record the claims of the tests (Gap 3)
  - Source: requirement 11, 6.11 to 6.13, Properties 27 and 28 in `design.md`. Kiro writes above each property test a comment such as `// Feature: cart-pricing, Property 9: Breakdown invariants` and `// **Validates: Requirements 5.5, 7.3, 7.4**`. `extractTestBody` reads from the start line forward and never sees them.
  - Every test below goes in a new file. Wording (11.17): a claim "held" or "did not hold". The words "false", "fake" and "lying" appear in no string that the engine writes, and in no test name or message of this task.
  - [x] 17.1 Add the types and the schemas
    - In `core/types.ts` add `ClaimOutcome`, `Claim` and `ClaimCounts`; add `claims?: Claim[]` to `BaselineTest`. In `core/report.ts` add the strict schemas, `claims` in the `baselineTests` entry and the optional field `claimCounts` in `verdictSchema`. `otherTestsKilledAll` is allowed only when the outcome is `not-held`: the schema rejects it on the other outcomes. Export from `trick-or-test/report`.
    - Write `test/core/claims-schema.test.ts`: a verdict without `claims` and `claimCounts` parses; each of the four outcomes parses; `otherTestsKilledAll` on `held` is rejected; `not-held` without it is rejected; an unknown outcome and an unknown key are rejected; a negative count is rejected.
    - _Requirements: 8.29, 11.11, 11.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/claims-schema.test.ts passes_
  - [x] 17.2 Read the comment lines above a test
    - Create `core/claims.ts` with `extractLeadingComments`, pure, no `node:` import.
    - Write `test/core/claims-comments.test.ts`: `//` lines directly above the start line are returned in file order with the markers removed; a `/* ... */` block and a ` * ` JSDoc block are read; a blank line ends the run (comment lines above the blank line are not returned); a line of code ends the run; a start line of 1, 0 and beyond the end of the text give an empty list; lines of a comment above a `describe` are not returned for a test inside the block (start line is inside the block); a comment above an `it.each` call is returned for the start line of that call; other comment lines between the annotation and the call are returned with the rest; `\r\n` line ends work.
    - _Requirements: 11.1, 11.7, 11.8, 11.9_
    - _Validation: npx vitest run --project engine packages/engine/test/core/claims-comments.test.ts passes_
  - [x] 17.3 Parse and resolve the claims
    - In `core/claims.ts` add `parseClaimComments` and `resolveClaimRefs` as in `design.md`.
    - Write `test/core/claims-parse.test.ts`, one example per case of the requirements: a `Feature:` line that names this spec gives the claims; one that names another spec gives none (11.2); no `Feature:` line gives the claims (11.10); `Requirements 5.5, 7.3, 7.4` gives three refs; `Requirement 5` gives one whole-requirement ref and `resolveClaimRefs` expands it to every Criterion of Requirement 5 in document order (11.4); `Requirements 5.1 and 5.2` and `5.1, 5.2` both work; the bold form `**Validates: Requirements 5.5**` works; other comment lines between the annotation and the call do not change the result (11.7); an id that the spec lacks (`9.9`) and a requirement number that the spec lacks (`99`) stay as written (11.5); a repeated id and a whole requirement that repeats a listed id collapse to one (11.6); a malformed token (`5.1-5.3`, `5.`, `x`) ends the list and the ids before it are kept; `Validates:` with no ids gives none.
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/claims-parse.test.ts passes_
  - [x] 17.4 Compute the outcome of each claim
    - In `core/claims.ts` add `computeClaimOutcome` and `attachClaims`.
    - Write `test/core/claims-outcome.test.ts`: `held` when the test is among the killing tests of every valid Spec_Mutant of the criterion; `not-held` when it is missing from one, with `otherTestsKilledAll` true when another test killed every valid Spec_Mutant, and false when one survives; a Timeout mutant counts as killed by others and not as killed by this test; `unchecked` for a criterion with no Spec_Mutant, for a skipped criterion, and for a criterion whose Spec_Mutants are all Ghost, InvalidWitness, CompileError or NotApplicable; `unknown-criterion` for an id the spec lacks; strays change nothing; `claimCounts` sums to the total and the two `notHeld` sub-counts sum to `notHeld`; a test with no claim has no `claims` key.
    - _Requirements: 7.6, 11.11, 11.12_
    - _Validation: npx vitest run --project engine packages/engine/test/core/claims-outcome.test.ts passes_
  - [x] 17.5 Write Property 27: Claim parsing
    - Write `test/core/claims.parse.property.test.ts` with **Property 27** as stated in `design.md`.
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.13**
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.13_
    - _Validation: npx vitest run --project engine packages/engine/test/core/claims.parse.property.test.ts passes_
  - [ ] 17.6 Write Property 28: Claim outcomes and counts
    - Write `test/core/claims.outcome.property.test.ts` with **Property 28** as stated in `design.md`.
    - **Validates: Requirements 7.6, 11.11, 11.12, 11.15**
    - _Requirements: 7.6, 11.11, 11.12, 11.15_
    - _Validation: npx vitest run --project engine packages/engine/test/core/claims.outcome.property.test.ts passes_
  - [ ] 17.7 Read the claims in the pipeline
    - In `cli/orchestrate.ts`, after the Spec_Mutants have run, read each distinct test file of the Baseline_Run once through the file system adapter, call `extractLeadingComments`, `parseClaimComments` (with the attacked spec name) and `resolveClaimRefs` for each Baseline_Test, call `attachClaims`, and give `baselineTests` and `claimCounts` to `buildVerdict`. A file that cannot be read gives no claims for its tests and no error (11.14). The code does not depend on the Run_Scope (11.15).
    - Write `test/cli/orchestrate-claims.test.ts` with fake adapters: read the written `verdict.json`; a test file with `Feature: cart-pricing` and `Validates:` lines gives the claims in the entry of its tests; a file that names another spec gives none; an unreadable file gives none and the run still writes the three files; `claimCounts.total` equals the number of claims in `baselineTests`.
    - _Requirements: 11.12, 11.14, 11.15, 10.13_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-claims.test.ts passes_
  - [ ] 17.8 Check the committed example
    - Capture the fixture `test/fixtures/cart-pricing-24/`: (a) `mutants.json`, the entries with a `requirement` of the Spec_Mutants in `reports/verdict.json` as committed now (id, requirement, status, killingTests), written with the file tools from the file as committed; (b) `baseline.json`, the Vitest JSON of the Baseline_Run of `examples/pricing` with start lines, from `npx vitest run --reporter=json --outputFile=.trickortest/baseline.json` in that project, copied with the file tools; (c) `PROVENANCE.md` with the commit and the commands. Remove the working file under `.trickortest/` afterwards. Do not edit `examples/pricing/test/`.
    - Write `test/core/claims-example.test.ts`: read the real files of `examples/pricing/test/` and the fixture, run the claim functions, and assert 25 claims, 16 `held`, 7 `not-held`, 2 `unchecked` (2.2 and 3.4), 0 `unknown-criterion`; the seven `not-held` pairs are 2.1 of Property 1, 5.1 and 5.5 of Property 6, 6.2 and 6.3 of Property 7, and 5.5 and 7.4 of Property 9; `otherTestsKilledAll` is true for six and false for 7.4 of Property 9. This test reads a fixture, so task 21 does not change it (11.16).
    - _Requirements: 11.16_
    - _Validation: npx vitest run --project engine packages/engine/test/core/claims-example.test.ts passes_
  - [ ] 17.9 Checkpoint - Claims
    - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

- [ ] 18. Add the spec name, the requirement titles and the coverage of each run (Gap 4)
  - Source: requirements 2.9, 2.10, 8.25 to 8.27, 8.29, Property 33 in `design.md`. Every new field is optional in the schemas and every object stays strict. Every test below goes in a new file.
  - [ ] 18.1 Parse the requirement titles
    - Create `core/requirement-titles.ts` with `parseRequirementTitles` as in `design.md`. Do not change `parseRequirements` or the type `Criterion`.
    - Write `test/core/requirement-titles.test.ts`: `### Requirement 2: Requirements parser` gives `{ requirement: 2, title: "Requirements parser" }`; leading and trailing spaces are trimmed; a colon inside the title is kept; a heading inside a fenced code block is ignored; the order is document order; a repeated number is an error that names the file, the number and both lines; an empty title is an error that names the file and the line; a document with no heading gives an empty list; `parseRequirements` returns the same value as before for the same text (compare with the output on this spec's own `requirements.md`).
    - _Requirements: 2.9, 2.10_
    - _Validation: npx vitest run --project engine packages/engine/test/core/requirement-titles.test.ts passes_
  - [ ] 18.2 Write Property 33: Requirement titles
    - Write `test/core/requirement-titles.property.test.ts` with **Property 33** as stated in `design.md`.
    - **Validates: Requirements 2.2, 2.9, 2.10, 8.26**
    - _Requirements: 2.9, 2.10, 8.26_
    - _Validation: npx vitest run --project engine packages/engine/test/core/requirement-titles.property.test.ts passes_
  - [ ] 18.3 Add the types and the schemas
    - In `core/types.ts` and `core/report.ts` add `RequirementTitle`, `specName` in `runMetadataSchema`, `requirements` in `verdictSchema` and `coverageByCriterion` in `historyRecordSchema`, all optional and strict. Export from `trick-or-test/report`. (`scope` is added by task 19.)
    - Write `test/core/small-fields-schema.test.ts`: a verdict and a history record without the fields parse; with the fields they parse; an unknown key inside `requirements` and inside `coverageByCriterion` is rejected; an empty title and a non-integer requirement number are rejected; an unknown Coverage_Status is rejected.
    - _Requirements: 8.25, 8.26, 8.27, 8.29_
    - _Validation: npx vitest run --project engine packages/engine/test/core/small-fields-schema.test.ts passes_
  - [ ] 18.4 Write the fields in the builders
    - In `core/report.ts` let `buildVerdict` write `metadata.specName` and `requirements` (each title trimmed and scrubbed by `scrubAbsolutePaths`), and `buildHistoryRecord` write `coverageByCriterion` from `verdict.coverage` in document order.
    - Write `test/core/small-fields-builders.test.ts`: the spec name and the titles reach the verdict; a title with an absolute path is scrubbed; `coverageByCriterion` holds one entry for each Criterion in document order with the Coverage_Status of the verdict, including `skipped` and `unattacked`; a record built from a verdict with no coverage has an empty list; the output is byte-identical for equal input.
    - _Requirements: 8.13, 8.17, 8.25, 8.26, 8.27_
    - _Validation: npx vitest run --project engine packages/engine/test/core/small-fields-builders.test.ts passes_
  - [ ] 18.5 Carry the fields from the pipeline
    - In `cli/orchestrate.ts` call `parseRequirementTitles` in the load stage, next to `parseRequirements`; a title error stops the run before the baseline, as a requirements error does. Pass `specName`, the titles to the builders.
    - Write `test/cli/orchestrate-small-fields.test.ts` with fake adapters: read the written files; `metadata.specName` equals the chosen spec; `requirements` has one entry per `### Requirement N:` heading; the last line of `history.jsonl` has `coverageByCriterion` equal to the `coverage` of `verdict.json` (criterion and status); a duplicate requirement number stops the run before the baseline with exit code 1.
    - _Requirements: 2.10, 8.25, 8.26, 8.27, 10.13_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-small-fields.test.ts passes_
  - [ ] 18.6 Checkpoint - Small fields
    - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

- [ ] 19. Add the spec-only run scope (Gap 5)
  - Source: requirements 8.28 to 8.31, 9.17 to 9.22, 11.15, Properties 32 and 34 in `design.md`. An agent that hunts one surviving Spec_Mutant needs a run of seconds. `--scope spec-only` runs the Baseline_Run and the Spec_Mutants and never StrykerJS. A spec-only run has no strays and no StrykerJS score, and says so in its three files.
  - Decision on history: a `full` run compares with the latest earlier `full` record; a `spec-only` run compares with the latest earlier record of any scope on Spec_Mutant ids only (requirement 8.30).
  - Every test below goes in a new file.
  - [ ] 19.1 Add the type and the schema fields
    - Add `RunScope`; add the optional `scope` to `runMetadataSchema` and `historyRecordSchema`. The enum has exactly `full` and `spec-only`. Export from `trick-or-test/report`.
    - Write `test/core/scope-schema.test.ts`: both fields absent parse and mean `full`; both values parse; any other value is rejected; an unknown key is still rejected.
    - _Requirements: 8.28, 8.29_
    - _Validation: npx vitest run --project engine packages/engine/test/core/scope-schema.test.ts passes_
  - [ ] 19.2 Choose the comparison record
    - Create `core/run-scope.ts` with `scopeOf` and `selectComparisonRecord`, and let `buildHistoryRecord` compare only Spec_Mutant ids when the scope is `spec-only`. The signature of `buildHistoryRecord` does not change.
    - Write `test/core/run-scope.test.ts`: a record with no `scope` is `full`; a `full` run after `full`, `spec-only` gets the first record; a `full` run with no `full` record gets none; a `spec-only` run gets the latest record of either scope; an empty list gives none; a `full` run that follows a `spec-only` record does not list mechanical ids that the last `full` record had as killed; a `spec-only` record lists no mechanical id in `newlyKilledIds`; two runs of one scope give the 8.9 result.
    - _Requirements: 8.9, 8.28, 8.30_
    - _Validation: npx vitest run --project engine packages/engine/test/core/run-scope.test.ts passes_
  - [ ] 19.3 Write Property 34: History comparison across scopes
    - Write `test/core/run-scope.property.test.ts` with **Property 34** as stated in `design.md`.
    - **Validates: Requirements 8.9, 8.28, 8.30**
    - _Requirements: 8.9, 8.28, 8.30_
    - _Validation: npx vitest run --project engine packages/engine/test/core/run-scope.property.test.ts passes_
  - [ ] 19.4 Write the scope in the builders
    - In `core/report.ts` write `metadata.scope` and `HistoryRecord.scope` and `config.scope` of the Mutation_Report. For `spec-only` the builders get no Mechanical_Mutants, so `mutantCounts.mechanical`, `strykerCounts` and the strays are absent. A `full` run writes `scope: "full"`.
    - Write `test/core/scope-builders.test.ts`: the three outputs carry the scope; a spec-only verdict has no `strykerCounts` key and no `mechanical` key (check with `Object.hasOwn`); a spec-only Mutation_Report holds Spec_Mutants only; the output is byte-identical for equal input.
    - _Requirements: 8.13, 8.22, 8.23, 8.28, 9.18_
    - _Validation: npx vitest run --project engine packages/engine/test/core/scope-builders.test.ts passes_
  - [ ] 19.5 Write Property 32: New fields are optional, strict and clean
    - Write `test/core/verdict.new-fields.property.test.ts` with **Property 32** as stated in `design.md`. It covers every new field of tasks 15 to 19.
    - **Validates: Requirements 8.12, 8.13, 8.17, 8.22, 8.25, 8.26, 8.27, 8.28, 8.29, 8.31**
    - _Requirements: 8.12, 8.13, 8.17, 8.29, 8.31_
    - _Validation: npx vitest run --project engine packages/engine/test/core/verdict.new-fields.property.test.ts passes_
  - [ ] 19.6 Parse the option
    - In `cli/` add `--scope <full|spec-only>` to the argument parser of `run` and `measure`, with `full` as default, a usage line, and the errors of 9.19 and 9.20 (exit code 1, message on stderr).
    - Write `test/cli/args-scope.test.ts`: no option gives `full`; both values are accepted by `run` and `measure`; a third value prints the usage text and exits 1; `--scope spec-only --since main` prints an error that names both options and exits 1; `--scope full --since main` is accepted; a missing value is a usage error.
    - _Requirements: 9.17, 9.19, 9.20_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/args-scope.test.ts passes_
  - [ ] 19.7 Run the spec-only pipeline
    - In `cli/orchestrate.ts` skip the git diff, the project listing for exclusions, the exclusion computation and the StrykerJS run when the scope is `spec-only`; go from the Baseline_Run to the pristine Sandbox. Pass `scope` to the builders. Print the scope in the summary, `strays: not run`, and no StrykerJS figure (9.21). Leave the npm scripts `measure` and `demo` without `--scope` (9.22).
    - Write `test/cli/orchestrate-spec-only.test.ts` with fake adapters: neither the Stryker adapter nor git is called; the three written files carry `scope: "spec-only"`; no `strykerCounts`; no stray in `mutants`; the Baseline_Run and every Spec_Mutant ran; the claims of task 17 equal those of a full run on the same fakes (11.15); the summary text holds `spec-only` and `not run` and no stray count; a `full` run on the same fakes still calls the Stryker adapter. Add a test in the same file that reads the root `package.json` and checks that the scripts `measure` and `demo` contain no `--scope`.
    - _Requirements: 9.18, 9.21, 9.22, 11.15_
    - _Validation: npx vitest run --project engine packages/engine/test/cli/orchestrate-spec-only.test.ts passes_
  - [ ] 19.8 Run a spec-only run end to end
    - Write `test/e2e/pricing-spec-only.test.ts`: run the built CLI with `--scope spec-only` on `examples/pricing` into an output directory under `.trickortest/`, and check that the run takes less time than the full run of the e2e test (print both times, assert only that no StrykerJS temporary directory was created), that the three files carry the scope, hold no stray, no `strykerCounts`, and no absolute path, and that `git status --porcelain` of the project shows no change outside `.trickortest/`. Remove the output directory afterwards.
    - _Requirements: 9.18, 9.21, 10.8, 10.11_
    - _Validation: npm run test:e2e -w trick-or-test passes_
  - [ ] 19.9 Checkpoint - Run scope
    - Run `npm run check` from the repository root, then `npm run test:e2e --workspace trick-or-test`. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

- [ ] 20. Build the source of the test that would catch a survivor (Gap 6)
  - Source: requirement 12 and Property 35 in `design.md`. A Witness is one input and the answer the spec demands. `buildWitnessTest` turns it into the source of one Vitest test. The engine calls no LLM (ADR 0004). Every test below goes in a new file.
  - [ ] 20.1 Add `buildWitnessTest`
    - Create `core/witness-test.ts` as in `design.md` and re-export it and `WitnessTestError` from `trick-or-test/report`. The module imports nothing from `node:`; it computes the relative import path on `/`-separated strings.
    - Write `test/core/witness-test.test.ts`: the example of `design.md` (`testFile` `test/hunt/oath-5.5.test.ts`, `from` `src/index.ts`) gives the import path `../../src/index`; a test file in the same directory as the module gives `./index`; a `from` with `.tsx` loses the extension; a Witness with `expected` gives `toEqual` and no `toThrow`; one with `expectedError` gives `toThrow`, imports the class from the same module, and has no `toEqual`; the test name starts with the Criterion id and a space; the output has the shape of `design.md` (readable, two-space indented JSON text after `const args = ` and `const expected: unknown = `, `] as unknown as Parameters<typeof priceCart>;`, `expect(priceCart(...args)).toEqual(expected);`, and `toThrow(ValidationError)` for `expectedError`) and no `JSON.parse` call; an `expected` of `null`, of `0`, of a nested object and of a string with quotes and a backslash, and an `args` list with nested arrays, are the text of `JSON.stringify(value, null, 2)` re-indented, and parse back with `JSON.parse` once the indent is removed; an empty `args` list prints `[]`; keys keep the order of the Witness object; a key `__proto__` in `args` (at the top level and nested) switches only `args` to the `JSON.parse("...")` form and the parsed value has an own `__proto__` property; a key `__proto__` in `expected` switches only `expected`; with the key in both, both use the form; an export name `a-b`, an error class `1X`, a `from` with `..`, an absolute `from` and an absolute `testFile` each return an error that names the field and no source; two calls with equal input give equal strings.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
    - _Validation: npx vitest run --project engine packages/engine/test/core/witness-test.test.ts passes_
  - [ ] 20.2 Write Property 35: Witness test source
    - Write `test/core/witness-test.property.test.ts` with **Property 35** as stated in `design.md`. The generator reaches nested values, unicode, `null`, an empty `args` list, and test files at several depths. It also generates `args` and `expected` with and without the key `__proto__` at the top level and at depth, in every combination, and the property covers both forms: the plain form (cut out between the markers, remove the indent, `JSON.parse`, compare) and the `JSON.parse` form (parse twice, compare).
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7**
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
    - _Validation: npx vitest run --project engine packages/engine/test/core/witness-test.property.test.ts passes_
  - [ ] 20.3 Check that the generated test runs
    - Write `test/adapters/witness-test-run.test.ts`: take two Witnesses of the committed mutants of `examples/pricing` (one with `expected`, one with `expectedError`), build the test source, write it under `.trickortest/` of a copy of the project in a Sandbox, run Vitest on it, and check that it passes on the original code and fails once the matching Spec_Mutant is applied in the Sandbox. Also type-check the generated file with `tsc --noEmit` in strict mode in the Sandbox, for both Witnesses and for one more Witness whose `args` holds a value that does not match the parameter type of the export, to show that the cast through `unknown` compiles. Remove the Sandbox afterwards.
    - _Requirements: 12.2, 12.3_
    - _Validation: npx vitest run --project engine packages/engine/test/adapters/witness-test-run.test.ts passes_
  - [ ] 20.4 Checkpoint - Witness test
    - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

- [ ] 21. Give each unattacked Criterion of the example a Spec_Mutant or a reason (Gap 7)
  - Source: requirement 10.14 and `.kiro/steering/mutant-patches.md`. `examples/pricing/mutants/cart-pricing` has 24 Spec_Mutants and no `skipped.json`, so 1.1 to 1.5, 2.2, 3.4 and 8.1 to 8.5 show as unattacked with no explanation.
  - Rules for whoever does this task: read only `.kiro/specs/cart-pricing/requirements.md`, the files of `examples/pricing/src/` and the steering file. Never read or edit the files of `examples/pricing/test/` (the steering file forbids it) and never edit `examples/pricing/src/`. Decide from the text of each Criterion and from `src/` whether an exported function can show the violation. Write `expected` by hand from the Criterion, never by running the code. A Criterion that no exported function can show gets a Skip_File entry with a reason, not a forced mutant.
  - If this task adds Spec_Mutants, the numbers of requirement 11.16 (25 claims, 16 held, 7 not held, 2 unchecked) change for the regenerated files: a Criterion that was `unchecked` becomes `held` or `not-held`, and more Spec_Mutants of an attacked Criterion can change a `held` into `not-held`. The test of task 17.8 reads a fixture and does not change. Task 22 checks the new numbers.
  - [ ] 21.1 Decide and write for 1.1 to 1.5
    - For each of the five Criteria of Requirement 1, write `examples/pricing/mutants/cart-pricing/oath-<id>-<slug>.json` with a Witness, or add an entry `{ "requirement": "<id>", "reason": "<why no exported function shows it>" }` to `examples/pricing/mutants/cart-pricing/skipped.json` (a JSON array, created with the file tools). One mutant changes one span in one file.
    - _Requirements: 10.14_
    - _Validation: npm run build -w trick-or-test && node packages/engine/dist/cli/main.js run --project examples/pricing --spec cart-pricing --scope spec-only --output .trickortest/probe exits 0 (the loader rejects a malformed mutant or skip file before the baseline; 21.4 reads the result)_
  - [ ] 21.2 Decide and write for 2.2 and 3.4
    - The same rule for the Criteria 2.2 and 3.4.
    - _Requirements: 10.14_
    - _Validation: the command of 21.1 exits 0_
  - [ ] 21.3 Decide and write for 8.1 to 8.5
    - The same rule for the five Criteria of Requirement 8.
    - _Requirements: 10.14_
    - _Validation: the command of 21.1 exits 0_
  - [ ] 21.4 Check every new mutant and entry with a spec-only run
    - Run `npm run build -w trick-or-test`, then `node packages/engine/dist/cli/main.js run --project examples/pricing --spec cart-pricing --scope spec-only --output .trickortest/probe` (needs task 19). Check in `.trickortest/probe/verdict.json` that each of the twelve Criteria is `guarded`, `unguarded` or `skipped` (none is `unattacked`), and that no new mutant is Ghost, InvalidWitness, CompileError or NotApplicable. A new mutant with one of those statuses is fixed in the mutant file (the span, or the type of the change), never by changing `expected` to match the code. If the original code does not give `expected`, report the Criterion and the mismatch; do not hide it. Stop rule: the published demo tells the story of one unguarded promise, 7.4, and `scripts/demo` adds tests for 7.4 only. WHEN any new Spec_Mutant has the status Survived, report the Criterion, the mutant id and its Witness, and stop before task 21.5. Do not write a test for it and do not remove the mutant. The user decides what happens to the demo numbers. Remove `.trickortest/probe` afterwards, also when the task stops.
    - _Requirements: 4.1, 7.3, 7.4, 10.14_
    - _Validation: node packages/engine/dist/cli/main.js run --project examples/pricing --spec cart-pricing --scope spec-only --output .trickortest/probe passes_
  - [ ] 21.5 Name the committed test that counts the mutants
    - `packages/engine/test/e2e/pricing.test.ts` asserts `expect(expectedMutantIds).toHaveLength(24)` in the test `10.10 all 24 spec mutants are present and valid`. If task 21.1 to 21.3 added Spec_Mutants, this sealed test fails. Do not edit it. Report the test name and the new count to the user and wait for the decision on a spec change (requirement 10.14 and the spec of `examples/pricing`). If no Spec_Mutant was added, state that in the report.
    - _Requirements: 10.14_
    - _Validation: npm run test:e2e -w trick-or-test passes, or the user has decided on the test named above_
  - [ ] 21.6 Checkpoint - Example mutants
    - Run `npm run check` from the repository root. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

- [ ] 22. Regenerate the committed evidence and check that the totals agree
  - Source: requirements 9.13, 9.14, 10.15 and everything above. Files in `reports/` and in `apps/viewer/public/demo/` are generated only by `npm run measure` and `npm run demo`. Nobody edits them by hand.
  - [ ] 22.1 Check the agreement of the three files of a run
    - Write `scripts/run-agreement.test.ts`: for `reports/` and for `apps/viewer/public/demo/before` and `.../after`, parse the three files with the schemas of `trick-or-test/report` and check that the id sets of `verdict.json` `mutants`, of `mutation-report.json` and of the last line of `history.jsonl` are equal; that `mutantCounts` agrees with the ids listed (per kind and status) and `twinsMerged` plus the mechanical count equals `strykerCounts.total`; that `strykerCounts.detected` and `undetected` are not more than `total`; that `baselineTests` is not empty, that every killing-test id of a mutant is in it, and that the sum of `claimCounts` equals its total and the number of claims in `baselineTests`; that the last history record's `coverageByCriterion` equals `coverage` of the verdict; that `metadata.specName` is `cart-pricing`, `requirements` holds one entry for each requirement of the spec, and `scope` is `full` or absent; and that no string holds an absolute path. The test fails with a message that names the file and the field.
    - _Requirements: 8.17, 8.21, 8.22, 8.23, 6.12, 11.12_
    - _Validation: npm run build -w trick-or-test && npx vitest run --project scripts scripts/run-agreement.test.ts passes, run after 22.2 and 22.3 (it reads the committed files, so it fails before they are regenerated)_
  - [ ] 22.2 Regenerate `reports/`
    - Run `npm run measure` once from the repository root and commit the changed files in `reports/`. This appends one line to `reports/history.jsonl`; the earlier lines stay unchanged.
    - _Requirements: 9.12, 9.13, 9.14_
    - _Validation: npm run measure && test -f reports/mutation-report.json && test -f reports/verdict.json && test -f reports/history.jsonl passes_
  - [ ] 22.3 Regenerate the demo runs
    - Run `npm run demo` and commit the changed files in `apps/viewer/public/demo/`. Check that the `after` history still extends the `before` line, and that the Oathbreaker of 7.4 goes from survivor to killed.
    - _Requirements: 9.14, 9.22_
    - _Validation: npm run demo passes_
  - [ ] 22.4 Name the committed tests that assert a changed number
    - Run `npm run check` and `npm run test:e2e --workspace trick-or-test`. For each committed test that fails because a count changed (the first candidates are `packages/engine/test/e2e/pricing.test.ts`, `apps/viewer/test/demo/demo-files.test.ts` and `packages/engine/test/cli/main.test.ts`, which read the committed files or the example), do not edit it. Report the test name, the old number and the new number in the final report, so that the user decides. A viewer test that asserts a count, for example 112 mutants, is named in this report.
    - _Requirements: 9.14_
    - _Validation: npm run check passes, or every failing committed test is named in the report_
  - [ ] 22.5 Check the files of a real run end to end
    - Write `test/e2e/pricing-files.test.ts` for requirement 10.15: run the built CLI on `examples/pricing`, read the three files written, and check the same agreements as `scripts/run-agreement.test.ts`, plus: the length of `baselineTests` equals the number of passed tests in a Vitest JSON run of the project; the claim numbers equal the ones in the regenerated `reports/verdict.json` (they are the numbers of 11.16 if task 21 added no Spec_Mutant, and the new numbers if it did).
    - _Requirements: 6.12, 8.21, 8.22, 8.23, 10.15, 11.12_
    - _Validation: npm run test:e2e -w trick-or-test passes_
  - [ ] 22.6 Checkpoint - Evidence
    - Run `npm run check` from the repository root, then `npm run test:e2e --workspace trick-or-test`. Ensure all tests pass, ask the user if questions arise.
    - _Validation: npm run check passes_

## Notes

- Tasks 15 to 22 make the files that the engine writes carry what the viewer and the MCP server need: one task per gap (15 totals, 16 baseline tests, 17 claims, 18 small fields, 19 run scope, 20 witness test, 21 example mutants), then task 22 regenerates the evidence. Properties 27 to 35 have their own tasks: P27 (17.5), P28 (17.6), P29 (15.4), P30 (15.5), P31 (16.3), P32 (19.5), P33 (18.2), P34 (19.3), P35 (20.2). Every new field is optional in the schemas.
- Tasks 15 to 22 edit no committed test file. Where a committed test asserts a number that changes, the task names the test and stops (21.5, 22.4).
- Task 21 follows `.kiro/steering/mutant-patches.md` and never reads the tests of the example.
- Task 14 removes the git repository-location variables from the environment of every git command the engine runs (requirement 3.21). It edits one committed test file, `test/adapters/git-adapter.test.ts`, to pass the filtered environment to its own git calls; its assertions do not change.
- Task 13 adds the criterion text and the mutated witness outcome to `verdict.json`. Property 26 has its own task: P26 (13.4). It is new because Properties 16 and 20 live in sealed test files.
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
    { "id": 38, "tasks": ["12.55"] },
    { "id": 39, "tasks": ["13.1"] },
    { "id": 40, "tasks": ["13.2", "13.3"] },
    { "id": 41, "tasks": ["13.4", "13.5"] },
    { "id": 42, "tasks": ["13.6"] },
    { "id": 43, "tasks": ["14.1", "14.2"] },
    { "id": 44, "tasks": ["14.3"] },
    { "id": 45, "tasks": ["14.4"] },
    { "id": 46, "tasks": ["15.1"] },
    { "id": 47, "tasks": ["15.2"] },
    { "id": 48, "tasks": ["15.3"] },
    { "id": 49, "tasks": ["15.4", "15.5"] },
    { "id": 50, "tasks": ["15.6"] },
    { "id": 51, "tasks": ["15.7"] },
    { "id": 52, "tasks": ["16.1"] },
    { "id": 53, "tasks": ["16.2"] },
    { "id": 54, "tasks": ["16.3", "16.4"] },
    { "id": 55, "tasks": ["16.5"] },
    { "id": 56, "tasks": ["17.1"] },
    { "id": 57, "tasks": ["17.2"] },
    { "id": 58, "tasks": ["17.3"] },
    { "id": 59, "tasks": ["17.4"] },
    { "id": 60, "tasks": ["17.5", "17.6", "17.7"] },
    { "id": 61, "tasks": ["17.8"] },
    { "id": 62, "tasks": ["17.9"] },
    { "id": 63, "tasks": ["18.1", "18.3"] },
    { "id": 64, "tasks": ["18.2", "18.4"] },
    { "id": 65, "tasks": ["18.5"] },
    { "id": 66, "tasks": ["18.6"] },
    { "id": 67, "tasks": ["19.1", "19.2"] },
    { "id": 68, "tasks": ["19.3", "19.4"] },
    { "id": 69, "tasks": ["19.5", "19.6"] },
    { "id": 70, "tasks": ["19.7"] },
    { "id": 71, "tasks": ["19.8"] },
    { "id": 72, "tasks": ["19.9"] },
    { "id": 73, "tasks": ["20.1"] },
    { "id": 74, "tasks": ["20.2", "20.3"] },
    { "id": 75, "tasks": ["20.4"] },
    { "id": 76, "tasks": ["21.1", "21.2", "21.3"] },
    { "id": 77, "tasks": ["21.4"] },
    { "id": 78, "tasks": ["21.5"] },
    { "id": 79, "tasks": ["21.6"] },
    { "id": 80, "tasks": ["22.2"] },
    { "id": 81, "tasks": ["22.3"] },
    { "id": 82, "tasks": ["22.1", "22.4", "22.5"] },
    { "id": 83, "tasks": ["22.6"] }
  ]
}
```
