# Contributing

Thanks for helping. This project is built spec-first with [Kiro](https://kiro.dev): behaviour is described in `.kiro/specs/` before it is written in code. The same rules apply whether a change is written by a person or by an agent; [AGENTS.md](AGENTS.md) is the short version.

## Setup

```bash
nvm use        # or any version manager that reads .nvmrc (Node.js 26)
npm ci         # installs dependencies and the git hooks
npm run check  # lint, type-check and test
```

## Workflow

1. **Spec first.** If the change alters behaviour, update the spec in this order: `requirements.md`, `design.md`, `tasks.md`. If code and spec disagree, raise it instead of following either silently.
2. **Branch** from `main`, one branch per group of related tasks.
3. **Tests first.** Example tests go in `*.test.ts`; property-based tests (fast-check) go in `*.property.test.ts`. Name each test after the acceptance criterion it guards, for example `it("4.1 standard shipping is free at exactly 100.00", …)`.
4. **Check** with `npm run check` before every commit.
5. **Open a pull request** using the template. CI must be green before merging.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/), in English and in the imperative: `feat(engine): attribute kills per acceptance criterion`.
- Scopes: `engine`, `viewer`, `pricing`, `kiro`, `power`, `repo`, `ci`, `deps`, `docs`, `guard`.
- One commit per spec task. Commits made by an agent carry the `(Kiro)` suffix in the author name:

  ```bash
  git commit --author="$(git config user.name) (Kiro) <$(git config user.email)>"
  ```

- Commit messages describe what changed and why, in technical terms, and never refer to anything outside this repository.
- No AI attribution trailers or footers. The author suffix is the only attribution.
- Commits should be signed.

## The commit guard

`scripts/guard.ts` runs in the git hooks and again in CI. It rejects commit messages, file paths and added lines that match `scripts/guard-patterns.txt` (absolute paths from a developer machine and AI attribution trailers). Maintainers also apply a private pattern list, stored outside the repository and as the `PRIVATE_PATTERNS` repository secret; its contents are never printed.

If the guard blocks you, change the message or the content. Do not bypass the hooks with `--no-verify`: CI runs the same checks. In tests, use paths like `/tmp/project` instead of a real home directory.

## Code standards

- TypeScript in strict mode; see `tsconfig.base.json`.
- [Biome](https://biomejs.dev) for linting and formatting (`npm run format`).
- Architecture decisions are recorded in [`docs/decisions/`](docs/decisions/). Add a new record when a change alters one of them.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Never open a public issue for a vulnerability.
