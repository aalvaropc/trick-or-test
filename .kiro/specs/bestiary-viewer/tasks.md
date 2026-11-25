# Implementation Plan: Bestiary Viewer

## Overview

The plan builds `apps/viewer` in four phases: workspace setup, pure modules (loader, bestiary, plain view, router), React components and screens, then the build for GitHub Pages. Every task is required. Each module task carries its example tests, and each property test sits in the task right after the module it checks. Each phase ends with a checkpoint that runs `npm run check` from the repository root.

Conventions for every task:

- Create and edit files with the file editing tools only, never through shell commands.
- The viewer workspace is named `trick-or-test-viewer`. Run its tests with `npm test -w trick-or-test-viewer -- <path>`. The script builds the engine first, then runs `vitest run <path>`.
- Test names start with the acceptance criterion id, for example `it("1.7 invalid JSON names the file", ...)`. Property tests live in `*.property.test.ts` files, start with the header comment `// Feature: bestiary-viewer, Property V<n>: <title>`, and use one `fc.assert(fc.property(...))`.
- Tests mirror `src/` under `apps/viewer/test/`. Hand-written test data goes under `apps/viewer/test/fixtures/`. Never write `apps/viewer/public/demo/` by hand.
- The viewer imports from the engine only `trick-or-test/report`, never a `node:` module, and never a number from `.trickortest/design/project/`.

## Tasks

- [x] 1. Workspace setup
  - [x] 1.1 Create the workspace package and install pinned dependencies
    - Create `apps/viewer/package.json` named `trick-or-test-viewer` (`private`, `type: module`), covered by the root `apps/*` workspace glob. Run `npm install` so `package-lock.json` updates.
    - Pin every entry to an exact version (no `^`, `~` or range). Publish dates below come from `npm view <pkg> time` on 2026-11-25. Every date is at least 14 days before 2026-11-25, so every version is old enough. Re-run `npm view <pkg> time` when adding each package, and if a version no longer qualifies or a peer conflict appears, take the newest older version that qualifies and update the list here.
    - `dependencies`:
      - `react` 19.3.1, published 2026-10-14
      - `react-dom` 19.3.1, published 2026-10-14
      - `@fontsource/im-fell-english` 5.3.0, published 2026-07-19
      - `@fontsource/jetbrains-mono` 5.3.0, published 2026-07-19
      - `trick-or-test` 0.0.0 (workspace package, exact version, no registry date)
    - `devDependencies`:
      - `vite` 8.3.7, published 2026-11-09 (8.3.8 is dated 2026-11-11 and sits on the 14-day boundary, so it is not used)
      - `@vitejs/plugin-react` 6.3.0, published 2026-11-09
      - `@types/react` 19.3.0, published 2026-09-09 (19.3.1 to 19.3.3 are dated 2026-11-24 and 2026-11-25)
      - `@types/react-dom` 19.3.0, published 2026-09-09
      - `jsdom` 30.1.3, published 2026-10-15 (31.0.1 is dated 2026-11-13)
      - `@testing-library/react` 16.3.3, published 2026-08-27
      - `@testing-library/dom` 10.4.2, published 2026-09-13
      - `@testing-library/user-event` 14.6.8, published 2026-10-13 (later 14.6.x versions are dated 2026-11-10 or later)
      - `fast-check` 4.10.2, published 2026-09-19 (the version the engine uses)
      - `typescript` 7.0.2, published 2026-07-08
      - `vitest` 5.1.0, published 2026-11-02
    - Add no UI kit, CSS framework or chart library.
    - Commit-body rule: the commit that adds these dependencies states the reason for each one in its body (`AGENTS.md`, `tech.md`). Suggested reasons: react and react-dom render the screens; the two `@fontsource` packages bundle IM Fell English and JetBrains Mono from our own origin with their OFL licence texts; vite and `@vitejs/plugin-react` build and serve the app; the `@types/*` packages type React; jsdom and the testing-library packages run component tests; fast-check runs property tests; typescript and vitest match the engine's versions; `trick-or-test` provides the report schemas through `trick-or-test/report`. `tech.md` asks for confirmation before a new viewer runtime dependency. The approved design (Fonts section) is that confirmation for the two `@fontsource` packages, and react and react-dom come from the Viewer stack line in `tech.md`.
    - _Requirements: 12.1, 12.4, 12.5, 12.16_
    - _Validation: `npm ls -w trick-or-test-viewer` passes_

  - [x] 1.2 Add the TypeScript project, Vite config and entry stub
    - Create `apps/viewer/tsconfig.json` extending `../../tsconfig.base.json` with `strict`, `jsx: react-jsx`, `lib: ["es2024", "dom", "dom.iterable"]`, `module: esnext`, `moduleResolution: bundler`, `noEmit`, `types: ["vite/client"]`, and `include` of `src`, `test`, `vite.config.ts` and `vitest.config.ts`. Resolve `trick-or-test/report` through the engine package export and its built `dist/`, not through a source alias.
    - Add a `typecheck` script that runs `tsc --noEmit -p tsconfig.json`. The root `typecheck` runs `tsc -b` first (building the engine) and then every workspace `typecheck`. Add a root project reference only if `tsc -b` accepts it with the viewer's `noEmit` setting. Otherwise rely on that order and report it.
    - Create `apps/viewer/vite.config.ts` with `base: "/trick-or-test/"` and the React plugin. Create `apps/viewer/index.html` with one `#root` element and no external `<link>` or `<script>`.
    - Create `src/main.tsx` that mounts a minimal placeholder component, and create the empty source folders `src/{screens,bestiary,loader,plain-view,router,hunt,app,fonts}/` through the files added in later tasks. Do not create `public/fonts/`.
    - _Requirements: 12.1, 12.3, 12.7_
    - _Validation: `npm run typecheck` passes_

  - [x] 1.3 Add the Vitest project and the shared fast-check configuration
    - Create `apps/viewer/vitest.config.ts` with `test.name: "viewer"`, `environment: "jsdom"`, `setupFiles: ["test/setup.ts"]`, `include: ["test/**/*.test.{ts,tsx}"]`, and exclude `test/fixtures/**`.
    - Create `apps/viewer/test/setup.ts` calling `fc.configureGlobal({ seed: 20261116, numRuns: 100 })` once (the same constants as `packages/engine/test/setup.ts`). No test passes its own seed to `fc.assert`.
    - Add a `test` script with `vitest run` (the engine-first prefix is added in 1.4).
    - Add `apps/viewer/test/setup.test.ts` that asserts `fc.readConfigureGlobal()` returns the fixed `seed` and `numRuns`.
    - _Requirements: 12.6, 12.10_
    - _Validation: `npm test -w trick-or-test-viewer -- test/setup.test.ts` passes_

  - [x] 1.4 Add the engine-first scripts and the package checks
    - In `apps/viewer/package.json`, set `dev` to `npm run build -w trick-or-test && vite`, `build` to `npm run build -w trick-or-test && tsc --noEmit && vite build`, `preview` to `npm run build -w trick-or-test && vite preview`, and `test` to `npm run build -w trick-or-test && vitest run`.
    - Add `apps/viewer/test/package.test.ts` with these checks:
      - 12.15: each of `dev`, `build`, `preview` and `test` starts with `npm run build -w trick-or-test`.
      - 12.4: every dependency version is an exact `x.y.z` version.
      - 12.1: no UI kit, CSS framework or chart library is listed.
      - 12.16: both `@fontsource` packages are listed, and `apps/viewer/public/fonts/` does not exist.
    - _Requirements: 12.1, 12.4, 12.15, 12.16_
    - _Validation: `npm test -w trick-or-test-viewer -- test/package.test.ts` passes_

  - [x] 1.5 Add the viewer rows to the commands table in tech.md
    - In `.kiro/steering/tech.md`, add one row each for `npm run dev -w trick-or-test-viewer`, `npm run build -w trick-or-test-viewer` and `npm run preview -w trick-or-test-viewer`. Each row states that the command builds the engine first. Add no row for the viewer `test` script, because `tech.md` has no per-workspace test row and the root `npm test` row stays unchanged.
    - Land these rows in the same commit as the scripts from 1.4.
    - _Requirements: 12.12, 12.15_
    - _Validation: `npm run lint` passes_

  - [x] 1.6 Add the static boundary checks
    - Add `apps/viewer/test/static/boundaries.test.ts` that walks `apps/viewer/src/` (tests and config files run in Node and are out of scope) and asserts:
      - 12.8: no non-`.tsx` file under `src/` imports `react`, `react-dom` or a `.tsx` module.
      - 12.2: no file imports a `node:` module or a bare Node built-in name, and the only specifier that starts with `trick-or-test` is exactly `trick-or-test/report` (no relative path into `packages/engine`).
      - 12.9: `dangerouslySetInnerHTML` appears in at most one file under `src/` and only as `src/bestiary/Creature.tsx`. Task 8.4 tightens this to exactly one.
    - The check passes when the folders are still empty. It starts guarding as modules arrive.
    - _Requirements: 12.2, 12.8, 12.9_
    - _Validation: `npm test -w trick-or-test-viewer -- test/static/boundaries.test.ts` passes_

