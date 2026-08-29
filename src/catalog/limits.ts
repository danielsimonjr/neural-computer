// SPDX-License-Identifier: Apache-2.0

/**
 * Caps for catalog strings and staging-bound input. Unbounded LLM-emitted
 * or user-pasted strings otherwise become unbounded IntentEvent snapshots
 * and observer JSON (see docs/audits NC-016).
 */
export const NC_FIELD_ID_MAX_LENGTH = 128;
export const NC_STRING_MAX_LENGTH = 8192;
export const NC_ACTION_PARAM_MAX_KEYS = 32;
/** Max staging field ids on a single IntentEvent snapshot. */
export const NC_STAGING_MAX_FIELDS = 64;
/** Max JSON.stringify byte length of staging_snapshot + action_params. */
export const NC_SNAPSHOT_MAX_BYTES = 256 * 1024;
/** Max options on a Select component. */
export const NC_SELECT_MAX_OPTIONS = 64;

/** Consecutive observer failures before the runtime logs a stale warning. */
export const NC_OBSERVER_STALE_THRESHOLD = 3;

export const NC_STARTER_ACTIONS = ["submit_form", "cancel"] as const;
export type NCStarterActionName = (typeof NC_STARTER_ACTIONS)[number];

export const NC_RESERVED_FIELD_IDS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
