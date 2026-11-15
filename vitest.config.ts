import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "scripts", include: ["scripts/**/*.test.ts"] } },
      "packages/*",
      "apps/*",
      "examples/*",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      exclude: ["**/dist/**", "**/*.config.*", "**/test/**", "**/*.test.ts"],
    },
  },
});
