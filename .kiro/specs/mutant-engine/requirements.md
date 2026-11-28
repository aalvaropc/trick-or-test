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
- **Failing_Test**: A test that fails an assertion or throws, or a test file that fails to load (an error at import or during collection, reported by Vitest as file status "failed" with no assertion results).
- **Stryker_Adapter**: The Engine component that runs StrykerJS with the Vitest runner on the Target_Project.
- **Species_Classifier**: The Engine component that maps a mechanical mutant to a species using the table in `.kiro/steering/bestiary.md`.
- **Spec_Mutant_Loader**: The Engine component that reads and validates spec mutant files and `skipped.json`.
- **Spec_Mutant_Runner**: The Engine component that applies, type-checks, witnesses and tests each spec mutant in a sandbox.
- **Sandbox**: A copy of the Target_Project in a temporary directory in which mutants are applied. The Target_Project working tree is never modified.
- **Mechanical_Mutant**: A mutant produced by StrykerJS.
- **Spec_Mutant**: A mutant described by a JSON file in `<mutants dir>/<spec name>/`, as defined in `.kiro/steering/mutant-patches.md`.
- **Witness**: The record in a Spec_Mutant of an exported function, JSON arguments, and either an `expected` value or an `expectedError` class name.
- **Occurrence_Index**: The 0-based position of a Mechanical_Mutant among all Mechanical_Mutants with the same file, original text and replacement, ordered by location (line, then column).
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
- **History_File**: The append-only JSON Lines file `history.jsonl` in the output directory, with one HistoryRecord per line and one line per run. The viewer (bestiary-viewer spec) reads exactly this format and draws the hunt timeline from the records.
- **HistoryRecord**: One JSON object on a single line of the History_File, describing one run.
- **Reporter**: The Engine component that writes the Mutation_Report, the Verdict_File and the History_File.
- **CLI**: The `trick-or-test` command-line program with the commands `run` and `measure`.
- **Changed_Range**: A `file:start-end` line range that was changed since a given git ref.
- **Twin**: A Mechanical_Mutant that makes the same change as a Spec_Mutant and that rule 8.15 therefore drops. A Twin appears in no output file.
- **Mutant_Counts**: The field `mutantCounts` of the Verdict_File. It counts the mutants listed in the Verdict_File, the Mutation_Report and the HistoryRecord of one run, per kind (spec, mechanical) and per Mutant_Status. A Twin is not in it.
- **Stryker_Counts**: The field `strykerCounts` of the Verdict_File. It holds `detected`, `undetected` and `total`, counted over every Mechanical_Mutant that StrykerJS produced, Twins included. It is the data behind the mutation score of a plain StrykerJS run on the Target_Project.
- **Baseline_Test**: One test that the Baseline_Run ran and that passed. Its id is `<file>::<full name>`, the same format as the ids of killing tests.
- **Claim**: A test's own statement that it validates a Criterion, written in the comment lines directly above the test call. A Claim says what the author intended. The Engine checks it against the killing tests of the Spec_Mutants.
- **Claim_Outcome**: One of `held`, `not-held`, `unchecked` or `unknown-criterion`, assigned to a Claim (Requirement 11).
- **Claim_Parser**: The pure Engine functions that read Claims from comment lines and resolve them against the Criteria of the parsed spec.
- **Requirement_Title**: The text after `### Requirement N:` in a `requirements.md` heading, trimmed.
- **Run_Scope**: One of `full` (Baseline_Run, StrykerJS and Spec_Mutants) or `spec-only` (Baseline_Run and Spec_Mutants, no StrykerJS).
- **Comparison_Record**: The earlier HistoryRecord against which a run computes its `newlyKilledIds` (Requirement 8.30).
- **Build_Root**: A top-level entry of the Target_Project (a folder, or a file at the root) that the StrykerJS sandbox keeps: the first path segment of each source glob, of each test glob and of each test file of a Baseline_Test (Requirement 3.22). Every other top-level folder goes into the sandbox exclusions (3.7).
- **Witness_Test_Builder**: The pure function `buildWitnessTest` of `trick-or-test/report` that turns a Witness and its Criterion into the source of one Vitest test (Requirement 12).

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
9. THE Requirements_Parser SHALL provide a function `parseRequirementTitles` that returns, for each `### Requirement N: <title>` heading outside a fenced code block, the number N and the Requirement_Title, in document order. The function SHALL NOT change the value that `parseRequirements` returns, so that the type `Criterion` stays as it is.
10. IF a `requirements.md` file contains the same requirement number in two headings, or a `### Requirement N:` heading with an empty title, THEN `parseRequirementTitles` SHALL return an error that names the file, the number and the line numbers.

### Requirement 3: Mechanical mutants

**User Story:** As a developer, I want StrykerJS to produce mechanical mutants and run my Vitest tests against them, so that I see which small code changes my tests miss.

#### Acceptance Criteria