- [x] 2. Checkpoint - workspace setup
  - Ensure all tests pass, ask the user if questions arise.
  - _Validation: `npm run check` passes_

- [x] 3. Loader: recognise, parse, join, timeline, file reading, demo fetch
  - [x] 3.1 Write the fixture runs
    - Create under `apps/viewer/test/fixtures/` small hand-written files: a Trick or Test `report.json` (with `species` and `requirement` fields, mutants Survived, Killed, Timeout, NoCoverage and one Ignored with `statusReason` naming Ghost), a `verdict.json` with coverage entries for guarded, unguarded, unattacked and skipped (and one entry with an id the report lacks), a Plain_Stryker_Report, and a `history.jsonl` of several records (including two with equal `time`).
    - Add variants: a history file with a blank line, a CRLF history file, a history file with a bad line 3 after a blank line, an empty file, a whitespace-only file, a history file with a trailing newline, and a single-line JSON report that is not history.
    - Add `apps/viewer/test/fixtures/fixtures.test.ts` asserting that each valid fixture passes its schema from `trick-or-test/report` and each broken variant fails as intended.
    - _Requirements: 2.6_
    - _Validation: `npm test -w trick-or-test-viewer -- test/fixtures/fixtures.test.ts` passes_

  - [x] 3.2 Implement `loader/recognise.ts`
    - Add the shared types in `src/loader/types.ts` (`Result`, `LoadError` with `fileName`, `message`, optional `line`, `fieldPaths`, `truncatedCount`, and `FileKind`). Implement `recognise(text)` with the precedence from the design: a whole-document Mutation_Report or Verdict_File first, then JSON Lines history (at least one non-empty line validates with `historyRecordSchema`, blank lines ignored, LF or CRLF, trailing newline allowed), then invalid JSON or empty.
    - Recognise by content, never by file name. A Plain_Stryker_Report and a Trick or Test report both give `mutation-report`.
    - Example tests in `test/loader/recognise.test.ts`: single-line report is not history (1.6), blank lines, CRLF and trailing newline (1.12), zero-byte and whitespace-only files give the empty error (1.14), invalid JSON (1.7).
    - _Requirements: 1.6, 1.7, 1.12, 1.14_
    - _Validation: `npm test -w trick-or-test-viewer -- test/loader/recognise.test.ts` passes_

  - [x] 3.3 Implement `loader/parse.ts`
    - Implement `parseFile(kind, text, fileName)` returning `Result<ParsedFile, LoadError>`. Use only `safeParse`. Report failing field paths (up to 10, then the count of further failures). Validate a History_File line by line: the first bad non-empty line rejects the whole file, and the error carries the 1-based line number counted over all lines including blank ones, plus the parse failure or the failing field paths.
    - Example tests in `test/loader/parse.test.ts`: JSON syntax error names the file (1.7), schema failure lists paths and truncates at 10 with the remaining count (1.8), history error line number with a blank line before the bad line (1.13), no throw on any fixture (12.14).
    - _Requirements: 1.7, 1.8, 1.13, 12.14_
    - _Validation: `npm test -w trick-or-test-viewer -- test/loader/parse.test.ts` passes_

  - [x] 3.4 Write property test for loading never crashing
    - **Property V8: Loading never crashes**
    - File: `test/loader/loader.never-throws.property.test.ts`. Generate arbitrary text (valid JSON of any shape, JSON Lines with blank or malformed lines, empty or whitespace strings, arbitrary characters) and any file name. Assert `recognise` then `parseFile` returns a `Result` and never throws, and a History_File `LoadError` has the file name and a 1-based line number that points at a non-empty line.
    - _Requirements: 1.6, 1.7, 1.8, 1.9, 1.12, 1.13, 1.14_
    - _Validation: `npm test -w trick-or-test-viewer -- test/loader/loader.never-throws.property.test.ts` passes_

  - [x] 3.5 Implement `loader/join-run.ts`
    - Implement `joinRun(files)` returning `Result<RawRun, LoadError>`: build the RawRun from a Mutation_Report, join Verdict_File mutants by mutant id, keep a Plain_Stryker_Report as a RawRun without Criterion data, order history records by `time` ascending and keep file order for equal `time`, and count Verdict_File entries with no matching report mutant. Return the "a Mutation_Report is required" error when no report is present. Never mutate the parsed inputs.
    - Example tests in `test/loader/join-run.test.ts` named by criterion: join by id (1.3), plain report (1.5), equal `time` order (1.4), ignored entry count (1.10), no report error (1.9), valid report displays as a RawRun (1.2).
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.9, 1.10_
    - _Validation: `npm test -w trick-or-test-viewer -- test/loader/join-run.test.ts` passes_

  - [x] 3.6 Implement the hunt timeline builder
    - Create `src/hunt/timeline.ts` (pure): `buildTimeline(history)` returns one entry per history record, ordered by `time` ascending with a stable order for equal `time`. Each entry holds the run time, git commit, `newlyKilledIds` and `survivors`, taken as `statusCounts.Survived` of the record.
    - Example tests in `test/hunt/timeline.test.ts`: entry count equals record count (8.11), survivors equal `statusCounts.Survived` (8.3, 8.12), fields present (8.2), ordering with equal times (8.1).
    - _Requirements: 8.1, 8.2, 8.3, 8.11, 8.12_
    - _Validation: `npm test -w trick-or-test-viewer -- test/hunt/timeline.test.ts` passes_

  - [x] 3.7 Write property test for the hunt order
    - **Property V9: Hunt is ordered**
    - File: `test/hunt/hunt.order.property.test.ts`. Generate non-empty arrays of `HistoryRecord` (including equal `time`), serialise as JSON Lines with arbitrary blank lines and either line ending, then load through `recognise`, `parseFile` and `joinRun`. Assert the records survive unchanged, the timeline from `buildTimeline` is sorted by `time` with equal-`time` records in file order, and each survivor count equals `statusCounts.Survived`.
    - _Requirements: 1.4, 1.12, 8.1, 8.3_
    - _Validation: `npm test -w trick-or-test-viewer -- test/hunt/hunt.order.property.test.ts` passes_

  - [x] 3.8 Implement `loader/file-reader.ts`
    - Implement `readFiles(files: File[])`. Check `File.size > 52_428_800` before reading and reject without reading the content, with an error naming the file and the 50 MB limit. Read with browser APIs only and send nothing over the network. Return per-file `Result`s so one bad file does not hide the others.
    - Example tests in `test/loader/file-reader.test.ts`: a file of exactly 52,428,800 bytes is read, a file of 52,428,801 bytes is rejected and `File.prototype.text` or `FileReader` is not called (1.11), `fetch` is never called (1.1), a read failure becomes a `LoadError` (12.14).
    - _Requirements: 1.1, 1.11, 12.14_
    - _Validation: `npm test -w trick-or-test-viewer -- test/loader/file-reader.test.ts` passes_

  - [x] 3.9 Implement `loader/fetch-demo-run.ts`
    - Implement `fetchDemoRun(which, baseUrl)`. Build each URL as `import.meta.env.BASE_URL` plus `demo/...` (served under `/trick-or-test/demo/`), use GET only, wrap each `fetch` in a 10-second `AbortController` timeout, and run the body through the same `recognise`, `parseFile` and `joinRun` path as local files. A network failure, non-2xx response or timeout gives a `LoadError` that names the failed file. An unparseable body gives an error that names the file and states its content is invalid.
    - Tests in `test/loader/fetch-demo-run.test.ts` mock `fetch` against the fixtures from 3.1 and never read `public/demo/`: GET-only and no body (2.5), URL under the base path and same origin (2.2, 12.11), network failure, 404 and timeout with fake timers name the file (2.3), invalid content names the file (2.4).
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 12.11_
    - _Validation: `npm test -w trick-or-test-viewer -- test/loader/fetch-demo-run.test.ts` passes_

