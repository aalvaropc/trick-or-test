---
status: accepted
date: 2026-11-15
---

# Record architecture decisions

## Context and problem statement

Specs in `.kiro/specs/` say what each part of the system must do. They do not say why the system is shaped the way it is, and agents and contributors need that context to avoid undoing deliberate choices.

## Decision outcome

Record every decision that is costly to reverse as a numbered file in `docs/decisions/`, using MADR 4. A spec's `design.md` may cite a record instead of repeating it.

### Consequences

- Good: the reasoning behind the structure is versioned next to the code.
- Bad: records must be written while the decision is fresh, which takes discipline.
