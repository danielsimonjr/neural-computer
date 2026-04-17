// Neural Computer — public entry point.
//
// The NC runtime composes @json-ui/react, @json-ui/headless, and
// @danielsimonjr/memoryjs into an LLM-driven application runtime.
// Path C (headless dual-backend) is wired in: createNCRuntime owns an
// NCObserver that shadows every successful React tree commit with a
// @json-ui/headless render over the same shared stagingBuffer and
// durableStore references. See docs/specs/ and docs/plans/ for the
// architecture.

// Catalog
export { ncStarterCatalog, NC_CATALOG_VERSION } from "./catalog";

// Types
export type {
  NCIntentHandler,
  NCCatalogVersion,
  NCObserver,
  NCRuntime,
} from "./types";

// Runtime
export {
  createNCRuntime,
  type CreateNCRuntimeOptions,
} from "./runtime";

// Memory
export {
  defaultNCProjection,
  type NCProjectedData,
  type NCProjectedEntity,
} from "./memory";

// Renderer (React surface)
export {
  NCRenderer,
  NCContainer,
  NCText,
  NCTextField,
  NCCheckbox,
  NCButton,
  useCommittedTree,
  type NCRendererProps,
  type NCComponentProps,
  type UseCommittedTreeOptions,
} from "./renderer";

// Orchestrator (intent handling — no React)
export {
  createStubIntentHandler,
  type CreateStubIntentHandlerOptions,
} from "./orchestrator";

// App (top-level React mounting component)
export { NCApp, type NCAppProps } from "./app";

// Observer (LLM observer for Path C)
export {
  createNCObserver,
  ncHeadlessRegistry,
  type CreateNCObserverOptions,
} from "./observer";
