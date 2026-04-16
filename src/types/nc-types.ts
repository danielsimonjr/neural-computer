import type {
  IntentEvent,
  StagingBuffer,
  ObservableDataModel,
} from "@json-ui/core";

/**
 * An NC intent handler receives a fully-formed IntentEvent from the
 * React layer (via ActionProvider.onIntent) and is responsible for
 * composing the observation, invoking the LLM, and applying any
 * resulting dispatches (memoryjs transactions, new UI tree, Python
 * subprocess calls, etc.). Returns a promise that resolves when the
 * intent has been fully processed — the orchestrator uses this for
 * backpressure tracking.
 */
export type NCIntentHandler = (event: IntentEvent) => Promise<void>;

/**
 * Nominal string brand for a catalog version. NC threads this through
 * every emitted IntentEvent.catalog_version so the orchestrator can
 * validate that the LLM's tree emissions match the catalog version in
 * effect at emission time.
 */
export type NCCatalogVersion = string & { readonly __brand: "NCCatalogVersion" };

/**
 * The NC runtime — a handle to the shared state references and the
 * intent-dispatch entry point. Created once per process via
 * createNCRuntime and passed down to NCRenderer and the orchestrator
 * loop. The staging buffer and durable store are shared references
 * between the React renderer, the LLM Observer (headless renderer,
 * planned), and the orchestrator's memoryjs transactions.
 *
 * The intent handler is bound LAZILY via setIntentHandler, not at
 * construction time. This matches React's useEffect lifecycle: the
 * runtime is created synchronously at app start, but the setTree
 * reference the stub handler needs only exists after the React app
 * mounts and useState runs. NCApp handles this wiring internally so
 * most callers never touch setIntentHandler directly.
 */
export interface NCRuntime {
  /** Shared staging buffer for in-progress user input. */
  stagingBuffer: StagingBuffer;
  /** Memoryjs-backed (or in-memory) ObservableDataModel for durable state. */
  durableStore: ObservableDataModel;
  /**
   * Emit an IntentEvent through NC's backpressure gate. The returned
   * promise always resolves (never rejects): if another intent is
   * already in flight, the event is dropped with a warning (NC
   * Invariant 10). If no handler has been bound via setIntentHandler,
   * also dropped with a warning. Otherwise resolves when the bound
   * handler finishes. Handler rejections propagate out through this
   * promise — NCRenderer's onIntent attaches a .catch so they surface
   * as diagnostics instead of unhandled rejections.
   */
  emitIntent: (event: IntentEvent) => Promise<void>;
  /**
   * Install (or replace) the intent handler. The React app calls
   * this in a useEffect after useState has provided a setTree
   * reference that the handler can capture. Installing a second
   * handler replaces the first immediately; any in-flight intent
   * continues to run with the old handler until it resolves.
   */
  setIntentHandler: (handler: NCIntentHandler) => void;
  /** Release resources. Idempotent. */
  destroy: () => void;
}
