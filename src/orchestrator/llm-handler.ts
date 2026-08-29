// SPDX-License-Identifier: Apache-2.0

import {
  generateCatalogPrompt,
  type JSONValue,
  type UITree,
} from "@json-ui/core";
import { NC_LLM_ACCEPTANCE_CONTRACT } from "../catalog";
import type { NCPythonRepl } from "../compute";
import type { AnyCatalog, NCIntentHandler, NCRuntime } from "../types";
import { NC_LLM_DEFAULT_MAX_ROUNDS } from "./limits";
import {
  NCLlmError,
  type NCLlmContent,
  type NCLlmMessage,
  type NCLlmTool,
  type NCLlmToolUseContent,
  type NCLlmTransport,
} from "./llm-transport";
import { composeNcObservation } from "./observation";

export interface DurableWrite {
  path: string;
  value: JSONValue;
}

export interface CreateLlmIntentHandlerOptions {
  runtime: NCRuntime;
  catalog: AnyCatalog;
  onTreeCommit: (tree: UITree) => Promise<void> | void;
  transport: NCLlmTransport;
  repl?: NCPythonRepl;
  onDurableWrite?: (write: DurableWrite) => Promise<void> | void;
  maxRounds?: number;
}

const COMMIT_TOOL: NCLlmTool = {
  name: "commit_ui_tree",
  description:
    "Commit the next UI tree. The tree must validate against the catalog. Call this to finish the intent.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["tree"],
    properties: {
      tree: {
        type: "object",
        description: "A complete UITree { root, elements }",
      },
    },
  },
};

const PYTHON_EXEC_TOOL: NCLlmTool = {
  name: "python_exec",
  description:
    "Run Python in the persistent REPL. stdout is the observation. Namespace persists until python_reset or a timeout wipe.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["code"],
    properties: {
      code: { type: "string", description: "Python source to exec" },
    },
  },
};

const PYTHON_LOAD_TOOL: NCLlmTool = {
  name: "python_load_context",
  description: 'Set the REPL variable context (RLM "prompt as a variable").',
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: { text: { type: "string" } },
  },
};

const PYTHON_RESET_TOOL: NCLlmTool = {
  name: "python_reset",
  description: "Clear the REPL namespace back to json/math/re/llm_query.",
  input_schema: { type: "object", additionalProperties: false, properties: {} },
};

const DURABLE_WRITE_TOOL: NCLlmTool = {
  name: "durable_write",
  description:
    "Write a JSON value into durable state at a / path. Uses onDurableWrite if the host supplied one, otherwise ObservableDataModel.write (memoryjs onWrite) or set (in-memory store). React DataProvider cannot write the memoryjs adapter; that set() still throws.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["path", "value"],
    properties: {
      path: { type: "string" },
      value: {},
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asTree(value: unknown): UITree | null {
  if (!isRecord(value)) return null;
  if (typeof value.root !== "string") return null;
  if (!isRecord(value.elements)) return null;
  return value as unknown as UITree;
}

function toolUses(content: NCLlmContent[]): NCLlmToolUseContent[] {
  return content.filter((c): c is NCLlmToolUseContent => c.type === "tool_use");
}

function advertisedTools(options: CreateLlmIntentHandlerOptions): NCLlmTool[] {
  const tools = [COMMIT_TOOL, DURABLE_WRITE_TOOL];
  if (options.repl) {
    tools.push(PYTHON_EXEC_TOOL, PYTHON_LOAD_TOOL, PYTHON_RESET_TOOL);
  }
  return tools;
}

function toolResult(
  toolUseId: string,
  body: unknown,
  isError = false,
): NCLlmContent {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: JSON.stringify(body),
    is_error: isError || undefined,
  };
}

/**
 * LLM-backed intent handler. Same signature as the stub. Commits one
 * catalog-valid tree via onTreeCommit. Does not stream partial trees.
 */
export function createLlmIntentHandler(
  options: CreateLlmIntentHandlerOptions,
): NCIntentHandler {
  const maxRounds = options.maxRounds ?? NC_LLM_DEFAULT_MAX_ROUNDS;
  const tools = advertisedTools(options);

  return async (event) => {
    let system: string;
    let userJson: string;
    try {
      const composed = composeNcObservation({
        event,
        catalogPrompt: generateCatalogPrompt(options.catalog),
        acceptanceContract: NC_LLM_ACCEPTANCE_CONTRACT,
        catalogVersion: options.runtime.catalogVersion,
        durableSnapshot: options.runtime.durableStore.snapshot(),
        observerJson: options.runtime.observer.serialize("json-string"),
        observerStale: options.runtime.observer.getConsecutiveFailures() > 0,
      });
      system = composed.system;
      userJson = composed.userJson;
    } catch (err) {
      throw new NCLlmError(
        "observation",
        err instanceof Error ? err.message : String(err),
      );
    }

    const messages: NCLlmMessage[] = [
      { role: "user", content: [{ type: "text", text: userJson }] },
    ];

    for (let round = 0; round < maxRounds; round++) {
      let response;
      try {
        response = await options.transport.complete({
          system,
          messages,
          tools,
        });
      } catch (err) {
        throw new NCLlmError(
          "transport",
          err instanceof Error ? err.message : String(err),
        );
      }

      messages.push({ role: "assistant", content: response.content });
      const uses = toolUses(response.content);
      if (uses.length === 0) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "You must call commit_ui_tree to finish this intent.",
            },
          ],
        });
        continue;
      }

      const results: NCLlmContent[] = [];
      let committed: UITree | null = null;

      for (const use of uses) {
        const handled = await handleTool(use, options);
        results.push(handled.result);
        if (handled.committed) committed = handled.committed;
      }

      if (committed) {
        await options.onTreeCommit(committed);
        return;
      }

      messages.push({ role: "user", content: results });
    }

    throw new NCLlmError(
      "round_limit",
      `LLM did not commit a valid UI tree within ${maxRounds} rounds`,
    );
  };
}

