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

/** Handshake / protocol version the worker writes on stdout. */
export const NC_REPL_PROTOCOL_VERSION = 1;

/** RLM paper default: the prompt lives in this REPL variable. */
export const NC_REPL_CONTEXT_NAME = "context";

export const NC_REPL_DEFAULT_PYTHON = "python3";
