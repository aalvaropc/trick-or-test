# Trick or Test

> Audit the tests your AI agent writes: breed a monster from every promise in your Kiro spec and see which ones survive.

**Status: under construction.** Nothing here is ready to install yet.

## What it will do

When an AI coding agent writes code, it also writes the tests that say "everything passes". Trick or Test checks whether those tests would notice a real bug:

1. **Breed mutants.** Small deliberate bugs, from two sources: mechanical changes made by [StrykerJS](https://stryker-mutator.io/) (for example `>=` becomes `>`), and _spec mutants_, one per acceptance criterion in a Kiro spec, each with an executable witness.
2. **Show who survives.** A mutant survives when every test still passes with the bug in place. Results are grouped by requirement, so you see which promises in your spec are actually guarded.
3. **Hunt without cheating.** An agent writes new tests until the survivors are killed, while locks stop it from rewriting committed tests or editing source code.

## Repository layout

| Path                | Contents                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `.kiro/`            | Specs, steering, hooks and agents used to build this project with [Kiro](https://kiro.dev) |
| `packages/engine/`  | The `trick-or-test` package: engine, CLI, MCP server and hook entry points                 |
| `apps/viewer/`      | Static web viewer for mutation reports                                                     |
| `examples/pricing/` | Demo project that the engine attacks                                                       |
| `docs/decisions/`   | Architecture decision records                                                              |

## Development

Requires Node.js 26 (see `.nvmrc`) and npm 11.

```bash
npm ci          # install dependencies and git hooks
npm run check   # lint, type-check and test everything
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and commit conventions.

## License

[MIT](LICENSE)
