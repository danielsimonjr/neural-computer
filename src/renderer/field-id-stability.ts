// SPDX-License-Identifier: Apache-2.0

import type { UITree } from "@json-ui/core";

const INPUT_TYPES = new Set(["TextField", "Checkbox"]);

export function collectFieldIdTypes(tree: UITree): Map<string, string> {
  const map = new Map<string, string>();
  for (const el of Object.values(tree.elements)) {
    if (!INPUT_TYPES.has(el.type)) continue;
    const id = (el.props as { id?: unknown }).id;
    if (typeof id === "string") map.set(id, el.type);
  }
  return map;
}

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

export function commitFieldIdTypes(
  history: Map<string, string>,
  next: Map<string, string>,
): void {
  for (const [id, type] of next) history.set(id, type);
}
