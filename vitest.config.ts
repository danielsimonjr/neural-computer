import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Force all React/react-dom resolutions to NC's copy. The file: deps on
// ../JSON-UI/packages/{core,react} and ../memoryjs are installed as
// symlinks, and @json-ui/react has its own ../JSON-UI/node_modules/react
// higher in the directory tree. Node's module resolution walks UP from
// the symlinked source and finds JSON-UI's React first, producing two
// React instances in the same test run — every hook call from a rendered
// NC component throws "Cannot read properties of null (reading 'useState')"
// because the dispatcher on JSON-UI's React is null during the render.
// The alias below pins both React modules to the single copy NC installed
// at its own node_modules/react, so every symlinked consumer resolves to
// the same instance.
const nodeModules = fileURLToPath(new URL("./node_modules", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      react: `${nodeModules}/react`,
      "react-dom": `${nodeModules}/react-dom`,
      "react-dom/client": `${nodeModules}/react-dom/client.js`,
    },
  },
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
