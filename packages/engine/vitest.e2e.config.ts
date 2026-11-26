import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "engine-e2e",
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 120_000,
    // Both e2e files run the CLI on examples/pricing; a run removes leftover sandboxes at start.
    fileParallelism: false,
  },
});
