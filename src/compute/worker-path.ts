// SPDX-License-Identifier: Apache-2.0

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NCReplError } from "./types";

/**
 * Locate worker.py next to this module (source tree) or next to the
 * bundled core entry (dist/worker.py copied by tsup).
 */
export function resolveWorkerPath(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(dir, "worker.py"),
    join(dir, "compute", "worker.py"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new NCReplError(
    "spawn",
    `NC Python worker.py not found next to ${dir}. After build it must be copied to dist/worker.py.`,
  );
}
