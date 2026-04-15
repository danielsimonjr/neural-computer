import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: [],
    // Task 1 creates this config before any test file exists.
    // Vitest 4 exits with code 1 on "no test files found" by default,
    // which would break `npm test` during the Task 1 scaffold step.
    // Task 2 onwards add real test files; this flag just stops the
    // placeholder from blocking the bootstrap commit.
    passWithNoTests: true,
  },
});
