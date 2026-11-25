import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "engine",
    setupFiles: ["test/setup.ts"],
    include: ["test/**/*.test.ts"],
    exclude: ["test/e2e/**", "test/fixtures/**", "**/node_modules/**", "**/dist/**"],
  },
});