async function handleTool(
  use: NCLlmToolUseContent,
  options: CreateLlmIntentHandlerOptions,
): Promise<{ result: NCLlmContent; committed: UITree | null }> {
  try {
    switch (use.name) {
      case "commit_ui_tree": {
        const tree = asTree(isRecord(use.input) ? use.input.tree : undefined);
        if (!tree) {
          return {
            result: toolResult(
              use.id,
              {
                ok: false,
                error: "tree must be an object with root and elements",
              },
              true,
            ),
            committed: null,
          };
        }
        const validated = options.catalog.validateTree(tree);
        if (!validated.success) {
          return {
            result: toolResult(
              use.id,
              {
                ok: false,
                error: String(
                  validated.error ?? validated.fieldIdError ?? "invalid tree",
                ),
              },
              true,
            ),
            committed: null,
          };
        }
        return {
          result: toolResult(use.id, { ok: true }),
          committed: validated.data ?? tree,
        };
      }
      case "python_exec": {
        if (!options.repl) {
          return {
            result: toolResult(
              use.id,
              { ok: false, error: "repl not configured" },
              true,
            ),
            committed: null,
          };
        }
        const code =
          isRecord(use.input) && typeof use.input.code === "string"
            ? use.input.code
            : "";
        const execResult = await options.repl.exec(code);
        return { result: toolResult(use.id, execResult), committed: null };
      }
      case "python_load_context": {
        if (!options.repl) {
          return {
            result: toolResult(
              use.id,
              { ok: false, error: "repl not configured" },
              true,
            ),
            committed: null,
          };
        }
        const text =
          isRecord(use.input) && typeof use.input.text === "string"
            ? use.input.text
            : "";
        await options.repl.loadContext(text);
        return { result: toolResult(use.id, { ok: true }), committed: null };
      }
      case "python_reset": {
        if (!options.repl) {
          return {
            result: toolResult(
              use.id,
              { ok: false, error: "repl not configured" },
              true,
            ),
            committed: null,
          };
        }
        await options.repl.reset();
        return { result: toolResult(use.id, { ok: true }), committed: null };
      }
      case "durable_write": {
        const path =
          isRecord(use.input) && typeof use.input.path === "string"
            ? use.input.path
            : "";
        const value = (isRecord(use.input) ? use.input.value : undefined) as
          JSONValue | undefined;
        const store = options.runtime.durableStore;
        if (options.onDurableWrite) {
          await options.onDurableWrite({ path, value: value as JSONValue });
        } else if (typeof store.write === "function") {
          await store.write(path, value as JSONValue);
        } else {
          store.set(path, value as JSONValue);
        }
        return { result: toolResult(use.id, { ok: true }), committed: null };
      }
      default:
        return {
          result: toolResult(
            use.id,
            { ok: false, error: `unknown tool ${use.name}` },
            true,
          ),
          committed: null,
        };
    }
  } catch (err) {
    return {
      result: toolResult(
        use.id,
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        true,
      ),
      committed: null,
    };
  }
}
