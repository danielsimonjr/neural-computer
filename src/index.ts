// SPDX-License-Identifier: Apache-2.0

/**
 * Neural Computer — public entry point.
 *
 * v1 is a catalog-constrained React UI runtime with a staging buffer,
 * a one-at-a-time intent gate, a stub intent handler, and a headless
 * observer cache. It is not yet an LLM-backed or Python-REPL runtime;
 * those remain follow-up specs. Import `neural-computer/core` from
 * Node to avoid the React graph.
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
