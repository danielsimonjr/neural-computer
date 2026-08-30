// SPDX-License-Identifier: Apache-2.0

import {
  NC_DURABLE_PATH_MAX_LENGTH,
  NC_DURABLE_PATH_MAX_SEGMENTS,
  NC_RESERVED_FIELD_IDS,
} from "./limits";

/**
 * Durable-store paths are `/`-separated. Empty paths are a no-op in
 * JSON-UI's in-memory store but must not look like a successful LLM
 * write. Reserved segments (`__proto__`, `constructor`, `prototype`)
 * would walk onto `Object.prototype` via `setAtPath`.
 */
export function isSafeDurablePath(path: string): boolean {
  if (path.length < 1 || path.length > NC_DURABLE_PATH_MAX_LENGTH) return false;
  const segments = path.split("/").filter((seg) => seg.length > 0);
  if (segments.length === 0) return false;
  if (segments.length > NC_DURABLE_PATH_MAX_SEGMENTS) return false;
  for (const seg of segments) {
    if (NC_RESERVED_FIELD_IDS.has(seg)) return false;
  }
  return true;
}
