// SPDX-License-Identifier: Apache-2.0

import Anthropic from "@anthropic-ai/sdk";
import {
  NC_DEFAULT_ANTHROPIC_MODEL,
  NC_LLM_DEFAULT_MAX_TOKENS,
} from "./limits";
import type {
  NCLlmCompleteRequest,
  NCLlmContent,
  NCLlmToolResultContent,
  NCLlmToolUseContent,
  NCLlmTransport,
} from "./llm-transport";
import {
  createLlmIntentHandler,
  type CreateLlmIntentHandlerOptions,
} from "./llm-handler";
import type { NCIntentHandler } from "../types";

/**
 * Options for {@link createAnthropicTransport}. `model` and
 * `maxTokens` fall back to the NC defaults.
 */
export interface CreateAnthropicTransportOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /**
   * Inject a send function to avoid constructing a real client (tests).
   * Production omits this and uses ANTHROPIC_API_KEY / apiKey.
   */
  send?: (
    params: Anthropic.MessageCreateParamsNonStreaming,
  ) => Promise<{ content: Anthropic.ContentBlock[] }>;
}

function toAnthropicTools(
  tools: NCLlmCompleteRequest["tools"],
): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
  }));
}

function toAnthropicMessages(
  messages: NCLlmCompleteRequest["messages"],
): Anthropic.MessageParam[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content.map((block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use" as const,
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        };
      }
      const result = block as NCLlmToolResultContent;
      return {
        type: "tool_result" as const,
        tool_use_id: result.tool_use_id,
        content: result.content,
        is_error: result.is_error,
      };
    }),
  }));
}

function fromAnthropicContent(
  content: Anthropic.ContentBlock[],
): NCLlmContent[] {
  const out: NCLlmContent[] = [];
  for (const block of content) {
    if (block.type === "text") {
      out.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      const use: NCLlmToolUseContent = {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      };
      out.push(use);
    }
  }
  return out;
}

/**
 * Build an {@link NCLlmTransport} backed by the Anthropic SDK. The
 * client is constructed once, on the first call, and only when the
 * caller supplies no `send` function.
 */
export function createAnthropicTransport(
  options: CreateAnthropicTransportOptions = {},
): NCLlmTransport {
  const model = options.model ?? NC_DEFAULT_ANTHROPIC_MODEL;
  const maxTokens = options.maxTokens ?? NC_LLM_DEFAULT_MAX_TOKENS;
  const send =
    options.send ??
    (() => {
      const client = new Anthropic({
        apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
      });
      return (params: Anthropic.MessageCreateParamsNonStreaming) =>
        client.messages.create(params);
    })();

  return {
    async complete(request) {
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model,
        max_tokens: maxTokens,
        system: request.system,
        messages: toAnthropicMessages(request.messages),
        tools: toAnthropicTools(request.tools),
      };
      const message = await send(params);
      return { content: fromAnthropicContent(message.content) };
    },
  };
}

/**
 * Build an LLM intent handler that speaks to Anthropic. This is the
 * convenience pairing of {@link createAnthropicTransport} with
 * `createLlmIntentHandler`; the transport options are split out and
 * every other option passes through unchanged.
 */
export function createAnthropicIntentHandler(
  options: Omit<CreateLlmIntentHandlerOptions, "transport"> &
    CreateAnthropicTransportOptions,
): NCIntentHandler {
  const { apiKey, model, maxTokens, send, ...rest } = options;
  return createLlmIntentHandler({
    ...rest,
    transport: createAnthropicTransport({ apiKey, model, maxTokens, send }),
  });
}
