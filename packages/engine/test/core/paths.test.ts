import { describe, expect, it } from "vitest";
import { containsAbsolutePath, relativizePath, scrubAbsolutePaths } from "../../src/core/paths.js";

const root = "/work/project";

describe("relativizePath", () => {
  it("8.17 a path under the root becomes a project-relative path", () => {
    expect(relativizePath(root, "/work/project/src/price.ts")).toBe("src/price.ts");
  });

  it("8.17 a trailing slash on the root does not change the result", () => {
    expect(relativizePath("/work/project/", "/work/project/src/price.ts")).toBe("src/price.ts");
  });

  it("8.17 the root itself becomes a dot", () => {
    expect(relativizePath(root, "/work/project")).toBe(".");
    expect(relativizePath(root, "/work/project/")).toBe(".");
  });

  it("8.17 a path outside the root becomes <outside-project>/<basename>", () => {
    expect(relativizePath(root, "/etc/secret/out.json")).toBe("<outside-project>/out.json");
  });

  it("8.17 a sibling directory that shares the root prefix is outside the root", () => {
    expect(relativizePath(root, "/work/project-other/a.ts")).toBe("<outside-project>/a.ts");
  });

  it("8.17 a Windows drive path under a Windows root uses / separators", () => {
    expect(relativizePath("C:\\work\\project", "C:\\work\\project\\src\\price.ts")).toBe(
      "src/price.ts",
    );
  });

  it("8.17 a Windows drive path outside the root keeps only the basename", () => {
    expect(relativizePath(root, "D:\\data\\out.json")).toBe("<outside-project>/out.json");
  });

  it("8.17 a UNC path keeps only the basename", () => {
    expect(relativizePath(root, "\\\\server\\share\\dir\\out.json")).toBe(
      "<outside-project>/out.json",
    );
  });

  it("8.17 a relative path is returned with / separators", () => {
    expect(relativizePath(root, "src\\price.ts")).toBe("src/price.ts");
  });
});

describe("scrubAbsolutePaths", () => {
  it("8.17 a URL is not a path and stays untouched", () => {
    const text = "see https://example.com/docs/page and file:///tmp/x";
    expect(scrubAbsolutePaths(text, root)).toBe(text);
  });

  it("8.17 free text with several paths rewrites each one", () => {
    const text =
      "Cannot read /work/project/src/a.ts:12:3, then C:\\tmp\\b.ts and \\\\srv\\share\\c.ts (see /var/log/d.log).";
    expect(scrubAbsolutePaths(text, root)).toBe(
      "Cannot read src/a.ts:12:3, then <outside-project>/b.ts and <outside-project>/c.ts (see <outside-project>/d.log).",
    );
  });

  it("8.17 a quoted path and the root itself are rewritten", () => {
    expect(scrubAbsolutePaths(`in "/work/project" and '/work/project/x.ts'`, root)).toBe(
      `in "." and 'x.ts'`,
    );
  });

  it("8.17 text without paths is returned unchanged", () => {
    const text = "relative src/a.ts, and/or ./b.ts, ../c.ts, 3 / 4 and https://h.io/p";
    expect(scrubAbsolutePaths(text, root)).toBe(text);
  });
});

describe("containsAbsolutePath", () => {
  it("8.17 is true for a POSIX path", () => {
    expect(containsAbsolutePath("/work/project/src/a.ts")).toBe(true);
    expect(containsAbsolutePath('failed at "/tmp/x.ts"')).toBe(true);
  });

  it("8.17 is true for a Windows drive path", () => {
    expect(containsAbsolutePath("C:\\work\\a.ts")).toBe(true);
    expect(containsAbsolutePath("D:/work/a.ts")).toBe(true);
  });

  it("8.17 is true for a UNC path", () => {
    expect(containsAbsolutePath("\\\\server\\share\\a.ts")).toBe(true);
  });

  it("8.17 is false for a URL", () => {
    expect(containsAbsolutePath("https://example.com/a/b")).toBe(false);
    expect(containsAbsolutePath("file:///tmp/x")).toBe(false);
  });

  it("8.17 is false for text without paths", () => {
    expect(containsAbsolutePath("src/a.ts and/or ./b.ts, ../c.ts, <outside-project>/d.json")).toBe(
      false,
    );
    expect(containsAbsolutePath("")).toBe(false);
  });

  it("8.17 is false for the output of scrubAbsolutePaths", () => {
    const text = "x /work/project/a.ts y C:\\q\\r.ts z \\\\h\\s\\t.ts";
    expect(containsAbsolutePath(scrubAbsolutePaths(text, root))).toBe(false);
  });
});
