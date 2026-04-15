// Root ESLint config. Buffer-isolation rule added in Task 12.
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
  rules: {},
  ignorePatterns: ["dist", "node_modules", "coverage", "docs"],
};
