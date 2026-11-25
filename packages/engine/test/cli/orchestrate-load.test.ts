import { describe, expect, it } from "vitest";
import { type LoadFileSystem, loadProject } from "../../src/cli/orchestrate.js";
import type { Result } from "../../src/core/result.js";

const ROOT = "/proj";

const REQUIREMENTS = `# Requirements

### Requirement 1: Pricing

#### Acceptance Criteria

1. THE Cart SHALL add lines.
2. THE Cart SHALL round half up.
`;

const mutantJson = (id: string, requirement: string): string =>
  JSON.stringify({
    id,
    requirement,
    file: "src/price.ts",
    original: "a + b",
    mutated: "a - b",
    why: "sum becomes difference",
    witness: { export: "add", args: [1, 2], expected: 3 },
  });

/** In-memory file system. A path ending in "/" key is not needed: directories derive from file keys. */
const fakeFs = (files: Record<string, string>): LoadFileSystem & { reads: string[] } => {
  const reads: string[] = [];
  const isDir = (path: string): boolean => Object.keys(files).some((f) => f.startsWith(`${path}/`));
  return {
    reads,
    async readFile(path): Promise<Result<string, string>> {
      reads.push(path);
      const content = files[path];
      return content === undefined ? { ok: false, error: "ENOENT" } : { ok: true, value: content };
    },
    async exists(path) {
      return path in files || isDir(path);
    },
    async listDir(path): Promise<Result<string[], string>> {
      if (!isDir(path)) return { ok: false, error: "ENOENT" };
      const names = new Set<string>();
      for (const f of Object.keys(files)) {
        if (f.startsWith(`${path}/`)) names.add(f.slice(path.length + 1).split("/")[0] as string);
      }
      return { ok: true, value: [...names] };
    },
  };
};

const validProject = (): Record<string, string> => ({
  [`${ROOT}/.kiro/specs/cart/requirements.md`]: REQUIREMENTS,
  [`${ROOT}/mutants/cart/oath-1.1-b.json`]: mutantJson("oath-1.1-b", "1.1"),
  [`${ROOT}/mutants/cart/oath-1.1-a.json`]: mutantJson("oath-1.1-a", "1.1"),
  [`${ROOT}/mutants/cart/skipped.json`]: JSON.stringify([
    { requirement: "1.2", reason: "cannot be observed" },
  ]),
});

const load = (files: Record<string, string>, spec?: string) => {
  const fs = fakeFs(files);
  const result = loadProject({ project: ROOT, ...(spec !== undefined && { spec }) }, { fs });
  return { fs, result };
};

describe("load and validate stage", () => {
  it("9.1 loads a valid project with defaults when the config file is absent", async () => {
    const { result } = load(validProject());
    const loaded = await result;
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
    expect(loaded.value.config.specDir).toBe(`${ROOT}/.kiro/specs`);
    const [spec] = loaded.value.specs;
    expect(loaded.value.specs).toHaveLength(1);
    expect(spec?.name).toBe("cart");
    expect(spec?.criteria.map((c) => c.id)).toEqual(["1.1", "1.2"]);
    expect(spec?.mutants.map((m) => m.mutant.id)).toEqual(["oath-1.1-a", "oath-1.1-b"]);
    expect(spec?.skipEntries.map((s) => s.entry.requirement)).toEqual(["1.2"]);
  });

  it("10.2 reads the config file when present", async () => {
    const files: Record<string, string> = {
      ...validProject(),
      [`${ROOT}/trickortest.config.json`]: JSON.stringify({ mutantsDir: "oaths" }),
    };
    for (const key of Object.keys(files)) {
      if (key.startsWith(`${ROOT}/mutants/`)) {
        files[key.replace("/mutants/", "/oaths/")] = files[key] as string;
        delete files[key];
      }
    }
    const loaded = await load(files).result;
    expect(loaded.ok && loaded.value.specs[0]?.mutants).toHaveLength(2);
  });

  it("9.5 returns the config error for an invalid config and reads nothing else", async () => {
    const files = {
      ...validProject(),
      [`${ROOT}/trickortest.config.json`]: JSON.stringify({ bogus: 1 }),
    };
    const { fs, result } = load(files);
    const loaded = await result;
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error).toHaveLength(1);
    expect(loaded.error[0]?.filePath).toBe("trickortest.config.json");
    expect(loaded.error[0]?.field).toBe("bogus");
    expect(fs.reads).toEqual([`${ROOT}/trickortest.config.json`]);
  });

  it("9.5 returns a requirements parse error with its file and line", async () => {
    const files = {
      ...validProject(),
      [`${ROOT}/.kiro/specs/cart/requirements.md`]:
        "# Requirements\n\n#### Acceptance Criteria\n\n1. Orphan item.\n",
    };
    const loaded = await load(files).result;
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error[0]?.filePath).toBe(`${ROOT}/.kiro/specs/cart/requirements.md`);
    expect(loaded.error[0]?.line).toBe(5);
  });

  it("4.4 a malformed mutant file is an error while the other files still load", async () => {
    const files = {
      ...validProject(),
      [`${ROOT}/mutants/cart/oath-1.1-broken.json`]: "{ not json",
    };
    const { fs, result } = load(files);
    const loaded = await result;
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error).toHaveLength(1);
    expect(loaded.error[0]?.filePath).toBe(`${ROOT}/mutants/cart/oath-1.1-broken.json`);
    // The valid mutant files were still read.
    expect(fs.reads).toContain(`${ROOT}/mutants/cart/oath-1.1-a.json`);
    expect(fs.reads).toContain(`${ROOT}/mutants/cart/oath-1.1-b.json`);
  });

  it("4.4 a cross-file rule violation is an error before any baseline", async () => {
    const files = {
      ...validProject(),
      [`${ROOT}/mutants/cart/oath-9.9-x.json`]: mutantJson("oath-9.9-x", "9.9"),
    };
    const loaded = await load(files).result;
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error[0]?.field).toBe("requirement");
  });

  it("9.1 skips a spec directory without requirements.md", async () => {
    const files = {
      ...validProject(),
      [`${ROOT}/.kiro/specs/draft/design.md`]: "# Draft",
    };
    const loaded = await load(files).result;
    expect(loaded.ok && loaded.value.specs.map((s) => s.name)).toEqual(["cart"]);
  });

  it("9.5 --spec selects one spec and errors when it has no requirements.md", async () => {
    const files = {
      ...validProject(),
      [`${ROOT}/.kiro/specs/other/requirements.md`]: REQUIREMENTS,
      [`${ROOT}/.kiro/specs/draft/design.md`]: "# Draft",
    };
    const one = await load(files, "cart").result;
    expect(one.ok && one.value.specs.map((s) => s.name)).toEqual(["cart"]);

    const missing = await load(files, "draft").result;
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error[0]?.filePath).toBe(`${ROOT}/.kiro/specs/draft/requirements.md`);
    }
  });

  it("9.5 a project with no spec at all is an error", async () => {
    const loaded = await load({ [`${ROOT}/.kiro/specs/draft/design.md`]: "# Draft" }).result;
    expect(loaded.ok).toBe(false);
  });
});
