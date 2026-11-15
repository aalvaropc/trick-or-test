---
inclusion: auto
name: mutant-patches
description: How to write a spec mutant (Oathbreaker) with an executable witness. Use when creating, reviewing or fixing files under a mutants/ directory, or when asked to breed mutants from the acceptance criteria of a spec.
---

# Writing spec mutants

A spec mutant is the smallest change to the source code that makes one acceptance criterion false. It answers one question: if this promise were broken, would any test notice?

## File

One mutant per file: `mutants/<spec-name>/<mutant-id>.json` inside the target project.

```json
{
  "id": "oath-4.3-threshold-before-coupon",
  "requirement": "4.3",
  "file": "src/shipping.ts",
  "original": "const freeShipping = discountedSubtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS;",
  "mutated": "const freeShipping = subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS;",
  "why": "Decides free shipping before the coupon is applied instead of after it.",
  "witness": {
    "from": "src/index.ts",
    "export": "priceCart",
    "args": [
      {
        "lines": [{ "sku": "A", "unitPriceCents": 10500, "quantity": 1 }],
        "coupon": {
          "kind": "percent",
          "bps": 1000,
          "maxDiscountCents": 2000,
          "minSubtotalCents": 0
        },
        "shipping": "standard",
        "taxBps": 0
      }
    ],
    "expected": {
      "subtotalCents": 10500,
      "discountCents": 1050,
      "shippingCents": 799,
      "taxCents": 0,
      "totalCents": 10249
    }
  }
}
```

| Field              | Rule                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `id`               | `oath-<criterion>-<slug>`. Unique                                                                                         |
| `requirement`      | The id of exactly one acceptance criterion that exists in `requirements.md`                                               |
| `file`             | The one source file to change, relative to the project root                                                               |
| `original`         | Text that appears **exactly once** in `file`. Copy it character for character, with enough context to be unique           |
| `mutated`          | The replacement. The result must type-check                                                                               |
| `why`              | One sentence: what the mutant does wrong, in the words of the criterion                                                   |
| `witness.from`     | Module that exports the function to call. Defaults to `file`                                                              |
| `witness.export`   | Name of an exported pure function                                                                                         |
| `witness.args`     | JSON arguments for that function                                                                                          |
| `witness.expected` | The value the **criterion** demands for those arguments. For rejected input, use `"expectedError": "<ErrorName>"` instead |

## How to choose the change

1. Read the criterion. State in one sentence what would be false if it were broken.
2. Prefer a change a mechanical tool would not make: the wrong variable, the wrong order of two steps, a missing step, the wrong unit, a rule applied to the wrong scope. Swap a single operator only when that is the only way to break the criterion.
3. Change one span in one file. Never change a signature, a type or an export.
4. Write the witness last. Work out `expected` by hand from the criterion, not by running the code.

## What makes a mutant invalid

- `original` appears zero times or more than once.
- The mutated code does not type-check.
- The original code does not return `expected`. Either you misread the criterion or the code already violates it. Never edit `expected` to match the code; report it.
- The mutated code returns the same value as the original for the witness input. That is a ghost: it proves nothing and is not counted.

## Never

- Never read or edit test files while breeding. Mutants come from the spec, not from gaps noticed in the tests.
- Never touch comments, log messages, formatting or dead code.
- Never write a mutant for a criterion that cannot be observed through an exported function. Leave it unattacked and say why.
- Never break more than one criterion with one mutant on purpose.
