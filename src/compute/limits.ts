// SPDX-License-Identifier: Apache-2.0

/**
 * Caps for the Python REPL worker. Unbounded snippets and prints would
 * otherwise stall the host or grow without bound (same reason catalog
 * strings are capped).
 */

/** Per-operation wall clock. Timeout kills the worker and respawns empty. */
export const NC_REPL_DEFAULT_TIMEOUT_MS = 5_000;

export const NC_REPL_MAX_CODE_BYTES = 64 * 1024;
export const NC_REPL_MAX_STDOUT_BYTES = 64 * 1024;
export const NC_REPL_MAX_VALUE_BYTES = 256 * 1024;
export const NC_REPL_MAX_IDENT_LENGTH = 64;
/** Host-side cap on `llm_query` prompts before they reach `llmQuery`. */
export const NC_REPL_MAX_LLM_PROMPT_BYTES = 32 * 1024;
/** Host-side cap on `llm_query` replies written back to the worker. */
export const NC_REPL_MAX_LLM_REPLY_BYTES = 64 * 1024;

/** Handshake / protocol version the worker writes on stdout. */
export const NC_REPL_PROTOCOL_VERSION = 1;

/** RLM paper default: the prompt lives in this REPL variable. */
export const NC_REPL_CONTEXT_NAME = "context";

export const NC_REPL_DEFAULT_PYTHON = "python3";
