import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FontLicences } from "../../src/app/FontLicences";
import { imFellEnglishLicence, jetBrainsMonoLicence } from "../../src/fonts/licences";

const here = dirname(fileURLToPath(import.meta.url));
const viewerRoot = join(here, "..", "..");

function cssFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...cssFiles(full));
    } else if (entry.name.endsWith(".css")) {
      found.push(full);
    }
  }
  return found;
}

describe("font licences", () => {
  it("10.3 both licence texts render and contain SIL Open Font License", () => {
    const { container } = render(<FontLicences />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(imFellEnglishLicence).toContain("SIL Open Font License");
    expect(jetBrainsMonoLicence).toContain("SIL Open Font License");
    const headings = screen.getAllByRole("heading");
    expect(headings.map((h) => h.textContent)).toEqual(["IM Fell English", "JetBrains Mono"]);
    const text = details?.textContent ?? "";
    expect(text).toContain(imFellEnglishLicence.trim().slice(0, 40));
    expect(text).toContain(jetBrainsMonoLicence.trim().slice(0, 40));
    expect(within(details as HTMLElement).getAllByText(/SIL Open Font License/)).toHaveLength(2);
  });

  it("10.3 no remote font URL in index.html or any CSS under src", () => {
    const files = [join(viewerRoot, "index.html"), ...cssFiles(join(viewerRoot, "src"))];
    expect(files.length).toBeGreaterThan(1);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/https?:\/\//);
    }
  });

  it("12.16 there is no public/fonts directory", () => {
    expect(existsSync(join(viewerRoot, "public", "fonts"))).toBe(false);
  });
});
