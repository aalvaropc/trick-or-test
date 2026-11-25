# Requirements Document

## Introduction

The mutant engine is the core of Trick or Test, published as the npm package `trick-or-test` from `packages/engine`. The engine tells a developer which acceptance criteria of a Kiro spec are guarded by tests. The engine attacks a target project with two kinds of mutants (mechanical mutants from StrykerJS and spec mutants written by a Kiro agent), runs the project's Vitest tests against each mutant, and reports the result per acceptance criterion.

The MVP target is a TypeScript, ES module project that uses Vitest and keeps specs in `.kiro/specs/<name>/requirements.md`. The demo target is `examples/pricing` with the spec `.kiro/specs/cart-pricing`.

The engine makes no LLM calls (ADR 0004). The MCP server and the Kiro hook entry points belong to separate specs and are out of scope here.

## Glossary

- **Engine**: The `trick-or-test` package in `packages/engine`, including its core logic and its adapters.
- **Target_Project**: The project under attack, identified by its root directory.
- **Config_Loader**: The Engine component that reads and validates `trickortest.config.json`.
- **Requirements_Parser**: The Engine component that extracts acceptance criteria from a `requirements.md` file.
- **Criterion**: One numbered acceptance criterion with an id `<requirement>.<criterion>`, a text and a line number.
- **Stryker_Adapter**: The Engine component that runs StrykerJS with the Vitest runner on the Target_Project.
- **Species_Classifier**: The Engine component that maps a mechanical mutant to a species using the table in `.kiro/steering/bestiary.md`.
- **Spec_Mutant_Loader**: The Engine component that reads and validates spec mutant files and `skipped.json`.
- **Spec_Mutant_Runner**: The Engine component that applies, type-checks, witnesses and tests each spec mutant in a sandbox.
- **Sandbox**: A copy of the Target_Project in a temporary directory in which mutants are applied. The Target_Project working tree is never modified.
- **Mechanical_Mutant**: A mutant produced by StrykerJS.
- **Spec_Mutant**: A mutant described by a JSON file in `<mutants dir>/<spec name>/`, as defined in `.kiro/steering/mutant-patches.md`.
- **Witness**: The record in a Spec_Mutant of an exported function, JSON arguments, and either an `expected` value or an `expectedError` class name.
- **Mutant_Status**: One of Killed, Survived, Timeout, Ghost, InvalidWitness, CompileError, NotApplicable.
- **Property_Test**: A test whose file matches the property-test globs, or whose body calls `fc.assert`, `fc.check` or `test.prop`.
- **Example_Test**: A test that is not a Property_Test.
- **Kill_Class**: One of `examples-only`, `properties-only`, `both` or `unattributed`, assigned to a killed mutant from the kinds of tests that failed. The `unattributed` group holds each killed mutant whose killing tests cannot be identified.
- **Baseline_Run**: One run of the test suite of the Target_Project on the unmutated Target_Project before any mutant is run.
- **Oathbreaker**: The species of every Spec_Mutant.
- **Coverage_Status**: One of guarded, unguarded, unattacked or skipped, assigned to a Criterion.
- **Skip_File**: The file `<mutants dir>/<spec name>/skipped.json` in which the agent records a non-empty reason for each Criterion that cannot be attacked.
- **Mutation_Report**: The JSON file that conforms to `mutation-testing-report-schema`.
- **Verdict_File**: The sidecar file `verdict.json` with requirement coverage, kill attribution, witnesses and run metadata.
- **History_File**: The append-only file with one record per run. The viewer draws the hunt timeline from the records.
- **Reporter**: The Engine component that writes the Mutation_Report, the Verdict_File and the History_File.
- **CLI**: The `trick-or-test` command-line program with the commands `run` and `measure`.
- **Changed_Range**: A `file:start-end` line range that was changed since a given git ref.

## Requirements

### Requirement 1: Configuration

**User Story:** As a developer, I want to configure the Engine in one file with sensible defaults, so that the Engine works on my project with little setup.

#### Acceptance Criteria

