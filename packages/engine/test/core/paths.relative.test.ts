import { describe, expect, it } from "vitest";
import { containsAbsolutePath, scrubAbsolutePaths } from "../../src/core/paths.js";

const ROOT = "/work/project";

describe("8.17 relative paths are not absolute paths", () => {
  it.each(["a-/a.ts", "a+/a.ts", "a~/a.ts", "a@/a.ts", "a%/a.ts", "a_/a.ts", "a./a.ts"])(
    "8.17 %s is not flagged nor rewritten",
    (relative) => {
      expect(containsAbsolutePath(relative)).toBe(false);
      expect(scrubAbsolutePaths(relative, ROOT)).toBe(relative);
      expect(scrubAbsolutePaths(`see ${relative} here`, ROOT)).toBe(`see ${relative} here`);
    },
  );

  it.each(['"', "'", "(", "[", "=", ",", ";", " "])(
    "8.17 an absolute path after %j is still rewritten",
    (before) => {
      const text = `x${before}/etc/hosts`;
      expect(containsAbsolutePath(text)).toBe(true);
      expect(scrubAbsolutePaths(text, ROOT)).toBe(`x${before}<outside-project>/hosts`);
    },
  );

  it("8.17 an absolute path at the start of the text is rewritten", () => {
    expect(scrubAbsolutePaths("/work/project/src/a.ts", ROOT)).toBe("src/a.ts");
  });
});
