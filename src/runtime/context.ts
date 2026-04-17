import {
  createStagingBuffer,
  type IntentEvent,
  type ObservableDataModel,
  type Catalog,
} from "@json-ui/core";
import { createNCObserver } from "../observer";
import type { NCCatalogVersion, NCIntentHandler, NCRuntime } from "../types";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catalog: Catalog<any, any, any>;
  /** Optional version string threaded through every emitted IntentEvent. */
  catalogVersion?: NCCatalogVersion;
}

const NO_HANDLER_WARNING =
  "[NC runtime] emitIntent called before setIntentHandler; ignoring. " +
  "Make sure NCApp has mounted and called setIntentHandler in its useEffect " +
  "before any action can fire.";

/**
 * Create an NC runtime handle. Creates a fresh StagingBuffer via
 * @json-ui/core's createStagingBuffer factory, holds a mutable slot
 * for the intent handler (wired later via setIntentHandler), and
 * gates every emit through a backpressure flag (NC Invariant 10 —
 * new intents are rejected while one is in flight).
 *
 * The factory is async to leave room for future initialization
 * steps (e.g., hydrating a persisted staging buffer, handshaking
 * with a remote orchestrator). The current implementation returns
 * synchronously-available data but keeps the signature async.
 */
export async function createNCRuntime(
  options: CreateNCRuntimeOptions,
): Promise<NCRuntime> {
  const stagingBuffer = createStagingBuffer();
  const observer = createNCObserver({
    catalog: options.catalog,
    staging: stagingBuffer,
    data: options.durableStore,
    catalogVersion: options.catalogVersion,
  });
  let intentHandler: NCIntentHandler | null = null;
  let intentInFlight = false;
  let destroyed = false;

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
      // NC Invariant 10: reject (and log) rather than queue. The user's
      // UI should disable the Submit button while an intent is in flight,
      // but the runtime enforces the contract defensively even if the
      // UI drops the guard.
      console.warn(
        `[NC runtime] Rejected in-flight intent: ${event.action_name}`,
      );
      return;
    }
    // Capture the current handler before awaiting. If setIntentHandler
    // is called again during the handler's execution, the in-flight
    // call still runs against its original handler — swaps take effect
    // on the next emit.
    const currentHandler = intentHandler;
    intentInFlight = true;
    try {
      await currentHandler(event);
    } finally {
      intentInFlight = false;
    }
  };

  const setIntentHandler = (handler: NCIntentHandler): void => {
    if (destroyed) {
      console.warn(
        "[NC runtime] setIntentHandler called after destroy; ignoring.",
      );
      return;
    }
    intentHandler = handler;
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    intentHandler = null;
    observer.destroy();
    // The durableStore is caller-owned; we don't dispose it here.
    // If it's a memoryjs adapter, the caller disposes it via
    // adapter.dispose() after runtime.destroy().
  };

  return {
    stagingBuffer,
    durableStore: options.durableStore,
    observer,
    emitIntent,
    setIntentHandler,
    destroy,
  };
}
