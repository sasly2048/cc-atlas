import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The CLI test suite shells out to a child node process and is slow
    // (~30s on first run while tsx warms up); give it a generous ceiling
    // so a slow CI box doesn't false-fail.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
    },
  },
});
