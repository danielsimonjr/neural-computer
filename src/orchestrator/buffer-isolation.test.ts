import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";

// NC Invariant 7: the orchestrator module must not import from
// @json-ui/react, @json-ui/headless, react, react-dom, or
// src/renderer/ / src/app/ / src/observer/. The orchestrator only sees
// IntentEvent objects from @json-ui/core and never touches the
// rendering layer directly. It reads runtime.observer via the NCRuntime
// handle passed to its handler, but must NOT couple to the observer
// module directly — that backdoor would let orchestrator code call
// createNCObserver or bypass runtime.observer's disposal semantics.
const FORBIDDEN_IMPORTS: ReadonlyArray<RegExp> = [
  /from\s+["']@json-ui\/react["']/,
  /from\s+["']@json-ui\/headless["']/,
  /from\s+["']react["']/,
  /from\s+["']react-dom["']/,
  /from\s+["']\.\.\/renderer["']/,
  /from\s+["']\.\.\/renderer\//,
  /from\s+["']\.\.\/app["']/,
  /from\s+["']\.\.\/app\//,
  /from\s+["']\.\.\/observer["']/,
  /from\s+["']\.\.\/observer\//,
];

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await collectTsFiles(full)));
    } else if (
      (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) &&
      !e.name.endsWith(".test.ts") &&
      !e.name.endsWith(".test.tsx")
    ) {
      files.push(full);
    }
  }
  return files;
}

describe("NC Invariant 7: orchestrator buffer isolation", () => {
  it("no non-test file under src/orchestrator/ imports React or the renderer/app layers", async () => {
    const orchestratorDir = join(process.cwd(), "src/orchestrator");
    const files = await collectTsFiles(orchestratorDir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      for (const pattern of FORBIDDEN_IMPORTS) {
        expect(
          pattern.test(content),
          `${file} must not match forbidden import pattern ${pattern}`,
        ).toBe(false);
      }
    }
  });
});
