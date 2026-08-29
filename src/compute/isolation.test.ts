// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const FORBIDDEN_IMPORTS: ReadonlyArray<RegExp> = [
  /(?:from|import|require)\s*\(?\s*['"]@json-ui\//,
  /(?:from|import|require)\s*\(?\s*['"]react(?:['"]|\/)/,
  /(?:from|import|require)\s*\(?\s*['"]react-dom/,
  /['"]\.\.\/renderer['"/]/,
  /['"]\.\.\/app['"/]/,
  /['"]\.\.\/observer['"/]/,
  /['"]\.\.\/runtime['"/]/,
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

describe("compute isolation", () => {
  it("no non-test file under src/compute/ imports React, renderer, observer, or runtime", async () => {
    const dir = join(process.cwd(), "src/compute");
    const files = await collectTsFiles(dir);
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
