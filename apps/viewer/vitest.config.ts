import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "viewer",
    environment: "jsdom",
    testTimeout: 20000,
    setupFiles: ["test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    // Fixture data is not test code; test/fixtures/fixtures.test.ts must still run.
    exclude: ["test/fixtures/**/*.{json,jsonl,txt}", "node_modules/**"],
  },
});