1. WHEN the CLI runs the mechanical stage, THE Stryker_Adapter SHALL run StrykerJS with the Vitest runner, incremental mode, the JSON reporter and `disableBail` enabled.
2. THE Stryker_Adapter SHALL list the Vitest runner in the Stryker `plugins` option.
3. WHEN the Target_Project resolves TypeScript 7 or newer, THE Stryker_Adapter SHALL set the Stryker `tsconfigFile` option to a path that does not exist.
4. WHEN the Target_Project resolves a TypeScript version older than 7, THE Stryker_Adapter SHALL leave the Stryker `tsconfigFile` option at the Target_Project value.
5. WHEN StrykerJS exits with an error and its captured output shows that the initial test run (the dry run) failed, THE Stryker_Adapter SHALL recognise the failure by a real dry-run-failure line copied from captured StrykerJS output, run StrykerJS exactly one more time with `ignoreStatic` enabled, and record in the Mutation_Report and the Verdict_File that the retry happened.
6. IF StrykerJS exits with an error and no retry applies, or the retry of criterion 5 fails too, THEN THE Engine SHALL report the first ERROR-level line of the output of the last StrykerJS run, or the last non-empty line of that output WHEN it has no ERROR-level line, and write no Verdict_File.
7. THE Stryker_Adapter SHALL detect every top-level folder that is not a Build_Root (criterion 22) and every directory reached through a symbolic link, and SHALL pass the detected directories to the Stryker sandbox exclusion option. A folder that holds a test file of the Baseline_Run is a Build_Root, so the Stryker_Adapter SHALL NOT exclude it.
8. THE Stryker_Adapter SHALL exclude every file under `.stryker-tmp` from the tests that are run and from the tests that are counted.
9. WHERE the user supplies a git ref, THE Stryker_Adapter SHALL restrict the git diff to the Target_Project directory, keep only the changed files that match the source globs, and restrict mutation to the Changed_Ranges since that ref, expressed as `file:start-end` mutate patterns with paths relative to the Target_Project root, including WHEN the Target_Project is a subdirectory of a larger git repository.
10. WHERE the user supplies a git ref and no line changed since that ref in the source files, THE Stryker_Adapter SHALL report zero Mechanical_Mutants without running StrykerJS.
11. THE Species_Classifier SHALL map each Mechanical_Mutant to the species listed for its `mutatorName` in `.kiro/steering/bestiary.md`, using the replacement text where the table requires it.
12. IF the `mutatorName` of a Mechanical_Mutant is not in the species table, THEN THE Species_Classifier SHALL assign the species Unclassified.
13. THE Species_Classifier SHALL return the same species for the same `mutatorName` and replacement on every call.
14. THE Stryker_Adapter SHALL leave the Target_Project working tree unmodified, except for files in the output directory and in `.trickortest/`.
15. IF any Failing_Test occurs in the Baseline_Run, THEN THE Engine SHALL abort the run, report the Failing_Tests and write no Verdict_File.
16. THE Stryker_Adapter SHALL keep in the Mutation_Report the start line, start column, end line and end column that StrykerJS reports for each Mechanical_Mutant.
17. IF StrykerJS fails and its output does not show a failed initial test run (a failure after a successful dry run), THEN THE Stryker_Adapter SHALL NOT run StrykerJS again and SHALL NOT record that the `ignoreStatic` retry happened.
18. THE Stryker_Adapter SHALL run the StrykerJS binary from the `node_modules/.bin` directory of the Target_Project, or with the `--no-install` option, so that the Engine never lets `npx` download a package.
19. WHEN a StrykerJS run ends, THE Stryker_Adapter SHALL remove the temporary directory of StrykerJS, including WHEN the run fails.
20. THE Engine SHALL exclude `.trickortest/**` from the Baseline_Run and SHALL NOT run a StrykerJS sandbox in the Baseline_Run.
21. THE Engine SHALL run every git command, including the diff of criterion 9 and the commit read for the run metadata of Requirement 8.6, with an environment that has none of the variables `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_NAMESPACE`, `GIT_CEILING_DIRECTORIES` and `GIT_DISCOVERY_ACROSS_FILESYSTEM`, so that git locates the repository only from the working directory of the command, including WHEN the Engine runs inside a git hook or in a shell that exports those variables, and SHALL pass every other environment variable to git unchanged.
22. THE Stryker_Adapter SHALL compute the Build_Roots of the Target_Project as the union of the first path segment of each source glob, the first path segment of each test glob, and the first path segment of the project-relative path of every test file of a Baseline_Test, so that every test file that the Baseline_Run ran is present in the StrykerJS sandbox WHEN its folder lies outside the globs (for example a folder `extra/` that the Vitest configuration of the Target_Project includes). A test file at the root of the Target_Project contributes its own file name. THE Stryker_Adapter SHALL compute the Build_Roots by a pure function (`buildRootsOf`) of the globs and the test file paths, and the function SHALL take project-relative globs and project-relative paths. IF the first path segment of any source glob or any test glob holds a wildcard (for example `**/*.test.ts`) or points outside the Target_Project (`..`), THEN `buildRootsOf` SHALL give no answer (it returns `undefined`), the exclusions SHALL NOT be computed, and the Stryker_Adapter SHALL exclude no folder from the StrykerJS sandbox, whether or not the Baseline_Run ran test files. THE answer described above (the union of first path segments, with the file name for a test file at the root) SHALL apply only WHEN the first path segment of every source glob and every test glob is a plain name.
23. WHEN StrykerJS has finished a run of Run_Scope `full`, THE Engine SHALL compare the set of test files of the Baseline_Tests with the set of test files that StrykerJS reports, both as project-relative paths, and SHALL record the test files of the first set that are not in the second as the test files outside the StrykerJS run, sorted by path, together with their count N. THE comparison SHALL be a pure function of the two sets.
24. THE Engine SHALL NOT fail the run, change any Mutant_Status, and add no field to the Verdict_File, the Mutation_Report or the HistoryRecord, because of the files of criterion 23. THE count and the paths of criterion 23 SHALL appear only in the CLI summary (9.23).

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
11. IF the `file` or the `witness.from` of a Spec_Mutant is an absolute path, or contains a `..` segment, THEN THE Spec_Mutant_Loader SHALL return an error that names the mutant file and the field, so that both fields are relative paths inside the Target_Project.
12. IF the `id` of a Spec_Mutant contains a path separator or the sequence `..`, or contains a character outside letters, digits, `.`, `_` and `-`, THEN THE Spec_Mutant_Loader SHALL return an error that names the mutant file and the field `id`.