1. WHEN `trickortest.config.json` exists in the Target_Project root, THE Config_Loader SHALL parse the file into a configuration with the fields spec directory, source globs, test globs, property-test globs, mutants directory, output directory and the optional suite time limit override `timeoutMs` in milliseconds.
2. WHERE a field is absent from `trickortest.config.json`, THE Config_Loader SHALL use the default value of that field.
3. IF `trickortest.config.json` does not exist, THEN THE Config_Loader SHALL return a configuration made only of default values.
4. IF `trickortest.config.json` is not valid JSON, THEN THE Config_Loader SHALL return an error that names the file.
5. IF a field of `trickortest.config.json` has the wrong type or an unknown name, THEN THE Config_Loader SHALL return an error that names the file and the field.
6. THE Config_Loader SHALL resolve every path in the configuration relative to the Target_Project root.
7. WHERE `timeoutMs` is absent from `trickortest.config.json`, THE Config_Loader SHALL return a configuration in which `timeoutMs` is unset, so that the default suite time limit formula of the Spec_Mutant_Runner applies.

### Requirement 2: Requirements parser

**User Story:** As a developer, I want every acceptance criterion extracted from my spec, so that results can be reported per criterion.

#### Acceptance Criteria

1. WHEN a `requirements.md` file in Kiro format is provided, THE Requirements_Parser SHALL return one Criterion for each numbered item under each `#### Acceptance Criteria` heading.
2. THE Requirements_Parser SHALL assign to each Criterion the id `<requirement>.<criterion>`, where `<requirement>` is the number N of the enclosing `### Requirement N: <title>` heading and `<criterion>` is the number of the item.
3. THE Requirements_Parser SHALL record for each Criterion the text of the item and the 1-based line number of the item in the file.
4. THE Requirements_Parser SHALL return Criteria in document order.
5. IF a `requirements.md` file contains the same criterion id twice, THEN THE Requirements_Parser SHALL return an error that names the file, the id and both line numbers.
6. IF a numbered item appears under an `#### Acceptance Criteria` heading that has no enclosing `### Requirement N:` heading, THEN THE Requirements_Parser SHALL return an error that names the file and the line number.
7. IF a `requirements.md` file contains no Criterion, THEN THE Requirements_Parser SHALL return an error that names the file.
8. FOR ALL generated requirements documents with N requirements of K criteria each, THE Requirements_Parser SHALL return exactly the ids `n.k` for n from 1 to N and k from 1 to K, in document order.

### Requirement 3: Mechanical mutants

**User Story:** As a developer, I want StrykerJS to produce mechanical mutants and run my Vitest tests against them, so that I see which small code changes my tests miss.

#### Acceptance Criteria

1. WHEN the CLI runs the mechanical stage, THE Stryker_Adapter SHALL run StrykerJS with the Vitest runner, incremental mode, the JSON reporter and `disableBail` enabled.
2. THE Stryker_Adapter SHALL list the Vitest runner in the Stryker `plugins` option.
3. WHEN the Target_Project resolves TypeScript 7 or newer, THE Stryker_Adapter SHALL set the Stryker `tsconfigFile` option to a path that does not exist.
4. WHEN the Target_Project resolves a TypeScript version older than 7, THE Stryker_Adapter SHALL leave the Stryker `tsconfigFile` option at the Target_Project value.
5. IF the initial test run of StrykerJS fails because of static mutants, THEN THE Stryker_Adapter SHALL run StrykerJS exactly one more time with `ignoreStatic` enabled and record in the Mutation_Report that the retry happened.
6. IF StrykerJS exits with an error, THEN THE Engine SHALL report the first error line of StrykerJS and write no Verdict_File.
7. THE Stryker_Adapter SHALL exclude from the Stryker sandbox every folder that is not part of the Target_Project build, including every directory reached through a symbolic link.
8. THE Stryker_Adapter SHALL exclude every file under `.stryker-tmp` from the tests that are run and from the tests that are counted.
9. WHERE the user supplies a git ref, THE Stryker_Adapter SHALL restrict mutation to the Changed_Ranges since that ref, expressed as `file:start-end` mutate patterns.
10. WHERE the user supplies a git ref and no line changed since that ref in the source files, THE Stryker_Adapter SHALL report zero Mechanical_Mutants without running StrykerJS.
11. THE Species_Classifier SHALL map each Mechanical_Mutant to the species listed for its `mutatorName` in `.kiro/steering/bestiary.md`, using the replacement text where the table requires it.
12. IF the `mutatorName` of a Mechanical_Mutant is not in the species table, THEN THE Species_Classifier SHALL assign the species Unclassified.
13. THE Species_Classifier SHALL return the same species for the same `mutatorName` and replacement on every call.
14. THE Stryker_Adapter SHALL leave the Target_Project working tree unmodified, except for files in the output directory and in `.trickortest/`.
15. IF any test fails in the Baseline_Run, THEN THE Engine SHALL abort the run, report the failing tests and write no Verdict_File.

