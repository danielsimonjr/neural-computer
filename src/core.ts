// SPDX-License-Identifier: Apache-2.0

/**
 * React-free entry for Node / orchestrator processes.
 * Does not import @json-ui/react or react. Includes the Python REPL
 * compute arm (worker.py is copied to dist/ next to this bundle).
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
  AnyCatalog,
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
  createStubIntentHandler,
  submittedFieldsStillPresent,
  type CreateStubIntentHandlerOptions,
  createLlmIntentHandler,
  composeNcObservation,
  createAnthropicTransport,
  createAnthropicIntentHandler,
  NCLlmError,
  NC_OBSERVATION_MAX_BYTES,
  NC_LLM_DEFAULT_MAX_ROUNDS,
  NC_LLM_DEFAULT_MAX_TOKENS,
  NC_DEFAULT_ANTHROPIC_MODEL,
  type CreateLlmIntentHandlerOptions,
  type DurableWrite,
  type NCLlmTransport,
  type NCLlmMessage,
  type NCLlmContent,
  type NCLlmTool,
  type CreateAnthropicTransportOptions,
  type NCLlmErrorCode,
} from "./orchestrator";

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