### Requirement 5: Spec mutant execution

**User Story:** As a developer, I want each spec mutant applied in a sandbox, proven to change behaviour, and tested, so that a surviving spec mutant means a promise in the spec is not guarded.

#### Acceptance Criteria

1. WHEN a Spec_Mutant is run, THE Spec_Mutant_Runner SHALL apply the mutation in a Sandbox copy of the Target_Project and leave the Target_Project working tree unchanged, including when the run of the Spec_Mutant fails, times out or crashes.
2. IF `original` does not appear exactly once in `file`, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to NotApplicable.
3. WHEN the mutation is applied, THE Spec_Mutant_Runner SHALL type-check the Sandbox, and IF the type-check reports an error, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to CompileError.
4. THE Spec_Mutant_Runner SHALL run each Witness through the Vitest of the Target_Project so that TypeScript and extensionless imports resolve as in the tests of the Target_Project.
5. THE Spec_Mutant_Runner SHALL read the outcome of each Witness from a file written by the Witness, not from console output.
6. IF the original code does not return the `expected` value, or does not throw an error of the class `expectedError`, for the Witness input, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to InvalidWitness and write into the Verdict_File both the expected outcome and the outcome that the original code produced.
7. IF the mutated code gives the same outcome as the original code for the Witness input, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to Ghost.
8. WHEN the Witness shows a difference between the original code and the mutated code, including WHEN the Witness times out on the mutated code, THE Spec_Mutant_Runner SHALL run the test suite of the Target_Project in the Sandbox.
9. IF at least one Failing_Test occurs in the Sandbox, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to Killed.
10. IF every test passes in the Sandbox, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to Survived.
11. IF the test suite run in the Sandbox exceeds the suite time limit, THEN THE Spec_Mutant_Runner SHALL set the Mutant_Status to Timeout.
12. THE Spec_Mutant_Runner SHALL compare Witness values by deep structural equality of their JSON form.
13. THE Spec_Mutant_Runner SHALL remove each Sandbox after the Spec_Mutant is run, including when the run fails, times out or crashes.
14. THE Spec_Mutant_Runner SHALL produce the same Mutant_Status for the same Target_Project and Spec_Mutant on every run.
15. THE Spec_Mutant_Runner SHALL set the suite time limit for a Spec_Mutant to the duration of the Baseline_Run multiplied by 1.5, plus 5 seconds, and WHERE `timeoutMs` is set in the configuration, THE Spec_Mutant_Runner SHALL set the suite time limit to `timeoutMs` instead.
16. WHEN the Witness times out on the mutated code, THE Spec_Mutant_Runner SHALL treat the outcome of the mutated code as different from the outcome of the original code, and SHALL NOT set the Mutant_Status to Timeout or Killed because of the Witness timeout alone.
17. THE Spec_Mutant_Runner SHALL verify, before writing any file in a Sandbox, that the resolved path of the file stays inside the Sandbox.
18. IF a symbolic link in the Target_Project points outside the Target_Project, THEN THE Spec_Mutant_Runner SHALL NOT copy the link into the Sandbox as a link that points outside the Sandbox.
19. WHEN the Spec_Mutant_Runner copies the Target_Project into a Sandbox, THE Spec_Mutant_Runner SHALL exclude the output directory by its path relative to the Target_Project root and SHALL NOT exclude a directory of the same name at another depth, so that `src/reports/` is copied WHEN the output directory is `reports`.
20. WHEN the Engine starts a run, THE Engine SHALL remove every leftover Sandbox under `.trickortest/sandboxes`.
21. THE Spec_Mutant_Runner SHALL exclude `.trickortest/**` and every generated Witness file from every test suite run of a Spec_Mutant, so that the Witness files never run as tests of the suite.

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
11. WHEN a run completes, THE Reporter SHALL write into the Verdict_File the field `baselineTests`: one entry for each Baseline_Test, with its id in the format `<file>::<full name>` (the format of the killing tests of 6.1 and 6.2) and its kind, `property` or `example`, assigned by 6.3 to 6.5. A test that the Baseline_Run skipped or marked as todo is not a Baseline_Test.
12. THE number of entries of `baselineTests` SHALL equal the number of tests that the Baseline_Run ran and that passed, so that a reader takes the number of passing tests from the length of the list. THE Reporter SHALL write the entries in a stable order, sorted by id and then by start line, and SHALL write one entry for each test even WHEN two tests have the same id.
13. EVERY killing test of every mutant in the Verdict_File SHALL be a Baseline_Test, except a file-level Failing_Test, whose id is the file path.
14. WHEN the Engine records a killing test of a Mechanical_Mutant, THE Engine SHALL match the StrykerJS killing test to its Baseline_Test on data that the StrykerJS report and the Baseline_Run share (the test file plus the start line, or the list of titles `ancestorTitles` plus `title` from which both spellings of the name are built), and SHALL use the id of the matched Baseline_Test as the id of the killing test. THE Engine SHALL NOT make the match by rewriting the name of the test (for example by replacing ` > ` with a space), because a title may contain ` > `. THE match SHALL NOT change the Kill_Class of any Mechanical_Mutant.
15. IF a StrykerJS killing test has no Baseline_Test (for example because the Baseline_Run skipped the test), THEN THE Engine SHALL keep the StrykerJS name as the id of the killing test, SHALL count each such case in the run, and SHALL report the count, so that a killing test outside `baselineTests` cannot pass in silence. THE end-to-end test of 10.15 SHALL fail WHEN that count is greater than zero. THE Verdict_File SHALL hold that count in the optional field `unmatchedKillingTests`.
16. THE Engine SHALL choose the spelling in which it matches the name of a StrykerJS killing test (6.14) by the installed Vitest version of the Target_Project, by the same rule as the Vitest runner of StrykerJS 10.1.1: WHEN the major version is 5 or later (a prerelease of 5.0.0 included), the titles of a test are joined with ` > `, and WHEN the major version is earlier than 5, the titles are joined with one space. IF the installed Vitest version cannot be read, THEN THE Engine SHALL use the spelling ` > `. The rule SHALL need only the major version number and SHALL add no dependency. The function `indexBaselineTests` SHALL keep ` > ` as its default spelling, so that its committed tests and Property 36 do not change.
17. THE Engine SHALL build the match key of a Baseline_Test from its joined titles with leading and trailing whitespace removed, as StrykerJS removes it from the name of a killing test, so that a test whose title starts or ends with a space (or whose title is empty inside a `describe`) matches its killing test. THE id of the Baseline_Test SHALL NOT change: it stays built from the untrimmed titles, as Vitest builds its `fullName`.

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
6. THE Reporter SHALL include in the run metadata the git commit, the seed, and the versions of the Engine, Node.js, StrykerJS, Vitest and TypeScript. The seed is the own seed of the Engine. The Engine uses no random source today, so the value is always 0. It is not the seed of the property tests of the Target_Project.
7. THE Reporter SHALL use the `id` from the mutant file as the id of each Spec_Mutant, and SHALL build the id of each Mechanical_Mutant as a hash of the file, the original text, the replacement and the Occurrence_Index, with no timestamp in the hash and no line number in the hash, so that the id stays stable when unrelated lines move and two Mechanical_Mutants with the same file, original text and replacement at different locations receive different ids.
8. WHEN a run completes, THE Reporter SHALL append exactly one line containing one HistoryRecord to `history.jsonl` and leave all earlier lines unchanged.
9. THE Reporter SHALL write each HistoryRecord as a single-line JSON object with the data to draw the hunt timeline and to identify the run: the time, the git commit, the seed (the own seed of the Engine, always 0 today, not the seed of the property tests of the Target_Project), the configuration, the ids and Mutant_Status of the mutants, the count of mutants per Mutant_Status, the count of Criteria per Coverage_Status, and the ids of the mutants killed in this run that the previous record did not list as killed. The HistoryRecord does not hold the seed that the Target_Project fixes in its own test setup, so it does not suffice to repeat the property tests of the Target_Project.
10. THE Reporter SHALL validate the Verdict_File and every history record with a zod schema before the file is written.
11. IF the output directory cannot be written, THEN THE Reporter SHALL return an error that names the path.
12. FOR ALL valid Verdict_File values, writing then reading then writing SHALL produce identical file content (round-trip property).
13. THE Reporter SHALL produce byte-identical Mutation_Report and Verdict_File content for two runs with the same inputs, except for the run metadata fields that record time.
14. THE Reporter SHALL assign the species Oathbreaker to every Spec_Mutant.
15. WHEN a Spec_Mutant and a Mechanical_Mutant make the same change (same file, same span, same replacement, compared without regard to mutant ids), THE Reporter SHALL include one mutant in the Mutation_Report: the Spec_Mutant, tied to its Criterion.
16. FOR ALL sequences of HistoryRecord values, appending each record to `history.jsonl` then reading the file line by line SHALL return the same records in the same order, with each line parsed as one complete JSON object (round-trip property).
17. THE Reporter SHALL write the configuration in each HistoryRecord as the configuration is written, with every path relative to the Target_Project root, and SHALL NOT write an absolute path in any field of the Mutation_Report, the Verdict_File or the History_File, including mutant descriptions, error text, NotApplicable read errors and NoOutcome messages, so that the files do not depend on the machine that produced them. Absolute paths exist only at run time.
18. THE Reporter SHALL write in each coverage entry of the Verdict_File the full text of its Criterion, as the Requirements_Parser returned it from `requirements.md`, with leading and trailing whitespace trimmed and with every absolute path in it scrubbed as every other free-text field is (8.17), so that a viewer can show the promise without reading the spec.
19. WHEN the Witness of a Spec_Mutant ran against the mutated code, THE Reporter SHALL record in the Verdict_File, next to the Witness of that Spec_Mutant, the outcome of that run as a WitnessOutcome (a value, an error class, a timeout or no-outcome), scrubbed of absolute paths (8.17). WHEN the Witness of a Spec_Mutant never ran against the mutated code, THE Reporter SHALL write no such outcome field for that Spec_Mutant.
20. THE Verdict_File schema exported from `trick-or-test/report` SHALL treat the criterion text of 8.18 and the mutated outcome of 8.19 as optional fields, so that a Verdict_File written before these fields existed still parses, and SHALL keep rejecting every unknown field.
21. THE Reporter SHALL list the same set of mutant ids in the Verdict_File (`mutants`), the Mutation_Report and the HistoryRecord (`mutants`) of one run. The Reporter SHALL drop each Twin from the Verdict_File and from the HistoryRecord as 8.15 drops it from the Mutation_Report, so that no output file names an id that another output file lacks.
22. THE Reporter SHALL write into the Verdict_File the field `mutantCounts` with the count of mutants per kind (`spec`, `mechanical`) and per Mutant_Status over the mutants listed by 8.21, and the field `twinsMerged` with the number of Twins dropped. FOR ALL runs, the sum of the counts of each kind SHALL equal the number of mutants of that kind in `mutants`. WHERE the Run_Scope is `spec-only`, THE Reporter SHALL write no `mechanical` counts.
23. THE Reporter SHALL write into the Verdict_File the field `strykerCounts` with three integers counted over every Mechanical_Mutant that StrykerJS produced, before 8.15 removes the Twins: `detected` (the Mutant_Status Killed plus Timeout), `undetected` (Survived) and `total` (every Mechanical_Mutant that StrykerJS produced, whatever its Mutant_Status). WHERE the Run_Scope is `spec-only`, THE Reporter SHALL write no `strykerCounts`.
24. THE names `mutantCounts` and `strykerCounts` SHALL stay distinct, and the schema documentation SHALL state that `strykerCounts.total` counts the Mechanical_Mutants that StrykerJS produced, Twins included, and is not the number of mutants listed in the files. THE documentation SHALL state that a plain StrykerJS mutation score has the denominator `detected + undetected`, not `total`.
25. THE Reporter SHALL include in the run metadata of the Verdict_File the field `specName`, the name of the attacked spec.
26. THE Reporter SHALL write into the Verdict_File the field `requirements`: one entry `{ requirement, title }` for each Requirement_Title that `parseRequirementTitles` returned, in document order, each title trimmed and scrubbed as every other free-text field is (8.17).
27. THE Reporter SHALL write in each HistoryRecord the field `coverageByCriterion`: the Coverage_Status of every Criterion of the parsed spec, in document order, so that one record holds one row of seals.
28. THE Reporter SHALL record the Run_Scope in the run metadata of the Verdict_File (`scope`), in each HistoryRecord (`scope`) and in the `config` object of the Mutation_Report (`scope`). A file or record in which the field is absent was written by a full run.
29. THE schemas exported from `trick-or-test/report` SHALL treat every field added by criteria 6.11, 8.21 to 8.28 and Requirement 11 (`baselineTests`, `claims`, `claimCounts`, `unmatchedKillingTests`, `mutantCounts`, `twinsMerged`, `strykerCounts`, `specName`, `requirements`, `coverageByCriterion` and `scope`) as optional, so that a Verdict_File or HistoryRecord written before these fields existed still parses, and SHALL keep rejecting every unknown field.
30. WHEN the Reporter builds a HistoryRecord, THE Reporter SHALL compute `newlyKilledIds` against the Comparison_Record, chosen as follows. For a run of Run_Scope `full`, the Comparison_Record is the most recent earlier HistoryRecord of scope `full`, and no record when there is none. For a run of Run_Scope `spec-only`, the Comparison_Record is the most recent earlier HistoryRecord of any scope, and only the ids of Spec_Mutants are compared, on both sides. The rule of 8.9 (killed in this run, not listed as killed in the Comparison_Record) otherwise stays as it is, so for two runs of the same scope the result does not change. The choice SHALL be made by a pure function that takes the earlier records as data.
31. THE new fields of 8.21 to 8.28, 6.11 and Requirement 11 SHALL follow 8.13 (byte-identical output for equal inputs) and 8.17 (no absolute path in any field).

