---
inclusion: always
---

# Technology

Decisions behind this stack are recorded in `docs/decisions/`. Do not change a choice below without a new decision record.

## Stack

- **Runtime:** Node.js 26 (active LTS) for development, pinned in `.nvmrc`. Published packages support Node.js 22.12 or newer, and CI tests 22, 24 and 26.
- **Language:** TypeScript 7 (native compiler) in strict mode, ES modules only. Shared options live in `tsconfig.base.json`; each workspace extends it and is listed in the root `tsconfig.json` references. Build and type-check with `tsc -b`.
- **Repository:** npm workspaces (`packages/*`, `apps/*`, `examples/*`). No other monorepo tool.
- **Lint and format:** Biome (`biome.json`). No ESLint, no Prettier.
- **Tests:** Vitest with one project per workspace (`vitest.config.ts`), v8 coverage. Property-based tests use fast-check.
- **Mutation engine:** StrykerJS (`@stryker-mutator/core`) with `@stryker-mutator/vitest-runner`. We do not write mechanical mutators.
- **Validation:** zod 4 at every boundary.
- **MCP server:** `@modelcontextprotocol/sdk`, stdio transport.
- **Viewer:** Vite, React and TypeScript. Plain CSS with custom properties. No UI kit, no CSS framework, no chart library. Creatures are SVG produced by pure functions.
- **Hosting:** static files on GitHub Pages. Vite's `base` must match the Pages path. No backend, no database, no accounts, no analytics.
- **Git hooks:** lefthook (`lefthook.yml`) runs Biome, the commit guard and commitlint. Never bypass them.

## Commands

| Command                           | What it does                                                        |
| --------------------------------- | ------------------------------------------------------------------- |
| `npm ci`                          | Installs dependencies and git hooks                                 |
| `npm run check`                   | Lint, type-check and test. **A task is done only when this passes** |
| `npm run lint` / `npm run format` | Check or fix lint and formatting                                    |
| `npm run typecheck`               | Type-checks every project (`tsc -b`)                                |
| `npm test`                        | Runs all tests                                                      |
| `npm run test:coverage`           | Runs all tests with coverage                                        |
| `npm run build`                   | Builds every workspace                                              |
| `npm run test:e2e -w trick-or-test` | Runs the engine end-to-end test (slow, about two minutes) |
| `npm run measure`                 | Builds the engine and attacks `examples/pricing` with the `cart-pricing` spec, writing `reports/`. Files in `reports/` are generated only by this command and are never edited by hand |
| `npm run dev -w trick-or-test-viewer` | Builds the engine first, then starts the viewer dev server |
| `npm run build -w trick-or-test-viewer` | Builds the engine first, then type-checks and builds the viewer |
| `npm run preview -w trick-or-test-viewer` | Builds the engine first, then serves the built viewer locally |

Workspaces add their own scripts (for example `attack`, `measure`, `dev`) when their spec creates them; add the matching row here in the same commit.

## Test conventions

- Example tests live in `*.test.ts`. Property tests live in `*.property.test.ts`. The engine tells them apart by this suffix, so never mix both kinds in one file.
- Property tests must be reproducible. fast-check is configured once, in a Vitest setup file, with a fixed `seed` and `numRuns`. Never pass an ad-hoc seed to `fc.assert`.
- Property-test tasks in a spec are required, never optional.
- A test name starts with the acceptance criterion it guards: `it('4.1 standard shipping is free at exactly 100.00', …)`.
- Rules for honest tests are in `no-fake-tests.md`.

## Engineering rules

- **Functional core, imperative shell** (ADR 0005). Domain logic is pure and deterministic; file system, processes, StrykerJS, CLI, MCP and hooks are adapters behind small interfaces.
- **Never mutate the working tree.** Spec mutants are applied in a sandbox copy of the target project.
- **Determinism.** The same inputs give the same report: mutant ids are a hash of file, original text and replacement; ordering is stable; no timestamps inside ids.
- **No LLM calls inside the engine** (ADR 0004). Mutants are written by Kiro agents; the engine validates and executes them. The package needs no API key.
- **Parse at the boundaries.** Reports, mutant files, config files, hook events and MCP arguments are untrusted JSON. Parse them with a zod schema and fail with a message that names the file and the field.
- **Types.** Branded types for mutant, criterion and test ids. Expected failures return a `Result` union; throw only for bugs. No `any`; use `unknown` and parse.
- **Hook entry points stay small.** `hooks/lock`, `hooks/attack` and `hooks/verdict` must not import StrykerJS, the MCP SDK or anything slow at module load. `lock` runs before every file write.
- **Hook exit codes.** `0` means allow or success; stdout goes to the agent. `2` means block and is used only by `lock`; stderr goes to the agent. Never exit with another code on purpose.
- **Report format.** The mutation report conforms to `mutation-testing-report-schema`, so any Stryker-compatible tool can read it. Whatever that schema cannot hold goes in the sidecar `verdict.json`.
- **Money** in the example project is integer cents. No floating-point currency.
- **No secrets and no telemetry.** `.kiro/settings/mcp.json` holds no credentials.
- **Dependencies.** Add one only when it removes real work, pin the exact version, and say why in the commit body. Ask before adding a runtime dependency to the viewer.
- **Edit files with the file tools.** Create and change files with the file editing tools, never through shell commands (`cat > file`, heredocs, `sed -i`, `python -c`, `tee`). Shell edits skip review and the hooks that guard sealed tests, so they are denied. Use the shell only to run commands such as tests and checks.

## Do not use

Jest, Mocha, ESLint, Prettier, husky, Babel plugins, a custom AST mutator, server-side rendering, Tailwind, component libraries, WebGL.