- [ ] 4. Bestiary: species, state, run model, counts, coverage, creature generator
  - [x] 4.1 Implement `bestiary/species.ts`
    - Implement `speciesOf(mutatorName, isSpecMutant)` with one mapping table that has the same mutator-name entries as the table in `.kiro/steering/bestiary.md`. A Spec_Mutant is always Oathbreaker. An unknown name is Unclassified and never throws.
    - Example tests in `test/bestiary/species.test.ts`: the table parsed from `bestiary.md` matches the code table row for row (4.1), Spec_Mutant gives Oathbreaker (4.2), unknown name gives Unclassified (4.3).
    - _Requirements: 4.1, 4.2, 4.3_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/species.test.ts` passes_

  - [x] 4.2 Write property test for species being total
    - **Property V4: Species is total**
    - File: `test/bestiary/species.property.test.ts`. For any string, `speciesOf` returns one of the seven Species and never throws. Every mutator name in the `bestiary.md` table returns its row's species. When `isSpecMutant` is true the result is Oathbreaker.
    - _Requirements: 4.1, 4.2, 4.3_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/species.property.test.ts` passes_

  - [x] 4.3 Implement `bestiary/state.ts`
    - Implement `deriveState(input)` returning `CreatureState | "not-counted"`: Survived gives survivor, Killed or Timeout gives killed, NoCoverage gives in-the-dark, Ghost (from the Verdict_File, or from an Ignored mutant whose `statusReason` names Ghost when no Verdict_File exists) gives ghost, and everything else (including Ignored with InvalidWitness, NotApplicable, another status, or no reason) gives `"not-counted"`. Take the status from the Verdict_File entry when it exists, and fall back to the report status when it does not.
    - Example tests in `test/bestiary/state.test.ts`, one per criterion 4.4 to 4.10 and 4.12.
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.12_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/state.test.ts` passes_

  - [x] 4.4 Write property test for state being total
    - **Property V5: State is total**
    - File: `test/bestiary/state.property.test.ts`. For any `ReportStatus`, any `statusReason` (or none) and any presence of a Verdict_File entry, `deriveState` returns exactly one of the four states or `"not-counted"`, never throws.
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.12_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/state.property.test.ts` passes_

  - [x] 4.5 Implement `loader/run-model.ts`
    - Implement `buildRunModel(raw)`. Derive `species` and `state` once per Mutant (species and status from the Verdict_File entry when present, otherwise from the report), derive `original` and `replacement` from the file source and location when available, keep `not-counted` mutants in the list, and never mutate the RawRun. A Plain_Stryker_Report gives species from the mutator name and no Criterion data.
    - Example tests in `test/loader/run-model.test.ts`: plain report species without criteria (1.5), Verdict_File species and status win (4.9), missing verdict entry falls back and does not throw (4.10), `not-counted` mutants stay in the list (4.8), two reads of one RunModel give identical values (4.11).
    - _Requirements: 1.5, 4.8, 4.9, 4.10, 4.11_
    - _Validation: `npm test -w trick-or-test-viewer -- test/loader/run-model.test.ts` passes_

  - [x] 4.6 Implement `bestiary/counts.ts`
    - Implement `computeHeadlineCounts` (surviving and killed Spec_Mutants, guarded and unguarded Criteria, with the report-only variant when there is no Verdict_File), `computeKillClassCounts` (four groups, 0 for empty), `computeSpeciesLegend` (omit species with 0 Mutants) and `selectStrays` (Strays ordered by status, then file, then line, first 60 plus the remaining count). Not-counted Mutants are excluded from every count.
    - Example tests in `test/bestiary/counts.test.ts`: headline numbers (6.1), headline without verdict (6.14), kill-class groups include 0 and sum to killed Mutants that have a class (6.8, 6.15), legend omits empty species (6.12), strays limit 60 and remaining count (6.10, 6.11), not-counted excluded (4.11).
    - _Requirements: 4.11, 6.1, 6.8, 6.10, 6.11, 6.12, 6.14, 6.15_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/counts.test.ts` passes_

  - [x] 4.7 Implement `bestiary/coverage.ts`
    - Implement `computeCoverageView(runModel)`: one entry per coverage list entry, with status guarded, unguarded, unattacked or skipped (with skip reason), and an `unrecognised` entry for any other status. An unguarded entry holds its surviving Spec_Mutants. A Criterion with a surviving Spec_Mutant is never guarded. Never throws.
    - Example tests in `test/bestiary/coverage.test.ts`: one test per criterion 6.2 to 6.7, and seal count equals coverage list length (6.16).
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.16_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/coverage.test.ts` passes_

  - [x] 4.8 Write property test for no false seal
    - **Property V7: No false seal**
    - File: `test/bestiary/coverage.no-false-seal.property.test.ts`. For any Verdict_File whose coverage list has a Criterion with at least one `Survived` Spec_Mutant, `computeCoverageView` never reports that Criterion as `guarded`.
    - _Requirements: 6.3, 6.4_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/coverage.no-false-seal.property.test.ts` passes_

  - [x] 4.9 Implement `bestiary/escape-xml.ts`
    - Implement the single `escapeXml(s)`: `&` to `&amp;`, `<` to `&lt;`, `>` to `&gt;`, `"` to `&quot;`, `'` to `&#39;`. No other escaping function exists in `src/`.
    - Example tests in `test/bestiary/escape-xml.test.ts`: each of the five characters, ampersand escaped first with no double escaping, empty string.
    - _Requirements: 5.14_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/escape-xml.test.ts` passes_

  - [x] 4.10 Implement `bestiary/glyph.ts`
    - Implement `glyphFor(species, original, replacement)` with the glyph rule of each species from `bestiary.md`. Return `"?"` for any species when both texts are missing or empty. Never throw.
    - Example tests in `test/bestiary/glyph.test.ts`: one example per species, plus missing and empty inputs.
    - _Requirements: 5.11, 5.15_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/glyph.test.ts` passes_

  - [x] 4.11 Implement `bestiary/creature.config.ts` and the seeded generator
    - Create `src/bestiary/creature.config.ts` with the constant `VIEW_BOX`, a per-species table of element descriptors with fixed count and kind order (3 to 5 body curves each), and the colour tokens from `bestiary.md` (no other colour values).
    - Create `src/bestiary/prng.ts` with an inline 32-bit FNV-1a string hash and `mulberry32`. It reads no clock and no unseeded random source.
    - Example tests in `test/bestiary/creature.config.test.ts`: every species has 3 to 5 curves (5.4), same hash gives the same sequence (5.3), no `Math.random` or `Date` in the source (5.3), every colour in the config is a token from `bestiary.md` (5.12).
    - _Requirements: 5.3, 5.4, 5.5, 5.12_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/creature.config.test.ts` passes_

  - [x] 4.12 Implement the creature structure in `bestiary/creature.ts`
    - Implement `creature(species, seed, state, mutant)`: one root `<svg role="img" viewBox=...>` with a `<title>` of `"<Species>, <state>: <file>:<line>"` or `"<Species>, <state>: unknown location"`, the body curves with seeded jitter of at most 8% of the viewBox width, the element-kind sequence fixed per species, and `escapeXml` applied to every text value. Missing file, line or glyph never throws and gives a valid SVG.
    - Example tests in `test/bestiary/creature.test.ts`: single SVG string (5.1), same arguments give the same string (5.2), title text with and without location (5.6, 5.15), jitter stays within 8% (5.4), two seeds give the same curve count and element-kind sequence (5.5, 5.17), escaping in title (5.14).
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.14, 5.15, 5.16, 5.17_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/creature.test.ts` passes_

  - [x] 4.13 Add state styling to `bestiary/creature.ts`
    - Implement `stateStyle(state)` and apply it: survivor has full-ink stroke and fill with eyes in the lit-eye token; killed has bones only, stroke width at most half the survivor width, no fill, no eyes; in-the-dark has a single-colour filled silhouette and no eyes; ghost has a dashed outline, no fill, opacity exactly 0.4. Draw shade only as an SVG `<pattern>` of parallel lines at one angle. Emit no `linearGradient`, `radialGradient`, `filter` or drop shadow.
    - Example tests added to `test/bestiary/creature.states.test.ts`: one per criterion 5.7 to 5.10, shade pattern (5.13), forbidden elements absent in every species and state (5.12).
    - _Requirements: 5.7, 5.8, 5.9, 5.10, 5.12, 5.13_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/creature.states.test.ts` passes_

  - [ ] 4.14 Draw the glyph inside the body in `bestiary/creature.ts`
    - Call `glyphFor` and draw the escaped glyph inside the body bounds for every species and state. Use `"?"` when the glyph is unavailable.
    - Example tests in `test/bestiary/creature.glyph.test.ts`: the glyph text appears in the SVG for each species (5.11), glyph with `<` and `&` is escaped (5.14), missing change gives `?` (5.15).
    - _Requirements: 5.11, 5.14, 5.15_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/creature.glyph.test.ts` passes_

  - [ ] 4.15 Write property test for deterministic creatures
    - **Property V1: Deterministic creatures**
    - File: `test/bestiary/creature.determinism.property.test.ts`. For any species, seed and state, two calls with the same arguments return byte-identical strings.
    - _Requirements: 5.2, 5.18_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/creature.determinism.property.test.ts` passes_

  - [ ] 4.16 Write property test for well-formed creatures
    - **Property V2: Well-formed creatures**
    - File: `test/bestiary/creature.well-formed.property.test.ts`. For any species, seed, state and any missing file, line or glyph, `creature()` never throws. The output parses as XML (use jsdom `DOMParser`) with exactly one root `<svg>`, the fixed `viewBox`, a `<title>` child, and finite numeric coordinates inside the viewBox bounds allowing the 8% jitter. For two seeds of the same species and state, the element-kind sequence is identical.
    - _Requirements: 5.4, 5.5, 5.6, 5.15, 5.16, 5.17_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/creature.well-formed.property.test.ts` passes_

  - [ ] 4.17 Write property test for the glyph being present
    - **Property V3: The glyph is present**
    - File: `test/bestiary/creature.glyph.property.test.ts`. For any mutant with a defined, non-empty `original` or `replacement`, the SVG contains the escaped text that `glyphFor(species, original, replacement)` returns.
    - _Requirements: 5.11, 5.14_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/creature.glyph.property.test.ts` passes_

  - [ ] 4.18 Write property test for safe escaping
    - **Property V11: Escaping is safe**
    - File: `test/bestiary/escape.property.test.ts`. For any string used as file path, glyph text or id, the SVG from `creature()` has no unescaped `&`, `<`, `>`, `"` or `'` from that string. Every occurrence sits inside its entity.
    - _Requirements: 5.14, 10.9, 12.9_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/escape.property.test.ts` passes_

- [ ] 5. Plain view logic
  - [ ] 5.1 Implement `plain-view/columns.ts` and the row builder
    - Create `src/plain-view/columns.ts` with the column definitions (id, label, accessor, comparator) for mutant id, species, state label, status, Criterion id, file and line, and Kill_Class. Add `buildRows(runModel)` returning one `PlainRow` per Mutant, with the state label `"not counted"` for any not-counted or unrecognised-status Mutant (the row stays in the table).
    - Example tests in `test/plain-view/columns.test.ts`: one row per Mutant (9.2), columns present (9.2), `not counted` label for unrecognised status and for Ignored without Ghost (4.8, 9.6), state counts per state equal the headline counts on the fixture (4.11).
    - _Requirements: 4.8, 4.11, 9.2, 9.6_
    - _Validation: `npm test -w trick-or-test-viewer -- test/plain-view/columns.test.ts` passes_

  - [ ] 5.2 Implement `plain-view/sort.ts`
    - Implement `sortRows(rows, column, direction)`: a stable sort by the column, with mutant id ascending as the tie-breaker in both directions. Return a new array.
    - Example tests in `test/plain-view/sort.test.ts`: ascending on a column (9.3), toggling the same column reverses it (9.4), tie-breaker by id for both directions (9.5).
    - _Requirements: 9.3, 9.4, 9.5_
    - _Validation: `npm test -w trick-or-test-viewer -- test/plain-view/sort.test.ts` passes_

  - [ ] 5.3 Write property test for sorting being a permutation
    - **Property V10: Sorting is a permutation**
    - File: `test/plain-view/sort.permutation.property.test.ts`. For any rows, column and direction, `sortRows` returns the same multiset of rows (by mutant id). Sorting the result again with the same column and direction gives the same order.
    - _Requirements: 9.3, 9.4, 9.5, 9.12, 9.13_
    - _Validation: `npm test -w trick-or-test-viewer -- test/plain-view/sort.permutation.property.test.ts` passes_

  - [ ] 5.4 Write property test for conserved counts
    - **Property V6: Counts are conserved**
    - File: `test/bestiary/counts.property.test.ts`. For any valid RunModel built from generated reports and verdicts, `buildRows` has one row per Mutant, and for every `CreatureState` the number of rows in that state equals the count in the headline and legend from `counts.ts`. The four Kill_Class counts sum to the killed Mutants that have a class, and the number of seals equals the coverage list length.
    - _Requirements: 4.11, 6.1, 6.15, 6.16, 9.2, 9.8_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/counts.property.test.ts` passes_

