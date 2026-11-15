import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const steeringDir = join(root, ".kiro", "steering");
const hooksDir = join(root, ".kiro", "hooks");

/** Reads the YAML front matter of a steering file as flat key/value pairs. */
function frontMatter(text: string): Map<string, string> | undefined {
  const lines = text.split("\n");
  if (lines[0] !== "---") return undefined;
  const end = lines.indexOf("---", 1);
  if (end === -1) return undefined;
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    const separator = line.indexOf(":");
    if (separator > 0)
      fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return fields;
}

const steeringFiles = readdirSync(steeringDir).filter((name) => name.endsWith(".md"));
const hookFiles = readdirSync(hooksDir).filter((name) => name.endsWith(".json"));

describe("Kiro steering files", () => {
  it.each(steeringFiles)("%s starts with valid front matter", (name) => {
    const fields = frontMatter(readFileSync(join(steeringDir, name), "utf8"));
    expect(fields, "front matter must be the first lines of the file").toBeDefined();
    const inclusion = fields?.get("inclusion");
    expect(["always", "fileMatch", "manual", "auto"]).toContain(inclusion);
    if (inclusion === "fileMatch") expect(fields?.get("fileMatchPattern")).toBeTruthy();
    if (inclusion === "auto") {
      expect(fields?.get("name")).toBeTruthy();
      expect(fields?.get("description")).toBeTruthy();
    }
  });

  it("includes the three foundation files", () => {
    expect(steeringFiles).toEqual(
      expect.arrayContaining(["product.md", "tech.md", "structure.md"]),
    );
  });
});

describe("Kiro hooks", () => {
  it.each(hookFiles)("%s uses the v1 schema", (name) => {
    const config: unknown = JSON.parse(readFileSync(join(hooksDir, name), "utf8"));
    expect(config).toMatchObject({ version: "v1", hooks: expect.any(Array) });
    const { hooks } = config as { hooks: unknown[] };
    for (const hook of hooks) {
      expect(hook).toMatchObject({
        name: expect.any(String),
        trigger: expect.any(String),
        action: { type: expect.stringMatching(/^(command|agent)$/) },
      });
    }
  });
});