### Requirement 4: Spec mutant loading

**User Story:** As a developer, I want spec mutant files validated before use, so that a malformed mutant is reported instead of silently ignored.

#### Acceptance Criteria

1. WHEN the mutants directory contains `<spec name>/*.json`, THE Spec_Mutant_Loader SHALL parse each file other than `skipped.json` into a Spec_Mutant with the fields id, requirement, file, original, mutated, why and witness.
2. THE Spec_Mutant_Loader SHALL accept a Witness only when the Witness has exactly one of `expected` and `expectedError`.
3. WHERE a Witness omits `from`, THE Spec_Mutant_Loader SHALL set `from` to the `file` of the Spec_Mutant.
4. IF a mutant file is not valid JSON or does not match the Spec_Mutant schema, THEN THE Spec_Mutant_Loader SHALL return an error that names the file and the field, and continue to load the other files.
5. IF two Spec_Mutants have the same id, THEN THE Spec_Mutant_Loader SHALL return an error that names both files.
6. IF the `requirement` of a Spec_Mutant is not the id of a Criterion in the parsed `requirements.md`, THEN THE Spec_Mutant_Loader SHALL return an error that names the file and the requirement.
7. THE Spec_Mutant_Loader SHALL parse the Skip_File into a list of entries with a Criterion id and a reason.
8. IF a Skip_File entry has an empty reason, THEN THE Spec_Mutant_Loader SHALL return an error that names the entry.
9. IF a Skip_File entry names a Criterion id that does not exist or a Criterion that also has a Spec_Mutant, THEN THE Spec_Mutant_Loader SHALL return an error that names the entry.
10. THE Spec_Mutant_Loader SHALL return Spec_Mutants ordered by id.

### Requirement 5: Spec mutant execution

**User Story:** As a developer, I want each spec mutant applied in a sandbox, proven to change behaviour, and tested, so that a surviving spec mutant means a promise in the spec is not guarded.

#### Acceptance Criteria

1. WHEN a Spec_Mutant is run, THE Spec_Mutant_Runner SHALL apply the mutation in a Sandbox copy of the Target_Project and leave the Target_Project working tree unchanged, including when the run of the Spec_Mutant fails, times out or crashes.
2. IF `original` does not appear exactly once in `file`, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to NotApplicable.
3. WHEN the mutation is applied, THE Spec_Mutant_Runner SHALL type-check the Sandbox, and IF the type-check reports an error, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to CompileError.
4. THE Spec_Mutant_Runner SHALL run each Witness through the Vitest of the Target_Project so that TypeScript and extensionless imports resolve as in the tests of the Target_Project.
5. THE Spec_Mutant_Runner SHALL read the outcome of each Witness from a file written by the Witness, not from console output.
6. IF the original code does not return the `expected` value, or does not throw an error of the class `expectedError`, for the Witness input, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to InvalidWitness and report both the expected outcome and the outcome that the original code produced.
7. IF the mutated code gives the same outcome as the original code for the Witness input, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to Ghost.
8. WHEN the Witness shows a difference between the original code and the mutated code, THE Spec_Mutant_Runner SHALL run the test suite of the Target_Project in the Sandbox.
9. IF at least one test fails in the Sandbox, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to Killed.
10. IF every test passes in the Sandbox, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to Survived.
11. IF the test run in the Sandbox exceeds the timeout, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to Timeout.
12. THE Spec_Mutant_Runner SHALL compare Witness values by deep structural equality of their JSON form.
13. THE Spec_Mutant_Runner SHALL remove each Sandbox after the Spec_Mutant is run, including when the run fails, times out or crashes.
14. THE Spec_Mutant_Runner SHALL produce the same Mutant_Status for the same Target_Project and Spec_Mutant on every run.
15. THE Spec_Mutant_Runner SHALL set the suite time limit for a Spec_Mutant to the duration of the Baseline_Run multiplied by 1.5, plus 5 seconds, and WHERE `timeoutMs` is set in the configuration, THE Spec_Mutant_Runner SHALL set the suite time limit to `timeoutMs` instead.

### Requirement 6: Kill attribution

**User Story:** As a developer, I want to know which tests killed each mutant and whether examples or properties did it, so that I can judge the kind of protection my tests give.

#### Acceptance Criteria

