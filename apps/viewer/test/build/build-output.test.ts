import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BUILD_TIMEOUT_MS = 180_000;

let outDir = "";
let html = "";
let assets: string[] = [];
let css = "";
let js = "";

function read(name: string): string {
  return readFileSync(join(outDir, "assets", name), "utf8");
}

describe("production build", () => {
  beforeAll(async () => {
    // The build must not depend on generated demo files (the folder is made by `npm run measure`).
    outDir = mkdtempSync(join(tmpdir(), "trick-or-test-build-"));
    await build({
      root,
      configFile: join(root, "vite.config.ts"),
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
    });
    html = readFileSync(join(outDir, "index.html"), "utf8");
    assets = readdirSync(join(outDir, "assets"));
    css = assets
      .filter((name) => name.endsWith(".css"))
      .map(read)
      .join("\n");
    js = assets
      .filter((name) => name.endsWith(".js"))
      .map(read)
      .join("\n");
  }, BUILD_TIMEOUT_MS);

  afterAll(() => {
    if (outDir.startsWith(join(tmpdir(), "trick-or-test-build-"))) {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("12.3 index.html references assets under /trick-or-test/", () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.startsWith("/trick-or-test/assets/"), ref).toBe(true);
    }
  });

  it("10.3 the .woff2 files of both fonts are emitted", () => {
    const woff2 = assets.filter((name) => name.endsWith(".woff2"));
    expect(woff2.some((name) => name.startsWith("im-fell-english-"))).toBe(true);
    expect(woff2.some((name) => name.startsWith("jetbrains-mono-"))).toBe(true);
  });

  it("12.11 no URL in the output points to a font CDN or another origin", () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).not.toMatch(/url\(\s*["']?\/\//);
    expect(js).not.toMatch(
      /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|cdn\.jsdelivr\.net|unpkg\.com/,
    );
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)/g)) {
      expect(match[1]?.startsWith("/trick-or-test/assets/"), match[1]).toBe(true);
    }
  });

  it("10.3 the OFL text of both fonts is in the bundle", () => {
    const licences = js.split("SIL OPEN FONT LICENSE Version 1.1").length - 1;
    expect(licences).toBeGreaterThanOrEqual(2);
    expect(js).toContain("IM Fell");
    expect(js).toContain("JetBrains");
  });

  it("12.16 public/fonts/ does not exist", () => {
    expect(existsSync(resolve(root, "public/fonts"))).toBe(false);
  });
});
