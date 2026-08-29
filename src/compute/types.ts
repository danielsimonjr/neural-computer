// SPDX-License-Identifier: Apache-2.0

export type NCReplErrorCode =
  "busy" | "destroyed" | "spawn" | "timeout" | "protocol" | "limit" | "python";

export class NCReplError extends Error {
  readonly code: NCReplErrorCode;

  constructor(code: NCReplErrorCode, message: string) {
    super(message);
    this.name = "NCReplError";
    this.code = code;
  }
}

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

export interface NCReplExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  truncated: boolean;
  error?: { type: string; message: string };
}

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
