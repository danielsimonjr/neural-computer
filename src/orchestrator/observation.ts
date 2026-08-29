// SPDX-License-Identifier: Apache-2.0

import type { IntentEvent } from "@json-ui/core";
import { NC_OBSERVATION_MAX_BYTES } from "./limits";

export interface ComposeNcObservationInput {
  event: IntentEvent;
  catalogPrompt: string;
  acceptanceContract: string;
  catalogVersion: string;
  durableSnapshot: unknown;
  observerJson: string | null;
  observerStale: boolean;
  maxBytes?: number;
}

export interface NcObservation {
  system: string;
  userJson: string;
  truncated: boolean;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function stringifyUser(payload: unknown): string {
  return JSON.stringify(payload);
}

/**
 * Build the stable system prompt and the size-capped user JSON for one
 * intent. Truncates observer first, then durable; never drops `intent`.
 */
export function composeNcObservation(
  input: ComposeNcObservationInput,
): NcObservation {
  const maxBytes = input.maxBytes ?? NC_OBSERVATION_MAX_BYTES;
  const system = [
    input.catalogPrompt.trim(),
    "",
    "## Acceptance contract",
    input.acceptanceContract.trim(),
    "",
    `Catalog version: ${input.catalogVersion}`,
    "",
    "## How to finish",
    "Call commit_ui_tree with a complete catalog-valid UITree.",
    "Do not emit trees with duplicate field ids or a field id whose component type changed.",
    "Typing does not invoke you; only catalog actions do.",
  ].join("\n");

  const submitted = Object.keys(input.event.staging_snapshot ?? {});
  const base = {
    intent: {
      action_name: input.event.action_name,
      action_params: input.event.action_params ?? {},
      staging_snapshot: input.event.staging_snapshot ?? {},
      catalog_version: input.event.catalog_version,
      timestamp: input.event.timestamp,
    },
    durable: input.durableSnapshot,
    observer: input.observerJson,
    observer_stale: input.observerStale,
    submitted_field_ids: submitted,
    truncated: false,
  };

  let userJson = stringifyUser(base);
  if (byteLength(userJson) <= maxBytes) {
    return { system, userJson, truncated: false };
  }

  const withoutObserver = { ...base, observer: null, truncated: true };
  userJson = stringifyUser(withoutObserver);
  if (byteLength(userJson) <= maxBytes) {
    return { system, userJson, truncated: true };
  }

  const minimal = {
    ...withoutObserver,
    durable: { truncated: true },
  };
  userJson = stringifyUser(minimal);
  if (byteLength(userJson) > maxBytes) {
    throw new Error(
      `[NC] Observation exceeds ${maxBytes} bytes even after truncation`,
    );
  }
  return { system, userJson, truncated: true };
}