### Requirement 9: Command-line interface

**User Story:** As a developer, I want two commands, so that I can attack my project and regenerate committed evidence.

#### Acceptance Criteria

1. WHEN the user runs `trick-or-test run`, THE CLI SHALL load the configuration, parse the spec, run the Mechanical_Mutants, run the Spec_Mutants, and write the Mutation_Report, the Verdict_File and a History_File record.
2. WHEN the user runs `trick-or-test measure`, THE CLI SHALL perform the actions of `run` and write the results into the output directory given for the command so that the files can be committed under `reports/`.
3. WHERE the user passes the option `--since <git-ref>`, THE CLI SHALL restrict Mechanical_Mutants to the Changed_Ranges since that ref.
4. WHERE the user passes the option `--project <path>`, THE CLI SHALL use that path as the Target_Project root, and otherwise THE CLI SHALL use the current working directory.
5. WHERE the user passes the option `--spec <name>`, THE CLI SHALL attack only that spec, and WHERE the option is absent and the Target_Project has exactly one spec directory with a `requirements.md` file, THE CLI SHALL attack that spec.
6. WHEN a command finishes, THE CLI SHALL print a summary with the number of surviving Spec_Mutants, the count of Criteria per Coverage_Status, the number of strays, and the paths of the files written.
7. WHEN a command finishes without an internal error, THE CLI SHALL exit with code 0, including when Spec_Mutants survive.
8. THE CLI SHALL define no option that changes the exit code according to the number of surviving Spec_Mutants.
9. IF a command ends with a configuration, parsing, Baseline_Run, StrykerJS or runtime error, THEN THE CLI SHALL print the error message to stderr and exit with code 1.
10. IF the user passes an unknown command or option, THEN THE CLI SHALL print the usage text to stderr and exit with code 1.
11. THE CLI SHALL make no network request to an LLM service and require no API key.
12. THE Engine repository SHALL define at its root the npm script `measure`, which runs the built CLI as `trick-or-test measure --project examples/pricing --spec cart-pricing` with the output directory `reports`.
13. WHEN the npm script `measure` finishes, THE CLI SHALL have written the Mutation_Report, `verdict.json` and `history.jsonl` into `reports/`.
14. THE Engine repository SHALL generate the files in `reports/` only through the `measure` command, and no person SHALL edit them by hand.
15. WHEN the CLI receives SIGINT or SIGTERM, THE CLI SHALL stop its child processes (Vitest and StrykerJS), remove its Sandboxes, and exit with code 130 for SIGINT and code 143 for SIGTERM.
16. IF the Target_Project has more than one spec directory with a `requirements.md` file and the user does not pass the option `--spec`, THEN THE CLI SHALL print to stderr an error that lists the names of those spec directories and asks for `--spec <name>`, and exit with code 1.
17. WHERE the user passes the option `--scope <full|spec-only>` to `run` or `measure`, THE CLI SHALL use that Run_Scope, and WHERE the option is absent THE CLI SHALL use `full`.
18. Criterion 9.1 describes the scope `full`. WHEN the Run_Scope is `spec-only`, THE CLI SHALL run the Baseline_Run and then the Spec_Mutants, SHALL NOT run StrykerJS and SHALL NOT run git, and SHALL write the Mutation_Report, the Verdict_File and one HistoryRecord that record the scope (8.28). The Mutation_Report of such a run holds Spec_Mutants only. The Verdict_File of such a run holds no stray, no `strykerCounts` and no `mechanical` counts.
19. IF the user passes `--scope spec-only` together with `--since`, THEN THE CLI SHALL print to stderr an error that names both options and exit with code 1, because `--since` restricts Mechanical_Mutants and a spec-only run has none.
20. IF the value of `--scope` is not `full` or `spec-only`, THEN THE CLI SHALL print the usage text to stderr and exit with code 1.
21. WHEN a command with the Run_Scope `spec-only` finishes, THE CLI SHALL print the scope in its summary, SHALL state that strays were not run, and SHALL print no stray count and no StrykerJS figure, so that no reader takes the run for a full run.
22. THE npm script `measure` and the npm script `demo` SHALL NOT pass `--scope`, so that every file in `reports/` and in `apps/viewer/public/demo/` comes from a full run.
23. WHEN a command with the Run_Scope `full` finishes and StrykerJS ran (criterion 25), THE CLI SHALL print in its summary exactly one line `test files outside the StrykerJS run: N`, with N the count of 3.23, and WHEN N is greater than zero THE CLI SHALL print after that line the project-relative paths of those test files, one per line, in sorted order. WHEN the Run_Scope is `spec-only`, THE CLI SHALL print no such line. THE CLI SHALL exit with code 0 WHEN N is greater than zero, unless another criterion of this requirement demands another code.
24. WHEN the Run_Scope is `spec-only`, THE CLI SHALL NOT print the text `test files outside the StrykerJS run`, and a test that guards this SHALL fail WHEN the spec-only guard in the CLI is removed.
25. IF a run of Run_Scope `full` did not start StrykerJS (for example WHEN `--since` finds no changed source line, criterion 3.10), THEN THE CLI SHALL NOT print the line `test files outside the StrykerJS run: N`, because a count of 0 would read as a confirmation that StrykerJS saw every test file. The comparison of 3.23 SHALL apply only WHEN StrykerJS ran.
26. THE CLI SHALL resolve the Target_Project root to its real path (all symbolic links resolved) once, before any stage uses it, so that every path that the Engine compares or writes is relative to that real root, including WHEN `--project` names a symbolic link or WHEN the platform places the project under a link (for example `/tmp` on macOS). A Target_Project reached through a symbolic link SHALL give the same `baselineTests` ids, the same killing-test ids and the same Claim counts as the same Target_Project reached through its real path.
27. IF the real path of the Target_Project root cannot be read, THEN THE CLI SHALL print to stderr an error that names the path given and exit with code 1, and run no stage.

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
11. THE end-to-end test SHALL check that `git status` of `examples/pricing` shows no change outside `.trickortest/`, that the written reports contain no absolute path, and that the StrykerJS temporary directory does not grow between two runs.
12. THE Engine SHALL test the Stryker_Adapter against fixtures that are real StrykerJS 10.1.1 output captured from a run.
13. THE Engine SHALL test the Spec_Mutant_Runner and the InvalidWitness handling by reading the written Verdict_File, not an in-memory value.
14. THE example project `examples/pricing` SHALL give each Criterion of the spec `cart-pricing` either at least one Spec_Mutant that has a Witness, or a Skip_File entry with a reason, so that no Criterion of the committed example is unattacked without an explanation. THE committed example SHALL hold 25 Spec_Mutants and a Skip_File (`skipped.json`) with 11 entries. The Skip_File is not a Spec_Mutant, and its entries are not counted as Spec_Mutants.
15. THE end-to-end test SHALL check on the files that the CLI wrote: that the Verdict_File, the Mutation_Report and the HistoryRecord list the same set of mutant ids (8.21), that `mutantCounts` and `strykerCounts` agree with the other files (8.22, 8.23), that the length of `baselineTests` equals the number of tests that Vitest ran in the Baseline_Run (6.12), and that the Claim counts agree with `claims` (11.12), and that every killing test of every mutant is a Baseline_Test (6.13), so that the test fails WHEN the count of 6.15 is greater than zero.
16. THE steering files `.kiro/steering/mutant-patches.md` and `.kiro/steering/product.md` SHALL be updated by a task of this spec, not by an amendment of this document. Under "Never", `mutant-patches.md` SHALL say that a criterion no exported function can show is recorded in the Skip_File (`<mutants dir>/<spec name>/skipped.json`) with a reason for each entry, SHALL show the shape of one entry (`{ "requirement": "<criterion id>", "reason": "<text>" }`, as 4.7 parses it), and SHALL keep the rule that the reason is never empty (4.8). The vocabulary table of `product.md` SHALL gain the term `skipped`: a criterion that no exported function can show, set aside with a written reason.

