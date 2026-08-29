// SPDX-License-Identifier: Apache-2.0

/** Freeze an object graph so observer cache consumers cannot mutate it. */
export function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
    return value;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    freezeDeep(nested);
  }
  return value;
}

/** Null-prototype dictionary so entity names cannot pollute Object.prototype. */
export function dict<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
