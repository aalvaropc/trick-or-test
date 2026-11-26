import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const allDeps: Record<string, string> = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
};

describe("viewer package.json", () => {
  it("12.15 dev, build, preview and test build the engine first", () => {
    for (const name of ["dev", "build", "preview", "test"]) {
      expect(pkg.scripts[name], name).toMatch(/^npm run build -w trick-or-test(\s|$)/);
    }
  });

  it("12.4 every dependency version is an exact x.y.z version", () => {
    for (const [name, version] of Object.entries(allDeps)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("12.1 lists no UI kit, CSS framework or chart library", () => {
    const banned =
      /^(@mui\/|@chakra-ui\/|@mantine\/|@radix-ui\/|@headlessui\/|@ant-design\/|antd$|react-bootstrap$|bootstrap$|tailwindcss$|@tailwindcss\/|styled-components$|@emotion\/|bulma$|recharts$|chart\.js$|react-chartjs-2$|d3($|-)|victory|@nivo\/|echarts|highcharts|plotly|apexcharts|@visx\/)/;
    for (const name of Object.keys(allDeps)) {
      expect(name, name).not.toMatch(banned);
    }
  });

  it("12.16 lists both @fontsource packages and has no public/fonts directory", () => {
    expect(allDeps["@fontsource/im-fell-english"]).toBeDefined();
    expect(allDeps["@fontsource/jetbrains-mono"]).toBeDefined();
    expect(existsSync(resolve(root, "public/fonts"))).toBe(false);
  });
});