- [ ] 6. Router logic
  - [ ] 6.1 Implement `router/routes.ts`
    - Implement the `Route` union and the pure `parseHashRoute(hash)`: `#/demo/before` and `#/demo/after`, `#/mutant/<id>` (decode the id safely), `#/hunt`, `#/plain`, `#/verdict`, and landing for `""`, `#/` and anything unknown. No `react` import. The `useSyncExternalStore` hook goes in `src/app/` in task 8.7, so `router/` stays free of React.
    - Example tests in `test/router/routes.test.ts`: each known route, unknown route gives landing (11.7), demo routes are known (2.7), mutant id with special characters (11.4), hash-only routing (11.3).
    - _Requirements: 2.7, 11.3, 11.4, 11.7_
    - _Validation: `npm test -w trick-or-test-viewer -- test/router/routes.test.ts` passes_

- [ ] 7. Checkpoint - pure modules
  - Ensure all tests pass, ask the user if questions arise.
  - _Validation: `npm run check` passes_

- [ ] 8. Components and shared UI
  - [ ] 8.1 Add the design tokens and base styles
    - Create `src/styles/tokens.css` defining `--ink`, `--bone`, `--amber`, `--verdigris`, `--mist` and `--ember` on `:root` with the exact values from `bestiary.md`. Create `src/styles/base.css` with the font stacks (`"IM Fell English", Georgia, serif` for titles, species names and the headline; `"JetBrains Mono", ui-monospace, monospace` with `font-variant-numeric: tabular-nums` for data and code), a base font size of at least 14px, a focus ring of at least 2px with 3:1 contrast, and no gradient, glow or box shadow. Import both from `main.tsx`.
    - Example tests in `test/styles/tokens.test.ts` parse the CSS and `bestiary.md`: token values match (10.1), no `gradient(`, `box-shadow` or `text-shadow` in any CSS (10.9), font stacks (10.2, 10.12), no `font-size` below 14px (10.4), focus outline width at least 2px (10.6).
    - _Requirements: 10.1, 10.2, 10.4, 10.6, 10.9, 10.12_
    - _Validation: `npm test -w trick-or-test-viewer -- test/styles/tokens.test.ts` passes_

  - [ ] 8.2 Bundle the fonts and show the licences
    - Create `src/fonts/fonts.ts` with side-effect imports of `@fontsource/im-fell-english/latin-400.css`, `@fontsource/jetbrains-mono/latin-400.css` and `@fontsource/jetbrains-mono/latin-700.css`. Create `src/fonts/licences.ts` importing both `LICENSE` files with `?raw`. Create `src/app/FontLicences.tsx` rendering both texts in a `<details>` with one heading per font. Import `fonts.ts` from `main.tsx`. Add no `<link>` or `@import` to a remote origin and no file under `public/fonts/`.
    - Example tests in `test/fonts/font-licences.test.tsx`: both texts render and contain "SIL Open Font License" (10.3), no `http://` or `https://` font URL in `index.html` or any CSS under `src/` (10.3), no `public/fonts/` directory (12.16).
    - _Requirements: 10.3, 10.12, 12.16_
    - _Validation: `npm test -w trick-or-test-viewer -- test/fonts/font-licences.test.tsx` passes_

  - [ ] 8.3 Add the narrow-screen and desktop layout CSS
    - Create `src/styles/layout.css`: a desktop layout for viewport widths of 1024px and up, and for widths from 360px to 767px a single-column layout with no horizontal page overflow (`min-width: 0` on grid and flex children, long words wrapped) and a `.table-scroll` container with `overflow-x: auto` for wide tables. Import it from `main.tsx`.
    - Example tests in `test/styles/layout.test.ts` parse the CSS: a `max-width: 767px` rule exists, `.table-scroll` has `overflow-x: auto`, the page root has no fixed width above 360px (11.1, 11.2). Real scroll-width measurement is not possible in jsdom, so these checks inspect the rules only.
    - _Requirements: 11.1, 11.2_
    - _Validation: `npm test -w trick-or-test-viewer -- test/styles/layout.test.ts` passes_

  - [ ] 8.4 Implement `bestiary/Creature.tsx`
    - Create the React component `<Creature species seed state mutant />`. It calls `creature()` during the same render and passes only that return value to `dangerouslySetInnerHTML`. It never passes a raw file, verdict or history value, and never concatenates one into the markup. Tighten the static check from 1.6 so that exactly one file contains `dangerouslySetInnerHTML`, and it is this one, wrapping a `creature(` call.
    - Example tests in `test/bestiary/Creature.test.tsx`: renders an `svg` with `role="img"` and the title, a hostile file path such as `"><script>` renders no `script` element (12.9), same props give the same markup.
    - _Requirements: 12.9_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/Creature.test.tsx test/static/boundaries.test.ts` passes_

  - [ ] 8.5 Implement the activatable creature with a state label
    - Create `src/bestiary/CreatureLink.tsx`: a focusable element that wraps `<Creature>`, shows a visible text label with the state name and a distinct shape per state (not colour alone), and opens `#/mutant/<id>` on click, tap, Enter or Space. It is reachable by Tab in DOM order.
    - Example tests in `test/bestiary/CreatureLink.test.tsx`: click, Enter and Space each change the hash to the mutant route (6.13), visible state label for each of the four states (10.5), tab reaches it (10.6).
    - _Requirements: 6.13, 10.5, 10.6_
    - _Validation: `npm test -w trick-or-test-viewer -- test/bestiary/CreatureLink.test.tsx` passes_

  - [ ] 8.6 Add the killed animation and the reduced-motion hook
    - Create `src/app/use-reduced-motion.ts` (a hook over `matchMedia("(prefers-reduced-motion: reduce)")`). Add the erase-to-bones animation to `src/styles/motion.css` (600ms or less, CSS only) and apply it from `Creature.tsx` when the state prop changes to killed, with a module-level guard so at most one animation runs at a time. Under reduced motion, add no animation class and show the final state at once. Add a `@media (prefers-reduced-motion: reduce)` rule that sets `animation: none` and `transition: none` globally.
    - Example tests in `test/styles/motion.test.tsx`: the declared duration is at most 600ms (10.8), a second killed change while one runs does not start a second animation (10.8), reduced motion gives no animation class (10.7), the global reduced-motion rule exists (10.7).
    - _Requirements: 10.7, 10.8_
    - _Validation: `npm test -w trick-or-test-viewer -- test/styles/motion.test.tsx` passes_

  - [ ] 8.7 Add the run context and the hash-route hook
    - Create `src/app/run-context.tsx` holding `RunModel | undefined` in memory only. Setting it happens only on a successful load, so a failed load keeps the previous Run. Create `src/app/use-hash-route.ts` with `useHashRoute()` over `useSyncExternalStore` and `hashchange`, calling `parseHashRoute` from `router/routes.ts`. Write nothing to local storage, session storage or cookies.
    - Example tests in `test/app/run-context.test.tsx`: a failed load keeps the previous Run (1.7), a hash change updates the route (11.3), a remount discards the Run on a non-demo route (11.8), `localStorage`, `sessionStorage` and `document.cookie` stay untouched after loading a fixture (11.9).
    - _Requirements: 1.7, 11.3, 11.8, 11.9_
    - _Validation: `npm test -w trick-or-test-viewer -- test/app/run-context.test.tsx` passes_

  - [ ] 8.8 Implement the screen frame
    - Create `src/app/ScreenFrame.tsx`: one `<h1>` per screen, a `document.title` that contains the screen name, and a visible link to `#/plain` on every screen (including the Plain_View itself, which links to the Verdict_Screen when a Run is open). Keep the document title in sync on route changes.
    - Example tests in `test/app/ScreenFrame.test.tsx`: exactly one `h1` (10.11), title contains the screen name for each of the five screens (10.11), the Plain_View link is present (9.1).
    - _Requirements: 9.1, 10.11_
    - _Validation: `npm test -w trick-or-test-viewer -- test/app/ScreenFrame.test.tsx` passes_

  - [ ] 8.9 Implement the load error display
    - Create `src/app/LoadErrorView.tsx` rendering a `LoadError`: the file name, the message, the 1-based line for history errors, up to 10 field paths and the count of further failures, plus the "N verdict entries ignored" note. Write the text in the field-notes voice: sentences of 20 words or fewer, no exclamation marks.
    - Example tests in `test/app/LoadErrorView.test.tsx`: schema error with 12 failures shows 10 paths and "2 more" (1.8), history error shows the file name and line (1.13), empty file message (1.14), 50 MB message names the file and the limit (1.11), ignored-entry count note (1.10), demo fetch error names the file (2.3), invalid demo content names the file (2.4), no `!` and no sentence over 20 words (12.14).
    - _Requirements: 1.7, 1.8, 1.10, 1.11, 1.13, 1.14, 2.3, 2.4, 12.14_
    - _Validation: `npm test -w trick-or-test-viewer -- test/app/LoadErrorView.test.tsx` passes_