### Requirement 11: Claims

**User Story:** As a developer, I want to know what each test says it checks and whether the Spec_Mutants confirm it, so that I see which statements in my tests hold and which do not.

#### Acceptance Criteria

1. THE Claim_Parser SHALL read the Claims of a test from the comment lines directly above the line on which the test call starts (the start line that the Baseline_Run reports). The comment lines directly above are the unbroken run of comment lines (`//` lines and the lines of a `/* ... */` block) that ends on the line before the start line. A blank line or a line of code ends the run.
2. WHEN the comment lines contain a line `Feature: <name>` (leading `//`, `*` and `**` markers ignored), THE Claim_Parser SHALL take `<name>` as the text up to the first comma or the end of the line. IF `<name>` is not the name of the attacked spec, THEN THE Claim_Parser SHALL return no Claim for that run of comment lines.
3. WHEN the comment lines contain a line `Validates: Requirements <ids>` or `Validates: Requirement <ids>` (the word `Validates:` followed by `Requirement` or `Requirements`, case-insensitive, with leading `//`, `*` and `**` markers ignored and a trailing `**` ignored), THE Claim_Parser SHALL read `<ids>` as a list of ids separated by commas, spaces or the word `and`. An id is `N.M` (one Criterion) or `N` (one whole requirement). An id `N.M` that is followed directly by one or more of the marks `.`, `;`, `:`, `)` or `]` counts as that id, and the list ends after it, so `7.3, 7.4.` gives 7.3 and 7.4, and `(Requirements 5.1, 5.2)` gives 5.1 and 5.2. A whole requirement `N` followed by a mark is not an id and ends the list, because `5.` may be a criterion id that was cut short and the parser does not guess, so `Requirements 2.1, 5.` gives 2.1 only. A token such as `7.4.1` or `7.4x` is not an id. Otherwise the list ends at the first token that is neither an id nor a separator.
4. WHEN an id is a whole requirement `N` and the parsed spec has a Requirement N, THE Claim_Parser SHALL produce one Claim for each Criterion of Requirement N, so that `Requirements 5` means every Criterion `5.k`.
5. WHEN an id is not the id of a Criterion of the parsed spec, and is not a requirement number of the parsed spec, THE Claim_Parser SHALL produce one Claim with that id as written and the Claim_Outcome `unknown-criterion`.
6. WHEN the same Criterion is named twice for one test, directly or through a whole requirement, THE Claim_Parser SHALL produce one Claim for it.
7. WHEN other comment lines stand between a `Feature:` or `Validates:` line and the test call, THE Claim_Parser SHALL still read the Claims, because the run of comment lines of 11.1 is read as a whole and lines that are neither `Feature:` nor `Validates:` are ignored.
8. WHEN a comment stands above a `describe` block, THE Claim_Parser SHALL NOT give its Claims to the tests inside the block, because each test reads only the comment lines directly above its own start line.
9. WHEN a test is declared with `it.each` or `test.each` (or a `describe.each` form that generates tests, or any other call that Vitest reports at one start line), THE Claim_Parser SHALL give the Claims of the comment lines above that line to every test that the call generates.
10. WHEN the comment lines have a `Validates:` line and no `Feature:` line, THE Claim_Parser SHALL count the Claims for the attacked spec.
11. THE Engine SHALL assign each Claim exactly one Claim_Outcome, from the Spec_Mutants that are valid by 7.6:
   - `held`: the Criterion has at least one valid Spec_Mutant and the test is among the killing tests of every valid Spec_Mutant of the Criterion;
   - `not-held`: the Criterion has at least one valid Spec_Mutant and the test is not among the killing tests of at least one of them. The Claim also records `otherTestsKilledAll`: `true` WHEN every valid Spec_Mutant of the Criterion has the Mutant_Status Killed with at least one killing test other than this test, or Timeout; otherwise `false`;
   - `unchecked`: the Criterion has no valid Spec_Mutant (it is unattacked or skipped, or all its Spec_Mutants are Ghost, InvalidWitness, CompileError or NotApplicable);
   - `unknown-criterion`: the id is not in the parsed spec (11.5).
