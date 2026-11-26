# Provenance of the cart-pricing-24 fixture

Captured at commit `6f64c644f13677a5709f4641e36aaf6e8e9e829f` (task 17.8, Requirement 11.16).

## mutants.json

The entries with a `requirement` (the 24 Spec_Mutants) of `reports/verdict.json` as committed at that
commit, reduced to `id`, `requirement`, `status` and `killingTests`. The last commit that changed
`reports/verdict.json` is `36b9c1d7358a79c238b49fbb2097529dbcd7ccd7`.

## baseline.json

The Vitest JSON of the Baseline_Run of `examples/pricing`, from this command run in that project:

```bash
npx vitest run --reporter=json --outputFile=.trickortest/baseline.json --includeTaskLocation
```

`--includeTaskLocation` is the flag the engine's suite runner passes; without it the report has no start lines.

The file was copied with the file tools and cut down to the fields the test reads: `name`, `status` and, for each
assertion, `fullName`, `status` and `location`. File names are written relative to the project (`test/api.test.ts`)
instead of as absolute paths of the machine. Timings were dropped. All 47 tests passed.

The working file under `examples/pricing/.trickortest/` was removed afterwards.
