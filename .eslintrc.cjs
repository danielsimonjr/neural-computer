module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: ["@typescript-eslint"],
  extends: [],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
  },
  ignorePatterns: ["dist", "node_modules", "coverage", "docs", "tools"],
  overrides: [
    {
      files: ["src/orchestrator/**/*.ts"],
      excludedFiles: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              "react",
              "react-dom",
              "react/jsx-runtime",
              "react/jsx-dev-runtime",
              "@json-ui/react",
              "@json-ui/headless",
            ],
            patterns: [
              "../renderer",
              "../app",
              "../observer",
              "../renderer/*",
              "../app/*",
              "../observer/*",
              "react/*",
              "react-dom/*",
              "@json-ui/react/*",
              "@json-ui/headless/*",
            ],
          },
        ],
      },
    },
  ],
};