12. THE Reporter SHALL write the Claims of each test into the entry of that test in `baselineTests` (6.11), each Claim as `{ criterion, outcome }` and, for `not-held`, with `otherTestsKilledAll`, and SHALL write no `claims` key for a test with no Claim. THE Reporter SHALL write the field `claimCounts` with the number of Claims in total and per Claim_Outcome (`held`, `notHeld`, `unchecked`, `unknownCriterion`), and for the `not-held` Claims the number with `otherTestsKilledAll` true and the number with it false. FOR ALL runs, the counts per outcome SHALL sum to the total.
13. THE Claim_Parser SHALL be a pure function of the text of the comment lines, the attacked spec name and the Criteria. It SHALL read no file, and the Engine SHALL give a property test to it (design.md, Properties 27 and 28).
14. WHEN the Engine cannot read a test file, THE Engine SHALL record no Claim for the tests of that file and SHALL NOT fail the run.
15. THE Engine SHALL give the same Claims and the same Claim_Outcomes in a run of Run_Scope `spec-only` as in a run of Run_Scope `full`, because they depend on the Baseline_Run and the Spec_Mutants only.
16. FOR the committed example (`examples/pricing`, the spec `cart-pricing`, the 24 Spec_Mutants that are committed before task 21 of `tasks.md`), THE Engine SHALL record 25 Claims: 16 `held`, 7 `not-held`, 2 `unchecked` (2.2 and 3.4) and 0 `unknown-criterion`. The 7 `not-held` Claims are 2.1 of Property 1, 5.1 and 5.5 of Property 6, 6.2 and 6.3 of Property 7, and 5.5 and 7.4 of Property 9. Six of them have `otherTestsKilledAll` true. The Claim 7.4 of Property 9 has it false, because the Spec_Mutant of 7.4 survives. An example test SHALL assert these numbers on a captured copy of the mutant results of that run (a fixture with recorded provenance) together with the real test files of `examples/pricing/test/`, so that the test does not change when task 21 adds Spec_Mutants. IF task 21 adds Spec_Mutants, THEN the numbers of the regenerated `reports/verdict.json` change, and task 22 checks the new numbers in a new test file. After group 21 the committed example holds 25 Spec_Mutants and the Engine SHALL record 25 Claims: 17 `held`, 7 `not-held`, 1 `unchecked` and 0 `unknown-criterion`. The numbers of the first sentence of this criterion are the numbers before task 21. Claim_Outcomes use the killing tests of Spec_Mutants only, so the match of 6.14 does not change them.
17. EVERY user-facing string that the Engine writes about a Claim (CLI summary, messages, schema descriptions) SHALL say that a Claim "held" or "did not hold", and SHALL NOT use the words "false", "fake" or "lying". The values of `outcome` are `held`, `not-held`, `unchecked` and `unknown-criterion`.

