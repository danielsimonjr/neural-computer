import { defineConfig } from "tsup";

const shared = {
  format: ["esm", "cjs"] as const,
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022" as const,
};

export default [
  defineConfig({
    ...shared,
    entry: { index: "src/index.ts", react: "src/react.ts" },
    banner: { js: '"use client";' },
  }),
  defineConfig({
    ...shared,
    clean: false,
    entry: { core: "src/core.ts" },
  }),
];