- [ ] 9. Screens
  - [ ] 9.1 Implement the drop zone
    - Create `src/screens/landing/DropZone.tsx`: a drop target and a file picker control that is reachable by Tab and opens the picker on Enter or Space. It reads files through `readFiles`, runs `recognise`, `parseFile`, `joinRun` and `buildRunModel`, and shows errors with `LoadErrorView`. On success it sets the Run in the context and opens `#/verdict`. On any error it keeps the previous Run unchanged. A thrown error shows an error and keeps the app running.
    - Example tests in `test/screens/landing/DropZone.test.tsx` with the fixtures: drop of a valid report opens the Verdict route (1.2), report plus verdict plus history together (1.3), plain report (1.5), invalid file after a valid one keeps the earlier Run (1.7, 1.8, 1.9), ignored-entry note (1.10), keyboard opens the picker (3.5), no network call (1.1).
    - _Requirements: 1.1, 1.2, 1.7, 1.8, 1.9, 1.10, 3.4, 3.5, 12.14_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/landing/DropZone.test.tsx` passes_

  - [ ] 9.2 Implement the Landing screen
    - Create `src/screens/Landing.tsx`: the pitch sentence, exactly two demo links with visible text labels ("before the hunt", "after the hunt") that open `#/demo/before` and `#/demo/after`, the statement "files never leave the browser" visible without interaction, the drop zone, and the `FontLicences` block. Load the before Demo_Run once through `fetchDemoRun` and compute the survivor and unguarded-Criteria numbers from it with `computeHeadlineCounts`. With a failed, invalid or slower-than-5-seconds Demo_Run, show the pitch without numbers (never `0`) and keep the drop zone usable. Show demo load errors with `LoadErrorView` and keep both links active.
    - Example tests in `test/screens/Landing.test.tsx` (mocked `fetch` with fixtures): two numbers shown and equal to the fixture's counts (3.1), failure, invalid content and 5-second timeout (fake timers) show no number and no `0` (3.2), statement and drop zone present (3.3, 3.4), exactly two demo links with labels (2.1), fetch error names the file and links stay active (2.3, 2.4, 2.9), licences shown (10.3), source file contains no digit literal in the pitch (3.6).
    - _Requirements: 2.1, 2.3, 2.4, 2.9, 3.1, 3.2, 3.3, 3.4, 3.6, 10.3_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/Landing.test.tsx` passes_

  - [ ] 9.3 Implement the Verdict headline
    - Create `src/screens/verdict/Headline.tsx`: the four counts (surviving Spec_Mutants, killed Spec_Mutants, guarded Criteria, unguarded Criteria) as non-negative integers from `computeHeadlineCounts`, in IM Fell English. Without a Verdict_File, show the counts available from the report.
    - Example tests in `test/screens/verdict/Headline.test.tsx`: four integers match the fixture (6.1), zero values render as `0`.
    - _Requirements: 6.1_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/verdict/Headline.test.tsx` passes_

  - [ ] 9.4 Implement the seal grid
    - Create `src/screens/verdict/SealGrid.tsx` and the seal drawings: one Seal per entry of `computeCoverageView`, labelled with the Criterion id, a closed seal labelled "guarded", a cracked seal labelled "unguarded" with each surviving Spec_Mutant drawn as an activatable creature, an empty seal labelled "no mutant bred", a skipped mark with the skip reason, and an "unrecognised status" indication that does not stop the other seals.
    - Example tests in `test/screens/verdict/SealGrid.test.tsx`: one test per criterion 6.2 to 6.7, and seal count equals coverage list length (6.16).
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.16_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/verdict/SealGrid.test.tsx` passes_

  - [ ] 9.5 Implement the who-killed-them panel
    - Create `src/screens/verdict/WhoKilledPanel.tsx`: four groups (examples only, properties only, both, unattributed), each with its count (0 included) and a disclosure that lists every Mutant of the group, or "no mutants in this group" when empty.
    - Example tests in `test/screens/verdict/WhoKilledPanel.test.tsx`: four groups with counts (6.8), open group lists every Mutant (6.9), empty group message (6.9), sum of counts equals killed Mutants with a class (6.15).
    - _Requirements: 6.8, 6.9, 6.15_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/verdict/WhoKilledPanel.test.tsx` passes_

  - [ ] 9.6 Implement the strays strip
    - Create `src/screens/verdict/StraysStrip.tsx`: one creature per Stray from `selectStrays`, at most 60, and the count of remaining Strays with a link to `#/plain` when there are more than 60.
    - Example tests in `test/screens/verdict/StraysStrip.test.tsx`: 60 Strays shows 60 creatures and no link, 61 Strays shows 60, "1 more" and the link (6.10, 6.11), draw order by status, file, line (6.11).
    - _Requirements: 6.10, 6.11_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/verdict/StraysStrip.test.tsx` passes_

  - [ ] 9.7 Implement the species legend
    - Create `src/screens/verdict/SpeciesLegend.tsx`: for each Species present in the Run, the name, body description, mutation type and Mutant count from `computeSpeciesLegend`. Omit Species with 0 Mutants.
    - Example tests in `test/screens/verdict/SpeciesLegend.test.tsx`: absent species are omitted, counts match the fixture (6.12).
    - _Requirements: 6.12_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/verdict/SpeciesLegend.test.tsx` passes_

  - [ ] 9.8 Assemble the Verdict screen
    - Create `src/screens/Verdict.tsx` inside `ScreenFrame`, composing Headline, SealGrid, WhoKilledPanel, StraysStrip and SpeciesLegend. Without a Verdict_File, show the headline from the report, omit the seals and the panel, and show "no verdict file was loaded".
    - Example tests in `test/screens/Verdict.test.tsx`: all five parts with a verdict (6.1), activating a creature opens the Specimen route (6.13), no-verdict message and no seals (6.14), one `h1` and the title (10.11).
    - _Requirements: 6.13, 6.14, 10.11_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/Verdict.test.tsx` passes_

  - [ ] 9.9 Implement the Specimen screen
    - Create `src/screens/Specimen.tsx`: the large creature, the Species name, the state label and the mutant id; the original and mutated lines with file path and 1-based line (or the replacement, path, line and "original line unavailable" when no source exists); the Criterion id and full text when the Mutant is a Spec_Mutant and the Criterion is in the Verdict_File; the witness input, expected value and mutant value when present; for a killed Mutant, up to 50 killing test names and the Kill_Class; for a survivor with `coveredBy`, up to 50 test names that ran the code without failing; "no test runs this code" for an in-the-dark Mutant. An unknown id shows a message with the id and a link to the Verdict screen, with no creature and no code change. A missing Criterion omits only that section.
    - Example tests in `test/screens/Specimen.test.tsx`: one per criterion 7.1 to 7.7, 7.10, 7.11 and 7.12, and 51 killing tests show 50.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.10, 7.11, 7.12_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/Specimen.test.tsx` passes_

  - [ ] 9.10 Add the eye tracking to the Specimen screen
    - Create `src/screens/specimen/use-eye-tracking.ts` and apply it in `Specimen.tsx`: on each `pointermove` rotate the creature's eyes toward the pointer. With reduced motion (from `use-reduced-motion`), keep the eyes in their default position, attach no listener and run no animation.
    - Example tests in `test/screens/specimen/eye-tracking.test.tsx`: a pointer move changes the eye transform and a second move updates it (7.8), with reduced motion the transform stays at default and no listener is added (7.9).
    - _Requirements: 7.8, 7.9_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/specimen/eye-tracking.test.tsx` passes_

  - [ ] 9.11 Implement the Hunt screen
    - Create `src/screens/Hunt.tsx`: a static ordered list from `buildTimeline`, one entry per record, with the run time, git commit, the creatures in `newlyKilledIds` as activatable creatures that open the Specimen, and the survivor count. An id missing from the current Run_Model shows as plain text, not activatable. With no History_File, show "no history was loaded" and no entries. With an empty history list, show "the history has no records". No animation anywhere in this screen.
    - Example tests in `test/screens/Hunt.test.tsx`: entry per record and order (8.1), fields shown (8.2), survivor equals `statusCounts.Survived` (8.3, 8.12), activating a creature opens the Specimen (8.4), missing id is text and not a link (8.5), no history message (8.8), empty list message (8.10), ordered list with no animation class (8.9), entry count equals record count (8.11).
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.8, 8.9, 8.10, 8.11, 8.12_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/Hunt.test.tsx` passes_

  - [ ] 9.12 Add blocked attempts to the Hunt screen
    - Add the optional `lockLog` input to `Hunt.tsx` using the minimal local type `{ time: string; file: string }[]` from the design (the format belongs to the agent-guard spec). Show each blocked write attempt on the timeline in `--amber` with the text label "blocked". With no Lock_Log, show the timeline without error.
    - Example tests added to `test/screens/Hunt.blocked.test.tsx`: each entry shows "blocked" with the amber token (8.6), no Lock_Log shows no blocked entries and no error (8.7).
    - _Requirements: 8.6, 8.7_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/Hunt.blocked.test.tsx` passes_

  - [ ] 9.13 Implement the Plain view screen
    - Create `src/screens/PlainView.tsx`: a table of `buildRows` rows inside `.table-scroll`, with sortable column headers that are buttons (Tab, Enter and Space), visible "ascending" or "descending" text, `aria-sort` on the sorted header and none or `"none"` on the others, a per-state count line that matches the Verdict screen, a "run has no mutants" message with the headers still operable for an empty Run, and no creature, animation or transition.
    - Example tests in `test/screens/PlainView.test.tsx`: one row per Mutant and the seven columns (9.2), header click sorts and shows "ascending" (9.3), second click shows "descending" (9.4), `aria-sort` values (9.10), keyboard Enter and Space (9.9), `not counted` row kept (9.6), no svg and no animation (9.7), state counts equal the Verdict counts (9.8), empty Run message (9.11), link to the Plain view exists on every screen (9.1).
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11_
    - _Validation: `npm test -w trick-or-test-viewer -- test/screens/PlainView.test.tsx` passes_

  - [ ] 9.14 Wire the App shell and routing
    - Create `src/App.tsx` and update `src/main.tsx`. `App` reads the route with `useHashRoute`, wraps screens in an error boundary (a render failure shows an error and keeps the app running), and applies these rules: demo routes fetch the Demo_Run on first open and on every reload, and open the Verdict screen on success; on failure show the Landing screen with the error and both demo links active. A mutant route with a Run shows the Specimen. A mutant route for an unknown id shows the Landing screen with "mutant not found" and keeps the Run. A route that needs a Run with none loaded shows the Landing screen with "no run is open". An unknown route shows Landing. A reload on any non-demo route starts with no Run.
    - Example tests in `test/App.test.tsx` with mocked `fetch` and fixtures: `#/demo/before` and `#/demo/after` open the Verdict (2.2, 2.7), a remount on the demo route loads again (2.8), demo failure and invalid content show Landing with the error (2.9), mutant route with a Run (11.4), unknown mutant id (11.5), no Run (11.6), unknown route (11.7), non-demo remount discards the Run (11.8), a thrown render error is shown and the app stays up (12.14), failed local load keeps the previous Run (1.7).
    - _Requirements: 1.7, 2.2, 2.7, 2.8, 2.9, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 12.14_
    - _Validation: `npm test -w trick-or-test-viewer -- test/App.test.tsx` passes_

  - [ ] 9.15 Add the cross-cutting UI checks
    - Add `test/ui/cross-cutting.test.tsx` that renders each screen with the fixtures and asserts: every interactive element is reachable by Tab (10.6), each screen has exactly one `h1` and a title with the screen name (10.11), every state has a text label and a shape (10.5), no text sentence is over 20 words and no `!` appears (10.10), no `font-size` under 14px (10.4), no storage or cookie writes (11.9), no `fetch` to an origin other than `location.origin` and no `http(s)://` URL to a third party in `src/` or `index.html` (12.11), the source and tests contain no reference to `.trickortest/design` (12.13), no emoji or `<img>` in the output (10.9), and no digit literal count in the Landing source (3.6).
    - _Requirements: 3.6, 10.4, 10.5, 10.6, 10.9, 10.10, 10.11, 11.9, 12.11, 12.13, 12.14_
    - _Validation: `npm test -w trick-or-test-viewer -- test/ui/cross-cutting.test.tsx` passes_

