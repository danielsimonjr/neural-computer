// Neural Computer — public entry point.
//
// The NC runtime composes @json-ui/react and @danielsimonjr/memoryjs
// into an LLM-driven application runtime. @json-ui/headless dual-backend
// integration is planned but not in v1 — the primitives (shared
// stagingBuffer and durableStore references on NCRuntime) are shaped
// for it, but no v1 code mounts a headless session.
// See docs/specs/ and docs/plans/ for the architecture.

// Catalog
export { ncStarterCatalog, NC_CATALOG_VERSION } from "./catalog";

// Types
export type {
  NCIntentHandler,
  NCCatalogVersion,
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
