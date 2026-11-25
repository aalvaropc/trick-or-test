import { describe, expect, it } from "vitest";
import { type ProjectEntry, planSandboxCopy } from "../../src/core/sandbox-plan.js";

const planFor = (entries: ProjectEntry[]) => planSandboxCopy(entries, "reports");

describe("planSandboxCopy", () => {
  it("5.18 copies plain files and directories", () => {
    expect(
      planFor([
        { path: "src", kind: "dir" },
        { path: "src/a.ts", kind: "file" },
      ]),
    ).toEqual([
      { path: "src", action: "copy" },
      { path: "src/a.ts", action: "copy" },
    ]);
  });

  it("5.18 links a symlink to a file inside the project with a relative target", () => {
    expect(planFor([{ path: "src/alias.ts", kind: "symlink", target: "src/real/a.ts" }])).toEqual([
      { path: "src/alias.ts", action: "link", linkTarget: "real/a.ts" },
    ]);
  });

  it("5.18 links a symlink to a directory inside the project with a relative target", () => {
    expect(planFor([{ path: "current", kind: "symlink", target: "releases/v1" }])).toEqual([
      { path: "current", action: "link", linkTarget: "releases/v1" },
    ]);
  });

  it("5.18 uses `..` when the target is in a sibling directory", () => {
    expect(planFor([{ path: "a/b/link", kind: "symlink", target: "c/d" }])).toEqual([
      { path: "a/b/link", action: "link", linkTarget: "../../c/d" },
    ]);
  });

  it("5.18 skips a symlink whose target is outside the project", () => {
    expect(planFor([{ path: "out", kind: "symlink", target: "../elsewhere" }])).toEqual([
      { path: "out", action: "skip" },
    ]);
  });

  it("5.18 skips a symlink with an absolute target", () => {
    expect(planFor([{ path: "abs", kind: "symlink", target: "/etc" }])).toEqual([
      { path: "abs", action: "skip" },
    ]);
  });

  it("5.18 skips a symlink without a resolved target", () => {
    expect(planFor([{ path: "broken", kind: "symlink" }])).toEqual([
      { path: "broken", action: "skip" },
    ]);
  });

  it.each(["node_modules", ".git", ".trickortest", ".stryker-tmp"])(
    "5.18 always skips %s",
    (name) => {
      expect(planFor([{ path: name, kind: "dir" }])).toEqual([{ path: name, action: "skip" }]);
    },
  );

  it("5.18 skips a nested node_modules and what is inside it", () => {
    expect(
      planFor([
        { path: "packages/x/node_modules", kind: "dir" },
        { path: "packages/x/node_modules/y/index.js", kind: "file" },
        { path: "packages/x/index.ts", kind: "file" },
      ]),
    ).toEqual([
      { path: "packages/x/node_modules", action: "skip" },
      { path: "packages/x/node_modules/y/index.js", action: "skip" },
      { path: "packages/x/index.ts", action: "copy" },
    ]);
  });
});
