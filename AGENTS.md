# AGENTS.md

Rules for every task in this repository, for AI agents and people alike. Kiro loads this file automatically. It is a router: details live in the files it points to.

## Read first

| Need                                     | File                                                |
| ---------------------------------------- | --------------------------------------------------- |
| What we build, vocabulary, product rules | `.kiro/steering/product.md`                         |
| Stack, commands, engineering rules       | `.kiro/steering/tech.md`                            |
| Where code goes, naming, boundaries      | `.kiro/steering/structure.md`                       |
| Behaviour to implement                   | `.kiro/specs/<name>/` (requirements, design, tasks) |
| Why the system is shaped this way        | `docs/decisions/`                                   |

## Doing a spec task

1. Read the task and every requirement it cites in `_Requirements:`.
2. Write the tests first: example tests in `*.test.ts`, property tests in `*.property.test.ts`, each named after the acceptance criterion it guards.
3. Make the smallest change that passes them. Keep domain logic pure (ADR 0005).
4. Run the task's `_Validation:` command, then `npm run check`. **The task is done only when both pass.**
5. Mark the task `[x]` in `tasks.md` before committing, so the commit includes it.
6. Commit once per task (see below), then stop and report what changed.

## The spec is the source of truth for behaviour

- To change behaviour, change the spec first (`requirements.md`, then `design.md`, then `tasks.md`), then the code.
- If the code and the spec disagree, stop and say so. Do not silently follow either.
- Property-based test tasks are required, never optional.

## Commits

- Conventional Commits, in English and in the imperative: `feat(engine): attribute kills per acceptance criterion`.
- Scopes: `engine`, `viewer`, `pricing`, `kiro`, `power`, `repo`, `ci`, `deps`, `docs`, `guard`.
- When you, an agent, make the commit, mark the author:

  ```bash
  git commit --author="$(git config user.name) (Kiro) <$(git config user.email)>" -m "feat(pricing): …"
  ```

- The message says what changed and why, in technical terms. It never refers to anything outside this repository: no schedules, estimates or personal notes.
- No attribution trailers or footers (`Co-authored-by`, "Generated with"). The `(Kiro)` author suffix is the only attribution.
- Never use `--no-verify`. If a hook blocks the commit, fix the message or the change.

## Never

- Edit a sealed test (a test file already committed) to make it pass. See `.kiro/steering/no-fake-tests.md`.
- Edit generated files by hand: `reports/`, `apps/viewer/public/demo/`, `package-lock.json`.
- Read or write secrets. `.env*`, `*.pem` and `*.key` are listed in `.kiroignore`.
- Write absolute paths from your machine into code, tests or docs. Use relative paths, or `/tmp/...` in tests.
- Add a dependency without pinning it and explaining why in the commit body.