1. WHEN a Mechanical_Mutant is killed, THE Engine SHALL record the tests that killed the Mechanical_Mutant, using the `killedBy` data and the test files of a single StrykerJS run with `disableBail`.
2. WHEN a Spec_Mutant is killed, THE Engine SHALL record the failing tests read from one Vitest run with the JSON reporter.
3. THE Engine SHALL classify a test as a Property_Test WHEN the file of the test matches a property-test glob.
4. THE Engine SHALL classify a test as a Property_Test WHEN the body of the test calls `fc.assert`, `fc.check` or `test.prop`.
5. THE Engine SHALL classify a test that is not a Property_Test as an Example_Test.
6. WHEN every killing test of a mutant is an Example_Test, THE Engine SHALL assign the Kill_Class `examples-only`.
7. WHEN every killing test of a mutant is a Property_Test, THE Engine SHALL assign the Kill_Class `properties-only`.
8. WHEN the killing tests of a mutant include both an Example_Test and a Property_Test, THE Engine SHALL assign the Kill_Class `both`.
9. IF a mutant has the Mutant_Status Killed and no killing test can be identified, THEN THE Engine SHALL record the mutant with an empty list of killing tests and the Kill_Class `unattributed`.
10. THE Engine SHALL place each killed mutant in exactly one Kill_Class, so that the count of `examples-only`, plus the count of `properties-only`, plus the count of `both`, plus the count of `unattributed` equals the number of killed mutants.

### Requirement 7: Requirement coverage

**User Story:** As a developer, I want a status for each acceptance criterion, so that I see which promises in the spec would be noticed if broken.

#### Acceptance Criteria

1. WHEN every valid Spec_Mutant of a Criterion has the Mutant_Status Killed or Timeout (Timeout counts as killed) and at least one such Spec_Mutant exists, THE Engine SHALL assign the Coverage_Status guarded to the Criterion.
2. WHEN at least one Spec_Mutant of a Criterion has the Mutant_Status Survived, THE Engine SHALL assign the Coverage_Status unguarded to the Criterion.
3. WHEN a Criterion has no valid Spec_Mutant and no Skip_File entry, THE Engine SHALL assign the Coverage_Status unattacked to the Criterion.
4. WHEN a Criterion has a Skip_File entry, THE Engine SHALL assign the Coverage_Status skipped to the Criterion and record the reason of the entry.
5. THE Engine SHALL assign the Coverage_Status skipped only to a Criterion that has no valid Spec_Mutant.
6. THE Engine SHALL treat a Spec_Mutant as valid WHEN the Mutant_Status is Killed, Survived or Timeout.
7. THE Engine SHALL exclude every Spec_Mutant with the Mutant_Status Ghost, InvalidWitness, CompileError or NotApplicable from the counts of killed and survived mutants, and report each of them separately with its status.
8. THE Engine SHALL assign exactly one Coverage_Status to each Criterion of the parsed spec.
9. THE Engine SHALL report Mechanical_Mutants as strays, not tied to a Criterion, and keep the count of strays separate from the count of surviving Spec_Mutants.
10. THE Engine SHALL compute the headline count as the number of surviving Spec_Mutants.

### Requirement 8: Report output

**User Story:** As a developer, I want a standard mutation report plus a sidecar with the extra data, so that other Stryker-compatible tools can read my results and the viewer can show the rest.

#### Acceptance Criteria

1. WHEN a run completes, THE Reporter SHALL write a Mutation_Report that conforms to `mutation-testing-report-schema` into the output directory.
2. THE Reporter SHALL include in the Mutation_Report both Mechanical_Mutants and Spec_Mutants.
3. THE Reporter SHALL map the Mutant_Status Ghost, InvalidWitness and NotApplicable to the schema status Ignored, with a `statusReason` that names the Mutant_Status of the Engine.
4. THE Reporter SHALL map the Mutant_Status CompileError to the schema status CompileError and the Mutant_Status Timeout to the schema status Timeout.
5. WHEN a run completes, THE Reporter SHALL write a Verdict_File into the output directory with the Coverage_Status of each Criterion, the Mutant_Status of the Engine for each mutant, the Kill_Class of each killed mutant, each Witness, whether the `ignoreStatic` retry happened, and the run metadata.
6. THE Reporter SHALL include in the run metadata the git commit, the seed, and the versions of the Engine, Node.js, StrykerJS, Vitest and TypeScript.
7. THE Reporter SHALL use the `id` from the mutant file as the id of each Spec_Mutant, and SHALL build the id of each Mechanical_Mutant as a hash of the file, the original text and the replacement, with no timestamp in the hash.
8. WHEN a run completes, THE Reporter SHALL append exactly one record to the History_File and leave earlier records unchanged.
9. THE Reporter SHALL write each history record with enough data to replay the run and to draw the hunt timeline: the time, the git commit, the seed, the configuration, the ids and Mutant_Status of the mutants, the count of mutants per Mutant_Status, the count of Criteria per Coverage_Status, and the ids of the mutants killed in this run that the previous record did not list as killed.
10. THE Reporter SHALL validate the Verdict_File and every history record with a zod schema before the file is written.
11. IF the output directory cannot be written, THEN THE Reporter SHALL return an error that names the path.
12. FOR ALL valid Verdict_File values, writing then reading then writing SHALL produce identical file content (round-trip property).
13. THE Reporter SHALL produce byte-identical Mutation_Report and Verdict_File content for two runs with the same inputs, except for the run metadata fields that record time.
14. THE Reporter SHALL assign the species Oathbreaker to every Spec_Mutant.
15. WHEN a Spec_Mutant and a Mechanical_Mutant make the same change (same file, same span, same replacement, compared without regard to mutant ids), THE Reporter SHALL include one mutant in the Mutation_Report: the Spec_Mutant, tied to its Criterion.

