// SPDX-License-Identifier: Apache-2.0

import type {
  IntentEvent,
  StagingBuffer,
  ObservableDataModel,
  UITree,
  AnyCatalog,
} from "@json-ui/core";
import type { NormalizedNode } from "@json-ui/headless";

/**
 * Re-export of `@json-ui/core`'s `AnyCatalog`. Method variance makes a
 * specific `Catalog<MyComponents>` unassignable to the default `Catalog`
 * type; hosts that store a catalog on `NCRuntime` use this alias.
 */
export type { AnyCatalog };

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
 * Nominal string brand for a catalog version. Construct values with
 * {@link asNCCatalogVersion} so empty / oversized strings cannot sneak
 * through a bare `as` cast at the runtime boundary.
 */
export type NCCatalogVersion = string & {
  readonly __brand: "NCCatalogVersion";
};

const NC_CATALOG_VERSION_MAX = 64;

export function isNCCatalogVersion(value: unknown): value is NCCatalogVersion {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= NC_CATALOG_VERSION_MAX
  );
}

/**
 * Runtime-checked constructor for {@link NCCatalogVersion}. Throws if the
 * string is empty or longer than 64 characters.
 */
export function asNCCatalogVersion(value: string): NCCatalogVersion {
  if (!isNCCatalogVersion(value)) {
    throw new Error(
      `[NC] Invalid catalog version (non-empty, max ${NC_CATALOG_VERSION_MAX} chars): ${JSON.stringify(value)}`,
    );
  }
  return value;
}

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
   * or null if no render has completed yet. The graph is deeply frozen;
   * mutating it is a no-op in strict mode and a TypeError in some engines.
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
   * "html"        → fallback-only diagnostic HTML. NOT safe for assignment
   *                 to `innerHTML` or `dangerouslySetInnerHTML`: it may
   *                 contain user staging values and LLM-emitted text.
   *                 Treat the string as untrusted. Returns null if no
   *                 render has completed, or if `format` is not recognized.
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
 * between the React renderer, the LLM observer (a runtime-owned
 * @json-ui/headless session; see runtime.observer), and the
 * orchestrator's memoryjs transactions.
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
   * Catalog bound at construction. NCRenderer MUST pass this same
   * reference as its `catalog` prop (identity check at render time).
   */
  catalog: AnyCatalog;
  /**
   * Version string the runtime threads into the observer and that
   * NCRenderer must echo into JSONUIProvider. Identity-checked against
   * the NCRenderer `catalogVersion` prop.
   */
  catalogVersion: NCCatalogVersion;
  /**
   * Emit an IntentEvent through NC's backpressure gate.
   *
   * The returned promise:
   * - Resolves (does not reject) when the event is dropped: no handler
   *   bound, already in flight (Invariant 10), or called after destroy.
   * - Rejects when a bound handler rejects or throws. NCRenderer's
   *   onIntent attaches a .catch so those surface as diagnostics
   *   instead of unhandled rejections.
   */
  emitIntent: (event: IntentEvent) => Promise<void>;
  /**
   * Install (or replace) the intent handler. The React app calls
   * this in a useEffect after useState has provided a setTree
   * reference that the handler can capture. Installing a second
   * handler replaces the first immediately; any in-flight intent
   * continues to run with the old handler until it resolves.
   * Pass a no-op on unmount so a late handler cannot call setTree.
   */
  setIntentHandler: (handler: NCIntentHandler) => void;
  /** True while a handler invocation is awaiting. */
  isIntentInFlight: () => boolean;
  /**
   * Subscribe to in-flight flag changes. Returns an unsubscribe
   * function. Used by NCRenderer via useSyncExternalStore so buttons
   * can disable while an intent is running.
   */
  subscribeIntentFlight: (listener: () => void) => () => void;
  /**
   * Release resources. Idempotent. Increments an internal generation so
   * a handler installed before destroy is not invoked after destroy, and
   * clears the in-flight flag so the UI is not stuck. An already-running
   * handler body cannot be aborted (Promises have no cancel); NCApp
   * additionally no-ops setTree after unmount. Further emitIntent /
   * setIntentHandler calls are ignored.
   */
  destroy: () => void;
}
