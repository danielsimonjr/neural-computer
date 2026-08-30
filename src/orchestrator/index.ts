// SPDX-License-Identifier: Apache-2.0

export {
  createStubIntentHandler,
  submittedFieldsStillPresent,
  type CreateStubIntentHandlerOptions,
} from "./handle-intent";

export {
  composeNcObservation,
  type ComposeNcObservationInput,
  type NcObservation,
} from "./observation";

export {
  createLlmIntentHandler,
  type CreateLlmIntentHandlerOptions,
  type DurableWrite,
} from "./llm-handler";

export {
  NCLlmError,
  type NCLlmErrorCode,
  type NCLlmTransport,
  type NCLlmMessage,
  type NCLlmContent,
  type NCLlmTool,
  type NCLlmCompleteRequest,
  type NCLlmCompleteResponse,
} from "./llm-transport";

export {
  createAnthropicTransport,
  createAnthropicIntentHandler,
  type CreateAnthropicTransportOptions,
} from "./anthropic-transport";

export {
  NC_OBSERVATION_MAX_BYTES,
  NC_LLM_DEFAULT_MAX_ROUNDS,
  NC_LLM_MAX_ROUNDS,
  NC_LLM_MAX_TOOLS_PER_ROUND,
  NC_LLM_MAX_TOOL_RESULT_BYTES,
  NC_LLM_DEFAULT_MAX_TOKENS,
  NC_DEFAULT_ANTHROPIC_MODEL,
} from "./limits";
