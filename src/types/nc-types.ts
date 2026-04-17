import type {
  IntentEvent,
  StagingBuffer,
  ObservableDataModel,
  UITree,
} from "@json-ui/core";
import type { NormalizedNode } from "@json-ui/headless";

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
 * The NC LLM observer. Shadows every successful React tree commit by
 * running @json-ui/headless on the same tree + shared stores, caching
 * the NormalizedNode output for the orchestrator to read when composing
 * an LLM observation. Owned by NCRuntime; never null.
 */
export interface NCObserver {
  /**
   * Called by NCRenderer after every successful tree commit. Runs the
   * headless renderer synchronously; caches the result on success,
   * leaves the previous cache intact on failure. Catalog is NOT passed
   * per-render — it was bound at observer construction via createNCObserver.
   */
  render: (tree: UITree) => void;

  /**
   * Returns the normalized tree from the most recent successful render,
   * or null if no render has completed yet.
   */
  getLastRender: () => NormalizedNode | null;

  /**
   * Monotonic counter advanced only on successful renders. Zero before
   * the first render. Pairs with getConsecutiveFailures so callers can
   * detect runaway staleness (pass ID stalled + failures increasing).
   */
  getLastRenderPassId: () => number;

  /**
   * Number of consecutive render() calls that have thrown since the
   * last successful render. Resets to 0 on each successful render.
   */
  getConsecutiveFailures: () => number;

  /**
   * Serialize the last render via @json-ui/headless built-in serializers.
   * "json-string" → JSON.stringify(lastRender) for LLM prompts.
   * "html"        → fallback-only diagnostic HTML (debug preview, not UI).
   * Callers wanting the structured NormalizedNode should use getLastRender().
   */
  serialize: (format: "json-string" | "html") => string | null;

  /** Release resources. Idempotent. Called by runtime.destroy(). */
  destroy: () => void;
}

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
  /** LLM observer: shadows every React tree commit with a headless render. */
  observer: NCObserver;
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
