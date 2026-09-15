// SPDX-License-Identifier: Apache-2.0

import type { UITree } from "@json-ui/core";

const INPUT_TYPES = new Set(["TextField", "Checkbox", "Select"]);

/**
 * Map every input field id in `tree` to its component type. Only
 * TextField, Checkbox and Select carry a staging-bound field id, so the
 * walk skips every other element.
 */
export function collectFieldIdTypes(tree: UITree): Map<string, string> {
  const map = new Map<string, string>();
  for (const el of Object.values(tree.elements)) {
    if (!INPUT_TYPES.has(el.type)) continue;
    const id = (el.props as { id?: unknown }).id;
    if (typeof id === "string") map.set(id, el.type);
  }
  return map;
}

/**
 * Raised when one field id changes component type between trees. A
 * staging value written as one type must not be read back as another,
 * so the renderer rejects the tree instead of coercing the value.
 */
export class FieldIdTypeChangeError extends Error {
  constructor(
    readonly fieldId: string,
    readonly previousType: string,
    readonly nextType: string,
  ) {
    super(
      `Field id "${fieldId}" changed type from ${previousType} to ${nextType}`,
    );
    this.name = "FieldIdTypeChangeError";
  }
}

/**
 * Compare the incoming field-id types against the committed history.
 * Return the first {@link FieldIdTypeChangeError}, or null when every
 * shared id keeps its type. This function does not change `history`.
 */
export function detectFieldIdTypeChanges(
  history: Map<string, string>,
  next: Map<string, string>,
): FieldIdTypeChangeError | null {
  for (const [id, type] of next) {
    const prev = history.get(id);
    if (prev !== undefined && prev !== type) {
      return new FieldIdTypeChangeError(id, prev, type);
    }
  }
  return null;
}

/**
 * Record the field-id types of an accepted tree into `history`. Call
 * this only after {@link detectFieldIdTypeChanges} returns null.
 */
export function commitFieldIdTypes(
  history: Map<string, string>,
  next: Map<string, string>,
): void {
  for (const [id, type] of next) history.set(id, type);
}
