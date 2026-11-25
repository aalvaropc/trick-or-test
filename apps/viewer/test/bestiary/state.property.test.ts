// Feature: bestiary-viewer, Property V5: State is total
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { deriveState, type StateInput } from "../../src/bestiary/state.js";

const reportStatuses = [
  "Killed",
  "Survived",
  "NoCoverage",
  "Timeout",
  "CompileError",
  "RuntimeError",
  "Ignored",
  "Pending",
] as const;

const verdictStatuses = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "NotApplicable",
] as const;

const allowed = ["survivor", "killed", "in-the-dark", "ghost", "not-counted"];

describe("deriveState totality", () => {
  it("4.4 4.5 4.6 4.7 4.8 4.9 4.10 4.12 returns exactly one known value and never throws", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...reportStatuses),
        fc.option(fc.oneof(fc.string(), fc.constantFrom("Engine status: Ghost", "Ghost")), {
          nil: undefined,
        }),
        fc.option(fc.constantFrom(...verdictStatuses), { nil: undefined }),
        (reportStatus, statusReason, entryStatus) => {
          const input = {
            reportStatus,
            statusReason,
            verdictEntry: entryStatus === undefined ? undefined : { status: entryStatus },
          } as StateInput;
          const result = deriveState(input);
          expect(allowed.filter((v) => v === result)).toHaveLength(1);
        },
      ),
    );
  });
});
