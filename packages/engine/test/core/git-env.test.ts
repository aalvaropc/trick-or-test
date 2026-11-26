import { describe, expect, it } from "vitest";
import { withoutGitLocation } from "../../src/core/git-env.js";

describe("withoutGitLocation", () => {
  it("3.21 GIT_DIR is removed", () => {
    expect(withoutGitLocation({ GIT_DIR: "/r/.git", PATH: "/bin" })).toEqual({ PATH: "/bin" });
  });

  it("3.21 GIT_WORK_TREE is removed", () => {
    expect(withoutGitLocation({ GIT_WORK_TREE: "/r", PATH: "/bin" })).toEqual({ PATH: "/bin" });
  });

  it("3.21 GIT_INDEX_FILE is removed", () => {
    expect(withoutGitLocation({ GIT_INDEX_FILE: "/r/.git/index", PATH: "/bin" })).toEqual({
      PATH: "/bin",
    });
  });

  it("3.21 GIT_OBJECT_DIRECTORY is removed", () => {
    expect(withoutGitLocation({ GIT_OBJECT_DIRECTORY: "/o", PATH: "/bin" })).toEqual({
      PATH: "/bin",
    });
  });

  it("3.21 GIT_ALTERNATE_OBJECT_DIRECTORIES is removed", () => {
    expect(withoutGitLocation({ GIT_ALTERNATE_OBJECT_DIRECTORIES: "/a", PATH: "/bin" })).toEqual({
      PATH: "/bin",
    });
  });

  it("3.21 GIT_COMMON_DIR is removed", () => {
    expect(withoutGitLocation({ GIT_COMMON_DIR: "/c", PATH: "/bin" })).toEqual({ PATH: "/bin" });
  });

  it("3.21 GIT_NAMESPACE is removed", () => {
    expect(withoutGitLocation({ GIT_NAMESPACE: "ns", PATH: "/bin" })).toEqual({ PATH: "/bin" });
  });

  it("3.21 GIT_CEILING_DIRECTORIES is removed", () => {
    expect(withoutGitLocation({ GIT_CEILING_DIRECTORIES: "/x", PATH: "/bin" })).toEqual({
      PATH: "/bin",
    });
  });

  it("3.21 GIT_DISCOVERY_ACROSS_FILESYSTEM is removed", () => {
    expect(withoutGitLocation({ GIT_DISCOVERY_ACROSS_FILESYSTEM: "1", PATH: "/bin" })).toEqual({
      PATH: "/bin",
    });
  });

  it("3.21 other variables are kept with their values", () => {
    const env = {
      PATH: "/usr/bin",
      HOME: "/tmp/u",
      GIT_AUTHOR_NAME: "Ann",
      GIT_CONFIG_GLOBAL: "/tmp/u/.gitconfig",
    };
    expect(withoutGitLocation(env)).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp/u",
      GIT_AUTHOR_NAME: "Ann",
      GIT_CONFIG_GLOBAL: "/tmp/u/.gitconfig",
    });
  });

  it("3.21 a variable with an undefined value is handled", () => {
    const result = withoutGitLocation({ GIT_DIR: undefined, FOO: undefined, PATH: "/bin" });
    expect(result).toEqual({ FOO: undefined, PATH: "/bin" });
    expect("GIT_DIR" in result).toBe(false);
  });

  it("3.21 names are case-sensitive, so lower-case git_dir is kept", () => {
    expect(withoutGitLocation({ git_dir: "/lower" })).toEqual({ git_dir: "/lower" });
  });

  it("3.21 an empty environment gives an empty result", () => {
    expect(withoutGitLocation({})).toEqual({});
  });

  it("3.21 the argument is unchanged and the result is a different object", () => {
    const env = { GIT_DIR: "/r/.git", PATH: "/bin" };
    const result = withoutGitLocation(env);
    expect(env).toEqual({ GIT_DIR: "/r/.git", PATH: "/bin" });
    expect(result).not.toBe(env);
  });
});
