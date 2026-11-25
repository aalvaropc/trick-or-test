import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "engine-e2e",
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
