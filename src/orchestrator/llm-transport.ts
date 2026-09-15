// SPDX-License-Identifier: Apache-2.0

/** Author of one message in the tool loop. NC sends no system role here. */
export type NCLlmRole = "user" | "assistant";

/** A plain text block in a message. */
export type NCLlmTextContent = { type: "text"; text: string };

/**
 * A model request to call one tool. `id` correlates the call with the
 * matching {@link NCLlmToolResultContent}. `input` stays `unknown`
 * because the handler validates it against the tool schema.
 */
export type NCLlmToolUseContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

/**
 * The host answer to one {@link NCLlmToolUseContent}. `tool_use_id`
 * must equal the `id` of that call. `is_error` marks a rejected call,
 * for example a tree that fails catalog validation.
 */
export type NCLlmToolResultContent = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

/** Any content block that a message can carry. */
export type NCLlmContent =
  NCLlmTextContent | NCLlmToolUseContent | NCLlmToolResultContent;

/** One turn in the tool loop: a role plus its content blocks. */
export interface NCLlmMessage {
  role: NCLlmRole;
  content: NCLlmContent[];
}

/**
 * One tool that the handler advertises to the model. `input_schema` is
 * a JSON Schema object; the transport passes it to the provider as is.
 */
export interface NCLlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** The transport-neutral request for one model round. */
export interface NCLlmCompleteRequest {
  system: string;
  messages: NCLlmMessage[];
  tools: NCLlmTool[];
}

/** The transport-neutral result of one model round. */
export interface NCLlmCompleteResponse {
  content: NCLlmContent[];
}

/**
 * One model round. Tests inject a fake; production uses
 * {@link createAnthropicTransport}.
 */
export interface NCLlmTransport {
  complete(request: NCLlmCompleteRequest): Promise<NCLlmCompleteResponse>;
}

/**
 * Why one intent failed. `transport` is a provider or network failure.
 * `no_commit` means the model stopped without calling `commit_ui_tree`.
 * `invalid_tree` means the committed tree failed catalog validation.
 * `round_limit` means the loop reached `maxRounds`. `observation` means
 * the observation exceeded its byte cap after truncation.
 */
export type NCLlmErrorCode =
  "transport" | "no_commit" | "invalid_tree" | "round_limit" | "observation";

/**
 * An intent-loop failure that carries a machine-readable
 * {@link NCLlmErrorCode}. Callers branch on `code`, not on the message.
 */
export class NCLlmError extends Error {
  readonly code: NCLlmErrorCode;

  constructor(code: NCLlmErrorCode, message: string) {
    super(message);
    this.name = "NCLlmError";
    this.code = code;
  }
}
