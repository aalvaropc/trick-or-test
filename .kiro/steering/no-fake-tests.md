---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.test.tsx"]
---

# No fake tests

A test exists to fail when the behaviour is wrong. A test that cannot fail is worse than no test, because it reports safety that is not there.

## Never

1. **Never change a sealed test to make it pass.** A sealed test is a test file already committed to git. That includes changing an expected value, loosening a matcher (`toBe` to `toBeTruthy`, `toEqual` to `toBeDefined`), deleting an assertion, adding `.skip`, `.only` or `.todo`, wrapping the body in `try/catch`, or returning early.
2. **Never special-case the implementation for a test.** No hard-coded return for an input that appears in a test, no lookup table keyed by test inputs, no branch on `process.env.VITEST` or `NODE_ENV`.
3. **Never bend the comparison.** No overriding `valueOf`, `toString`, `Symbol.toPrimitive` or equality to satisfy an assertion, and no hidden state kept between calls to satisfy a sequence of assertions.
4. **Never mock the unit under test**, and never assert only on values a mock was told to return.
5. **Never copy the implementation's formula into the test.** Expected values are literals worked out by hand from the requirement.
6. **Never use snapshots for logic.**

## Always

- Start each test name with the acceptance criterion it guards: `it('4.1 standard shipping is free at exactly 100.00', …)`.
- At every boundary test three points: just below, exactly at, just above.
- One behaviour per test.
- Put property tests in `*.property.test.ts`, with fast-check and the global seed from the setup file. Start each one with a comment: `// Property <n>: <title>. Validates: Requirements <ids>`.
- Make generators reach the boundaries. A random subtotal almost never equals exactly 10000, so build inputs around the boundary values on purpose.
- Add new tests in a new file. Sealed files cannot be edited.

## When a test and the spec disagree

Stop. Do not change the test and do not change the code to force a pass. Call the `flag_test_conflict` tool of the `trickortest` MCP server with the test name, the criterion id and one sentence that explains the contradiction. Then tell the user. If the tool is not available, just tell the user.

## When a write is blocked

If a file write is rejected with a message that starts with `BLOCKED by Trick or Test`, do not try another way: no shell redirection, no `sed`, no `git checkout`, no renaming the file, no new file that repeats the test with weaker assertions. Report what you were trying to do and why.
