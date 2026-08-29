// SPDX-License-Identifier: Apache-2.0

export type NCLlmRole = "user" | "assistant";

export type NCLlmTextContent = { type: "text"; text: string };

export type NCLlmToolUseContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

export type NCLlmToolResultContent = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type NCLlmContent =
  NCLlmTextContent | NCLlmToolUseContent | NCLlmToolResultContent;

export interface NCLlmMessage {
  role: NCLlmRole;
  content: NCLlmContent[];
}

export interface NCLlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface NCLlmCompleteRequest {
  system: string;
  messages: NCLlmMessage[];
  tools: NCLlmTool[];
}

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

export type NCLlmErrorCode =
  "transport" | "no_commit" | "invalid_tree" | "round_limit" | "observation";

export class NCLlmError extends Error {
  readonly code: NCLlmErrorCode;

  constructor(code: NCLlmErrorCode, message: string) {
    super(message);
    this.name = "NCLlmError";
    this.code = code;
  }
}
