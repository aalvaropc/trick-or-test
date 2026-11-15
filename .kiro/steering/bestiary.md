---
inclusion: fileMatch
fileMatchPattern: ["apps/viewer/**"]
---

# Bestiary: the visual system of the viewer

The viewer looks like a naturalist's field book of monsters: ink engravings on a near-black page. It is a data display first. **Every visual trait encodes a fact about a mutant. If a trait encodes nothing, remove it.**

## What each channel encodes

| Channel                      | Encodes                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| Species (body shape)         | The type of mutation                                                 |
| State (eyes, bones, opacity) | The test outcome                                                     |
| The glyph inside the body    | The exact code change, for example `>=` to `>`                       |
| The seal on a requirement    | Requirement coverage                                                 |
| Colour                       | Reinforces state. Always paired with a shape and a text label        |
| Seed (the mutant id)         | Small variations that make each creature recognisable. Never meaning |

## Species

| Species      | Mutators (`mutatorName`)                                                      | Body                                                                 | Glyph shown                                  |
| ------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| Borderling   | EqualityOperator                                                              | Thin, stretched along a horizontal boundary line, one limb across it | The comparison operator                      |
| Miscount     | ArithmeticOperator, UpdateOperator, UnaryOperator, AssignmentOperator         | Lopsided: a different number of limbs or eyes on each side           | The arithmetic operator                      |
| Two-Face     | ConditionalExpression, LogicalOperator, BooleanLiteral                        | Two faces looking opposite ways                                      | `&&`, `\|\|`, `true` or `false`              |
| Hollow       | BlockStatement, ArrayDeclaration, ObjectLiteral, StringLiteral, ArrowFunction | An outline with an empty ribcage                                     | `{}`, `[]` or `""`                           |
| Impostor     | MethodExpression, Regex, OptionalChaining                                     | A body holding a mask slightly off its face                          | The swapped call, for example `min` to `max` |
| Oathbreaker  | Spec mutants                                                                  | Carries a torn scroll                                                | The criterion id, for example `4.3`          |
| Unclassified | Any other name                                                                | Plain shape with a dotted outline                                    | `?`                                          |

The mapping lives in one table in code. Unknown names map to Unclassified and never throw. Check the names against a real report before relying on them.

## States

| State       | Report status       | Drawn as                                                   | Label                    |
| ----------- | ------------------- | ---------------------------------------------------------- | ------------------------ |
| Survivor    | `Survived`          | Full ink, lit eyes, sitting on its line of code            | "survived"               |
| Killed      | `Killed`, `Timeout` | Bones only, thin stroke, the killing test named underneath | "killed by <test>"       |
| In the dark | `NoCoverage`        | Filled silhouette, no eyes                                 | "no test runs this code" |
| Ghost       | `Ghost`             | Dashed outline at 40% opacity                              | "ghost, not counted"     |

Any other status is not drawn. It is listed in the plain view as "not counted".

## Seals

| Seal    | Meaning    | Drawn as                                        | Label            |
| ------- | ---------- | ----------------------------------------------- | ---------------- |
| Closed  | Guarded    | Whole wax seal, verdigris                       | "guarded"        |
| Cracked | Unguarded  | Broken seal, ember, its survivors perched on it | "unguarded"      |
| Empty   | Unattacked | Dashed ring, mist                               | "no mutant bred" |

## Colour tokens

| Token         | Value     | Use                    | Contrast on ink |
| ------------- | --------- | ---------------------- | --------------- |
| `--ink`       | `#0C0E12` | Page background        |                 |
| `--bone`      | `#E9E2D0` | Text and strokes       | 14.95           |
| `--amber`     | `#F2B544` | Blocked attempts       | 10.55           |
| `--verdigris` | `#4CC38A` | Guarded                | 8.72            |
| `--mist`      | `#7A8699` | Ghosts, secondary text | 5.24            |
| `--ember`     | `#E5484D` | Survivors, unguarded   | 4.94            |

- Every colour passes 4.5:1 on ink. Mist is the dimmest text allowed.
- Ember on bone is only 3.03:1. Never put ember text on a bone background.
- No orange-and-purple Halloween palette. No gradients, glows or drop shadows. Depth comes from hatching.

## Type

- Display: IM Fell English, for titles, species names and the headline.
- Data and code: JetBrains Mono, with tabular figures for numbers people compare.
- Both are SIL OFL 1.1 and are self-hosted in the app. No font CDN.
- Minimum size 14px.

## Drawing rules

- `creature(species, seed, state)` returns an SVG string. It is pure and deterministic: the same arguments give identical output. No `Math.random()` and no dates; use a seeded generator derived from the mutant id.
- Fixed `viewBox`. The body is three to five cubic curves with seeded jitter. Shade is an SVG pattern of parallel lines.
- A species must stay recognisable for every seed. Jitter changes proportions, never topology.
- Each SVG has `role="img"` and a `<title>`: "<Species>, <state>: <file>:<line>".
- Eyes follow the pointer only on the Specimen screen.
- When a creature dies, its strokes erase down to bones in 600ms or less. One animation at a time.

## Motion and accessibility

- With `prefers-reduced-motion`, there is no animation: final states only.
- Everything is reachable by keyboard, with a visible focus ring.
- Never colour alone: each state has a shape and a text label.
- The plain view shows exactly the same counts as the bestiary view.

## Voice

Field notes: short, factual, dry. "Survived 47 tests." Say "bugs these tests would never notice", never "bugs in your code". No exclamation marks. Every number comes from the loaded report.

## Do not use

Emoji as icons, stock illustrations, bitmap monsters, cute mascots, jump scares, sound without a visible toggle, decorative cobwebs, pumpkins or bats.
