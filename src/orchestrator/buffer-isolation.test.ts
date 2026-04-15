import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";

// NC Invariant 7: the orchestrator module must not import from
// @json-ui/react, react, react-dom, or src/renderer/ / src/app/.
// The orchestrator only sees IntentEvent objects from @json-ui/core
// and never touches the rendering layer directly.
const FORBIDDEN_IMPORTS: ReadonlyArray<RegExp> = [
  /from\s+["']@json-ui\/react["']/,
  /from\s+["']react["']/,
  /from\s+["']react-dom["']/,
  /from\s+["']\.\.\/renderer["']/,
  /from\s+["']\.\.\/renderer\//,
  /from\s+["']\.\.\/app["']/,
  /from\s+["']\.\.\/app\//,
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
