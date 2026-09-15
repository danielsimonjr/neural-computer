// SPDX-License-Identifier: Apache-2.0

/**
 * Why one REPL operation failed. `busy` means a second call arrived
 * while one was in flight. `destroyed` means the REPL is closed.
 * `spawn` means the interpreter did not start. `timeout` means the
 * wall-clock budget expired and the worker was killed. `protocol`
 * means the worker sent a malformed message. `limit` means an input or
 * an output exceeded its byte cap. `python` means the worker raised.
 */
export type NCReplErrorCode =
  "busy" | "destroyed" | "spawn" | "timeout" | "protocol" | "limit" | "python";

/**
 * An infrastructure failure of the REPL, carrying a machine-readable
 * {@link NCReplErrorCode}. User-code failures do not throw this: they
 * resolve as an {@link NCReplExecResult} with `ok: false`.
 */
export class NCReplError extends Error {
  readonly code: NCReplErrorCode;

  constructor(code: NCReplErrorCode, message: string) {
    super(message);
    this.name = "NCReplError";
    this.code = code;
  }
}

/** Options for {@link createPythonRepl}. Every field has a default. */
export interface CreatePythonReplOptions {
  /** Interpreter binary. Default `python3`. */
  pythonPath?: string;
  /** Wall clock per exec/set/get/reset. Default 5000ms. */
  timeoutMs?: number;
  maxCodeBytes?: number;
  maxStdoutBytes?: number;
  maxValueBytes?: number;
  /**
   * Host implementation of the in-REPL `llm_query(prompt)` helper.
   * Omitted: the worker raises if user code calls it.
   */
  llmQuery?: (prompt: string) => Promise<string>;
}

/**
 * The result of one `exec`. `ok` is false when the user code raised;
 * `error` then names the Python exception. `truncated` is true when
 * `stdout` hit the byte cap.
 */
export interface NCReplExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  truncated: boolean;
  error?: { type: string; message: string };
}

/**
 * A persistent Python worker. The worker runs one operation at a time:
 * a second call while one is in flight throws `NCReplError("busy")`.
 * This is a tool for the orchestrator, not a field on `NCRuntime`.
 */
export interface NCPythonRepl {
  exec(code: string): Promise<NCReplExecResult>;
  set(name: string, value: unknown): Promise<void>;
  get(name: string): Promise<unknown>;
  /** `set(NC_REPL_CONTEXT_NAME, text)` — the RLM "prompt as a variable" helper. */
  loadContext(text: string): Promise<void>;
  reset(): Promise<void>;
  isBusy(): boolean;
  destroy(): Promise<void>;
}