- [ ] 10. Checkpoint - components and screens
  - Ensure all tests pass, ask the user if questions arise.
  - _Validation: `npm run check` passes_

- [ ] 11. Build for GitHub Pages
  - [ ] 11.1 Add the production build test
    - Add `test/build/build-output.test.ts` that runs Vite's JS `build()` into a temporary directory under `/tmp` and asserts: `index.html` references assets under `/trick-or-test/` (12.3), the `.woff2` files of both fonts are emitted and no URL points to a font CDN or another origin (10.3, 12.11), the OFL text of both fonts is in the bundle (10.3), and `public/fonts/` does not exist (12.16). The build must succeed when `public/demo/` does not exist.
    - _Requirements: 10.3, 12.3, 12.11, 12.16_
    - _Validation: `npm test -w trick-or-test-viewer -- test/build/build-output.test.ts` passes_

  - [ ] 11.2 Build the viewer in CI
    - Add a step "Build viewer" after "Build" in the `quality` job of `.github/workflows/ci.yml` that runs `npm run build -w trick-or-test-viewer`. The viewer tests already run through the root `npm test`.
    - _Requirements: 12.3, 12.6_
    - _Validation: `npm run build -w trick-or-test-viewer` passes_

  - [ ] 11.3 Add the GitHub Pages workflow
    - Create `.github/workflows/pages.yml` that runs on push to `main` and on manual dispatch. Follow `ci.yml`: `permissions` of `contents: read` at the top, `pages: write` and `id-token: write` only on the deploy job, actions pinned by commit SHA with a version comment, `persist-credentials: false`, `npm ci`, then `npm run build -w trick-or-test-viewer`, upload `apps/viewer/dist` with `actions/upload-pages-artifact`, and deploy with `actions/deploy-pages` in the `github-pages` environment. The base path `/trick-or-test/` comes from `vite.config.ts` and is not repeated in the workflow. Look up each action's current SHA from its release before pinning. The zizmor job in `ci.yml` lints the new file.
    - _Requirements: 12.3, 11.3_
    - _Validation: `npm run build -w trick-or-test-viewer` passes_

