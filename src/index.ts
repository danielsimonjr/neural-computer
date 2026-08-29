// SPDX-License-Identifier: Apache-2.0

/**
 * Neural Computer — public entry point.
 *
 * Catalog-constrained React UI runtime with a staging buffer, a
 * one-at-a-time intent gate, a stub intent handler, a headless
 * observer cache, and a Python REPL compute arm (RLM pattern).
 * There is no LLM-backed intent handler yet. Import
 * `neural-computer/core` from Node to avoid the React graph.
 */

export {
  ncStarterCatalog,
  NC_CATALOG_VERSION,
  NC_LLM_ACCEPTANCE_CONTRACT,
  ncFieldIdSchema,
  isSafeFieldId,
  NC_FIELD_ID_MAX_LENGTH,
  NC_STRING_MAX_LENGTH,
  NC_STAGING_MAX_FIELDS,
  NC_SNAPSHOT_MAX_BYTES,
  NC_STARTER_ACTIONS,
} from "./catalog";

export type {
  NCIntentHandler,
  NCCatalogVersion,
  NCObserver,
  NCRuntime,
} from "./types";

export { asNCCatalogVersion, isNCCatalogVersion } from "./types";

export { createNCRuntime, type CreateNCRuntimeOptions } from "./runtime";

export {
  defaultNCProjection,
  type NCProjectedData,
  type NCProjectedEntity,
  type NCProjectedRelation,
} from "./memory";

export {
  NCRenderer,
  NCContainer,
  NCText,
  NCTextField,
  NCCheckbox,
  NCSelect,
  NCButton,
  useCommittedTree,
  NCErrorBoundary,
  type NCRendererProps,
  type NCComponentProps,
  type UseCommittedTreeOptions,
} from "./renderer";

export {
  createStubIntentHandler,
  submittedFieldsStillPresent,
  type CreateStubIntentHandlerOptions,
} from "./orchestrator";

export { NCApp, type NCAppProps } from "./app";

export {
  createNCObserver,
  ncHeadlessRegistry,
  type CreateNCObserverOptions,
} from "./observer";

export {
  createPythonRepl,
  resolveWorkerPath,
  NCReplError,
  NC_REPL_CONTEXT_NAME,
  NC_REPL_DEFAULT_PYTHON,
  NC_REPL_DEFAULT_TIMEOUT_MS,
  NC_REPL_MAX_CODE_BYTES,
  NC_REPL_MAX_IDENT_LENGTH,
  NC_REPL_MAX_STDOUT_BYTES,
  NC_REPL_MAX_VALUE_BYTES,
  NC_REPL_PROTOCOL_VERSION,
  type CreatePythonReplOptions,
  type NCPythonRepl,
  type NCReplExecResult,
  type NCReplErrorCode,
} from "./compute";