### Requirement 9: Command-line interface

**User Story:** As a developer, I want two commands, so that I can attack my project and regenerate committed evidence.

#### Acceptance Criteria

1. WHEN the user runs `trick-or-test run`, THE CLI SHALL load the configuration, parse the spec, run the Mechanical_Mutants, run the Spec_Mutants, and write the Mutation_Report, the Verdict_File and a History_File record.
2. WHEN the user runs `trick-or-test measure`, THE CLI SHALL perform the actions of `run` and write the results into the output directory given for the command so that the files can be committed under `reports/`.
3. WHERE the user passes the option `--since <git-ref>`, THE CLI SHALL restrict Mechanical_Mutants to the Changed_Ranges since that ref.
4. WHERE the user passes the option `--project <path>`, THE CLI SHALL use that path as the Target_Project root, and otherwise THE CLI SHALL use the current working directory.
5. WHERE the user passes the option `--spec <name>`, THE CLI SHALL attack that spec, and otherwise THE CLI SHALL attack every spec directory that has a `requirements.md` file.
6. WHEN a command finishes, THE CLI SHALL print a summary with the number of surviving Spec_Mutants, the count of Criteria per Coverage_Status, the number of strays, and the paths of the files written.
7. WHEN a command finishes without an internal error, THE CLI SHALL exit with code 0, including when Spec_Mutants survive.
8. THE CLI SHALL define no option that changes the exit code according to the number of surviving Spec_Mutants.
9. IF a command ends with a configuration, parsing, Baseline_Run, StrykerJS or runtime error, THEN THE CLI SHALL print the error message to stderr and exit with code 1.
10. IF the user passes an unknown command or option, THEN THE CLI SHALL print the usage text to stderr and exit with code 1.
11. THE CLI SHALL make no network request to an LLM service and require no API key.

### Requirement 10: Architecture and verification

**User Story:** As a maintainer, I want the Engine split into a pure core and thin adapters and tested with examples and properties, so that the results are trustworthy and repeatable.

#### Acceptance Criteria

1. THE Engine SHALL implement the Config_Loader validation, Requirements_Parser, Species_Classifier, kill classification, coverage computation and report construction as pure functions that perform no file system, process or network access.
2. THE Engine SHALL place file system, process, StrykerJS, Vitest and git access in adapters behind interfaces.
3. THE Engine SHALL return expected failures as a `Result` value and throw only for programming errors.
4. THE Engine SHALL expose the report types and schemas from a `trick-or-test/report` subpath with no `node:` import.
5. THE Engine SHALL include example tests in `*.test.ts` files and property tests in `*.property.test.ts` files, with no file that mixes both kinds.
6. THE Engine SHALL include a property test for each correctness property in `design.md`.
7. THE Engine SHALL keep the generator of requirements documents in the test helpers, outside the published package.
8. THE Engine SHALL include an end-to-end test that runs the CLI on `examples/pricing` with the spec `.kiro/specs/cart-pricing` and checks the files written.
9. THE Engine SHALL run the end-to-end test from the separate npm script `test:e2e` and exclude the end-to-end test from `npm test`, because the end-to-end test takes about 20 seconds with StrykerJS and `npm test` runs in the quality gate on every turn.
10. THE Engine SHALL leave the files under `examples/pricing/src/` and `examples/pricing/test/` byte-identical during every run.