### Requirement 12: Test source for a Witness

**User Story:** As an agent that hunts a surviving Spec_Mutant, I want the source of one test that would catch it, so that I start from a correct test instead of writing one from scratch.

#### Acceptance Criteria

1. THE Engine SHALL export from `trick-or-test/report` a pure function `buildWitnessTest` that takes a Witness, a Criterion id and the project-relative path of a test file, and returns the source text of one Vitest test, or an error.
2. THE returned source SHALL import the Witness `export` from the module `witness.from`, with an import path relative to the directory of the given test file (a path that starts with `./` or `../`, without the `.ts` or `.tsx` extension, as the tests of the Target_Project import).
3. THE returned source SHALL call the export with the Witness `args`, and WHEN the Witness has `expected` SHALL assert the call with `toEqual` and the Witness value, and WHEN the Witness has `expectedError` SHALL import the error class of that name from the same module and assert with `toThrow` and that class.
4. THE name of the test SHALL start with the Criterion id, followed by a space.
5. IF the export name or the error class name is not a valid identifier, or `witness.from` or the test file path is absolute or contains a `..` segment that leaves the project, THEN `buildWitnessTest` SHALL return an error that names the field, and no source.
6. THE function SHALL be deterministic: equal inputs give equal output. THE source SHALL contain the export name and the Criterion id. THE source SHALL print the Witness `args` and the Witness `expected` value as JSON text placed directly in the source, as a JavaScript expression, with no `JSON.parse` call, so that a reader sees the input as it is. The printed text SHALL be exactly `JSON.stringify(value, null, 2)` with every line after the first indented by the two spaces of the body of the test, with the keys in the order of the Witness object, so that a reader or a program can cut the text out between the fixed markers of the format (`const args = ` and ` as unknown as Parameters<typeof <export>>;` for the arguments, `const expected: unknown = ` and `;` for the expected value), remove that indent and `JSON.parse` it back to the Witness value. The arguments SHALL be cast through `unknown` to `Parameters<typeof <export>>`, so that the test compiles in a strict TypeScript project whatever the Witness holds. The one case in which JSON text read as a JavaScript literal differs from the JSON value is an object key `"__proto__"` (a literal sets the prototype instead of an own property). WHEN `args` holds that key at any depth, THE source SHALL print `args` in the form `JSON.parse("<JSON.stringify(args) as a string literal>")`, and WHEN `expected` holds that key at any depth, THE source SHALL print `expected` in that form; the other value keeps the plain form. In the `JSON.parse` form the text parses back with `JSON.parse` applied twice.
7. THE function SHALL read no file, write no file, import nothing from `node:` and make no call to an LLM service (ADR 0004).
