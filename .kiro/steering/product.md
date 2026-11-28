---
inclusion: always
---

# Product: Trick or Test

Trick or Test audits the tests an AI coding agent writes. It breeds small deliberate bugs, called mutants and drawn as monsters, and shows which ones the test suite fails to notice.

## Who it is for

Developers who build JavaScript or TypeScript projects with Kiro specs and want to know whether "all tests pass" means anything.

## What it does

1. **Breeds mutants** from two sources:
   - _Mechanical mutants_: StrykerJS mutates the code (for example `>=` becomes `>`).
   - _Spec mutants_ ("Oathbreakers"): for each acceptance criterion in a spec's `requirements.md`, a small code change that violates that criterion. Each one carries an executable _witness_.
2. **Shows who survives.** A mutant survives when the whole test suite still passes with the bug in place. Results are grouped by acceptance criterion.
3. **Hunts without cheating.** An agent writes new tests until the survivors are killed, while locks stop it from rewriting committed tests or editing source code.

The key output is **requirement coverage**: not which lines ran, but which promises in the spec would be noticed if they were broken.

## Vocabulary

Use these exact words in code, UI text and docs.

| Term                     | Meaning                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| mutant                   | One small deliberate change to source code                                                                               |
| mechanical mutant        | A mutant produced by StrykerJS                                                                                           |
| spec mutant, Oathbreaker | A mutant written to violate one acceptance criterion                                                                     |
| witness                  | An input, the output the spec demands, and the different output the mutant gives. It proves the mutant changes behaviour |
| killed                   | At least one test fails with the mutant applied                                                                          |
| survivor                 | Every test passes with the mutant applied                                                                                |
| ghost                    | A spec mutant whose witness shows no difference. It is excluded from every count                                         |
| in the dark              | A mutant in code that no test executes                                                                                   |
| stray                    | A mechanical mutant that is not tied to an acceptance criterion                                                          |
| sealed test              | A test file already committed to git. Agents may not modify or delete it                                                 |
| guarded                  | A criterion with at least one valid spec mutant, all of them killed                                                      |
| unguarded                | A criterion with at least one surviving spec mutant                                                                      |
| unattacked               | A criterion with no valid spec mutant                                                                                    |
| skipped                  | A criterion that no exported function can show, set aside with a written reason                                          |
| hunt                     | A session in which an agent writes tests to kill survivors                                                               |
| verdict                  | The summary of one run                                                                                                   |

## Product rules

- Every number shown in the UI, the README or a report comes from a real run stored under `reports/`. Never hard-code or estimate a figure.
- A ghost never counts as killed or as survived.
- Headline counts ("N monsters disagree") count surviving spec mutants. Strays are reported separately.
- Never say the tool "prevents cheating". The accurate claim: it blocks agents from rewriting sealed tests through the file-write tools, and it reports sealed tests that changed by any other means.
- The examples-versus-properties figure is valid for the example project only. Never generalise it.
- Describe other tools (StrykerJS, Meta ACH, Meta JiTTests, Mutahunter) by scope, never as worse. StrykerJS is a dependency, not a competitor.
- Spooky design must carry data: species is the mutation type, state is the test outcome, a seal is a requirement's status. No decoration without meaning.

## Out of scope

Do not build: LLM-based equivalence detection, a custom mutation engine, support for other languages or test runners, detection of hard-coded test cases, a backend, user accounts, analytics, a 3D scene.
