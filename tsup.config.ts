import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "tsup";

function copyPythonWorker() {
  const dist = join(process.cwd(), "dist");
  mkdirSync(dist, { recursive: true });
  copyFileSync(
    join(process.cwd(), "src/compute/worker.py"),
    join(dist, "worker.py"),
  );
}

const shared = {
  format: ["esm", "cjs"] as const,
  // Declarations come from tsc, not tsup: rollup-plugin-dts needs TypeScript's
  // programmatic Compiler API, which TS 7.0 does not ship. src/index.ts, src/core.ts
  // and src/react.ts are real top-level files, so tsc emits exactly the flat
  // dist/*.d.ts names the exports map already points at.
  dts: false,
  sourcemap: true,
  clean: true,
  target: "es2022" as const,
  // CJS has no import.meta; shims polyfill it so resolveWorkerPath finds dist/worker.py.
  shims: true,
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
    onSuccess: copyPythonWorker,
  }),
];
