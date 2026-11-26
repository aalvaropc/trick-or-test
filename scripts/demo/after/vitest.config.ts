// Written into the throwaway copy of examples/pricing by `npm run demo`. It differs from the
// example's own config only in `include`, which also collects extra/.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "extra/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
  },
});
