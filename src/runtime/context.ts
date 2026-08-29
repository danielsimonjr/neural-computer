// SPDX-License-Identifier: Apache-2.0

import {
  createStagingBuffer,
  type IntentEvent,
  type ObservableDataModel,
} from "@json-ui/core";
import type { HeadlessRegistry } from "@json-ui/headless";
import { createNCObserver } from "../observer";
import {
  NC_OBSERVER_STALE_THRESHOLD,
  NC_SNAPSHOT_MAX_BYTES,
  NC_STAGING_MAX_FIELDS,
} from "../catalog/limits";
import { asNCCatalogVersion } from "../types";
import type {
  AnyCatalog,
  NCCatalogVersion,
  NCIntentHandler,
  NCRuntime,
} from "../types";
import { NC_CATALOG_VERSION } from "../catalog";

/**
 * Options for createNCRuntime. The caller supplies an
 * ObservableDataModel (typically built from memoryjs via
 * createObservableDataModelFromGraph, or from core's in-memory
 * createObservableDataModel for tests).
 *
 * The intent handler is NOT part of the options — it is installed
 * later via runtime.setIntentHandler. This matches the React
 * lifecycle: the runtime is created synchronously at app start, but
 * the setTree reference the handler captures only exists after the
 * React app mounts and useState runs. NCApp handles this wiring
 * internally.
 *
 * The runtime owns the staging buffer — it creates a fresh one per
 * call. The durable store is caller-owned because memoryjs adapters
 * are built asynchronously from a ManagerContext and their lifetime
 * exceeds the runtime's lifetime (the caller can rebuild the runtime
 * without tearing down the underlying graph).
 */
export interface CreateNCRuntimeOptions {
  /** Caller-owned ObservableDataModel (from memoryjs or core). */
  durableStore: ObservableDataModel;
  /**
   * Catalog used by the LLM observer's headless renderer. Must be the SAME
   * catalog NCRenderer uses to validate trees, so the observer renders the
   * same post-Zod-strip tree that reconcile walks. @json-ui/headless binds
   * the catalog at factory construction (renderer.ts:27), not per-render.
   */
  catalog: AnyCatalog;
  /**
   * Version string stored on the runtime and identity-checked against
   * NCRenderer's catalogVersion prop. Defaults to NC_CATALOG_VERSION.
   */
  catalogVersion?: NCCatalogVersion;
  /**
   * Additional headless registry entries merged *under* ncHeadlessRegistry
   * (builtins always win). Use this when extraRegistry adds React types
   * so the observer can shadow them too (Invariant 12).
   */
  extraHeadlessRegistry?: HeadlessRegistry;
  /**
   * Fired when observer consecutive failures reach
   * NC_OBSERVER_STALE_THRESHOLD. The observer keeps serving last-good.
   */
  onObserverStale?: (consecutiveFailures: number, lastPassId: number) => void;
}

const NO_HANDLER_WARNING =
  "[NC runtime] emitIntent called before setIntentHandler; ignoring. " +
  "Make sure NCApp has mounted and called setIntentHandler in its useEffect " +
  "before any action can fire.";

function payloadOverBudget(event: IntentEvent): string | null {
  const snap = event.staging_snapshot;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const fieldCount = Object.keys(snap).length;
    if (fieldCount > NC_STAGING_MAX_FIELDS) {
      return `staging snapshot has ${fieldCount} fields (max ${NC_STAGING_MAX_FIELDS})`;
    }
  }
  try {
    const bytes =
      JSON.stringify(event.staging_snapshot ?? {}).length +
      JSON.stringify(event.action_params ?? {}).length;
    if (bytes > NC_SNAPSHOT_MAX_BYTES) {
      return `intent payload is ${bytes} bytes (max ${NC_SNAPSHOT_MAX_BYTES})`;
    }
  } catch {
    return "intent payload is not JSON-serializable";
  }
  return null;
}

/**
 * Create an NC runtime handle. Creates a fresh StagingBuffer via
 * @json-ui/core's createStagingBuffer factory, holds a mutable slot
 * for the intent handler (wired later via setIntentHandler), and
 * gates every emit through a backpressure flag (NC Invariant 10 —
 * new intents are rejected while one is in flight).
 *
 * Synchronous: there is no I/O to wait on. Callers that `await` the
 * result still work because a non-Promise value is thenable-compatible
 * with await.
 */
export function createNCRuntime(options: CreateNCRuntimeOptions): NCRuntime {
  const catalogVersion = options.catalogVersion
    ? asNCCatalogVersion(options.catalogVersion)
    : NC_CATALOG_VERSION;
  const stagingBuffer = createStagingBuffer();
  const observer = createNCObserver({
    catalog: options.catalog,
    staging: stagingBuffer,
    data: options.durableStore,
    catalogVersion,
    extraRegistry: options.extraHeadlessRegistry,
    onStale: options.onObserverStale,
  });
  let intentHandler: NCIntentHandler | null = null;
  let intentInFlight = false;
  let destroyed = false;
  let generation = 0;
  const flightListeners = new Set<() => void>();

  const notifyFlight = (): void => {
    for (const listener of flightListeners) listener();
  };

  const setInFlight = (next: boolean): void => {
    if (intentInFlight === next) return;
    intentInFlight = next;
    notifyFlight();
  };

  const emitIntent = async (event: IntentEvent): Promise<void> => {
    if (destroyed) {
      console.warn("[NC runtime] emitIntent called after destroy; ignoring.");
      return;
    }
    if (intentHandler === null) {
      console.warn(NO_HANDLER_WARNING);
      return;
    }
    if (intentInFlight) {
      console.warn(
        `[NC runtime] Rejected in-flight intent: ${event.action_name}`,
      );
      return;
    }
    const over = payloadOverBudget(event);
    if (over) {
      console.warn(`[NC runtime] Dropped oversized intent: ${over}`);
      return;
    }
    const currentHandler = intentHandler;
    const boundGeneration = generation;
    setInFlight(true);
    try {
      if (event.action_name === "cancel") {
        stagingBuffer.reconcile(new Set());
      }
      if (destroyed || generation !== boundGeneration) return;
      await currentHandler(event);
    } finally {
      setInFlight(false);
    }
  };

  const setIntentHandler = (handler: NCIntentHandler): void => {
    if (destroyed) {
      console.warn(
        "[NC runtime] setIntentHandler called after destroy; ignoring.",
      );
      return;
    }
    const boundGeneration = generation;
    intentHandler = async (event: IntentEvent): Promise<void> => {
      if (destroyed || generation !== boundGeneration) return;
      await handler(event);
    };
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    generation += 1;
    intentHandler = null;
    observer.destroy();
    if (intentInFlight) setInFlight(false);
    flightListeners.clear();
  };

  return {
    stagingBuffer,
    durableStore: options.durableStore,
    observer,
    catalog: options.catalog,
    catalogVersion,
    emitIntent,
    setIntentHandler,
    isIntentInFlight: () => intentInFlight,
    subscribeIntentFlight: (listener) => {
      flightListeners.add(listener);
      return () => {
        flightListeners.delete(listener);
      };
    },
    destroy,
  };
}
