// Property 8: Parser. Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.7, 2.8
import fc from "fast-check";
import { describe, it } from "vitest";
import { parseRequirements } from "../../src/core/requirements.js";
import {
  documentWithoutCriteria,
  requirementsDocument,
} from "../helpers/requirements-generator.js";

describe("Property 8: Parser", () => {
  it("returns ids n.k in document order with correct text and 1-based lines", () => {
    fc.assert(
      fc.property(requirementsDocument, fc.stringMatching(/^[a-z]{1,8}\.md$/), (doc, file) => {
        const result = parseRequirements(doc.text, file);
        if (!result.ok) return false;
        const got = result.value;
        return (
          got.length === doc.expected.length &&
          got.every((c, i) => {
            const e = doc.expected[i];
            return (
              e !== undefined &&
              c.id === e.id &&
              c.requirement === e.requirement &&
              c.criterion === e.criterion &&
              c.text === e.text &&
              c.line === e.line
            );
          })
        );
      }),
    );
  });

  it("returns an error naming the file when there are no acceptance criteria", () => {
    fc.assert(
      fc.property(documentWithoutCriteria, fc.stringMatching(/^[a-z]{1,8}\.md$/), (text, file) => {
        const result = parseRequirements(text, file);
        return (
          !result.ok && result.error.kind === "no-criteria" && result.error.message.includes(file)
        );
      }),
    );
  });
});
