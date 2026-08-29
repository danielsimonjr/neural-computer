// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
import { NC_FIELD_ID_MAX_LENGTH, NC_RESERVED_FIELD_IDS } from "./limits";

/**
 * Field IDs key the staging buffer. They must be non-empty, not a
 * prototype-pollution gadget, and free of path separators so they cannot
 * be confused with durable-store DynamicValue paths.
 */
export function isSafeFieldId(id: string): boolean {
  if (id.length < 1 || id.length > NC_FIELD_ID_MAX_LENGTH) return false;
  if (NC_RESERVED_FIELD_IDS.has(id)) return false;
  if (id !== id.trim()) return false;
  if (id.includes("/") || id.includes("\\")) return false;
  return true;
}

export const ncFieldIdSchema = z
  .string()
  .min(1)
  .max(NC_FIELD_ID_MAX_LENGTH)
  .refine((id) => isSafeFieldId(id), {
    message:
      "field id must be a non-empty trimmed token without path separators or reserved names (__proto__, constructor, prototype)",
  });
