import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const nodeModules = fileURLToPath(new URL("./node_modules", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      react: `${nodeModules}/react`,
      "react/jsx-runtime": `${nodeModules}/react/jsx-runtime.js`,
      "react/jsx-dev-runtime": `${nodeModules}/react/jsx-dev-runtime.js`,
      "react-dom": `${nodeModules}/react-dom`,
      "react-dom/client": `${nodeModules}/react-dom/client.js`,
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
