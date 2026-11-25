import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootPackageJson = new URL("../../../../package.json", import.meta.url);

function readMeasureScript(): string {
  const parsed: unknown = JSON.parse(readFileSync(rootPackageJson, "utf8"));
  const scripts = (parsed as { scripts?: Record<string, unknown> }).scripts;
  const measure = scripts?.measure;
  if (typeof measure !== "string") {
    throw new Error("root package.json has no string script 'measure'");
  }
  return measure;
}

describe("root measure script", () => {
  it("9.12 the measure script runs the trick-or-test measure command", () => {
    expect(readMeasureScript()).toContain("trick-or-test measure");
  });

  it("9.12 the measure script attacks examples/pricing", () => {
    expect(readMeasureScript()).toContain("--project examples/pricing");
  });

  it("9.12 the measure script uses the cart-pricing spec", () => {
    expect(readMeasureScript()).toContain("--spec cart-pricing");
  });

  it("9.14 the measure script writes into the reports directory", () => {
    expect(readMeasureScript()).toContain("--output reports");
  });

  it("9.2 the measure script builds the engine before running the CLI", () => {
    const script = readMeasureScript();
    expect(script.indexOf("build")).toBeGreaterThanOrEqual(0);
    expect(script.indexOf("build")).toBeLessThan(script.indexOf("trick-or-test measure"));
  });
});