- [ ] 12. Final checkpoint - viewer complete
  - Ensure all tests pass, ask the user if questions arise.
  - _Validation: `npm run check` passes_

## Notes

- Every task is required, including all example, property and component tests. No task is optional.
- Each criterion of requirements 1 to 12 is cited by at least one task. Properties V1 to V11 each have exactly one task: V1 in 4.15, V2 in 4.16, V3 in 4.17, V4 in 4.2, V5 in 4.4, V6 in 5.4, V7 in 4.8, V8 in 3.4, V9 in 3.7, V10 in 5.3, V11 in 4.18.
- The design lists `use-hash-route.ts` under `router/`. This plan keeps the pure `parseHashRoute` in `router/routes.ts` and puts the React hook in `src/app/use-hash-route.ts`, so no non-`.tsx` file under `router/` imports `react`.
- The design also notes a root `tsconfig.json` project reference. Task 1.2 adds it only when `tsc -b` accepts the viewer's `noEmit` project. The root `typecheck` script already builds the engine first and then runs the viewer's `typecheck`.
- Demo runs in `apps/viewer/public/demo/` come from the engine's `measure` command. No task writes them. All viewer tests use the fixtures under `apps/viewer/test/fixtures/`.
- The Lock_Log format belongs to the agent-guard spec. Task 9.12 uses the minimal local type from the design.
- Pinned versions and dates in task 1.1 were checked with `npm view <pkg> time` on 2026-11-25. Check them again when running the install.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4", "1.5", "1.6"] },
    { "id": 4, "tasks": ["3.1", "4.1", "4.9", "6.1"] },
    { "id": 5, "tasks": ["3.2", "4.2", "4.3", "4.10", "4.11"] },
    { "id": 6, "tasks": ["3.3", "4.4", "4.12"] },
    { "id": 7, "tasks": ["3.4", "3.5", "4.13"] },
    { "id": 8, "tasks": ["3.6", "3.8", "4.14"] },
    { "id": 9, "tasks": ["3.7", "3.9", "4.5", "4.15", "4.16", "4.17", "4.18"] },
    { "id": 10, "tasks": ["4.6", "4.7", "5.1"] },
    { "id": 11, "tasks": ["4.8", "5.2", "5.4"] },
    { "id": 12, "tasks": ["5.3"] },
    { "id": 13, "tasks": ["8.1", "8.2", "8.4", "8.7", "8.9"] },
    { "id": 14, "tasks": ["8.3", "8.5", "8.8"] },
    { "id": 15, "tasks": ["8.6", "9.1", "9.3", "9.4", "9.5", "9.6", "9.7", "9.9", "9.11", "9.13"] },
    { "id": 16, "tasks": ["9.2", "9.8", "9.10", "9.12"] },
    { "id": 17, "tasks": ["9.14"] },
    { "id": 18, "tasks": ["9.15"] },
    { "id": 19, "tasks": ["11.1", "11.2", "11.3"] }
  ]
}
```
