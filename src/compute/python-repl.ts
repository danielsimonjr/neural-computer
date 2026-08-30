// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import {
  NC_REPL_CONTEXT_NAME,
  NC_REPL_DEFAULT_PYTHON,
  NC_REPL_DEFAULT_TIMEOUT_MS,
  NC_REPL_MAX_CODE_BYTES,
  NC_REPL_MAX_IDENT_LENGTH,
  NC_REPL_MAX_LLM_PROMPT_BYTES,
  NC_REPL_MAX_LLM_REPLY_BYTES,
  NC_REPL_MAX_STDOUT_BYTES,
  NC_REPL_MAX_VALUE_BYTES,
  NC_REPL_PROTOCOL_VERSION,
} from "./limits";
import {
  NCReplError,
  type CreatePythonReplOptions,
  type NCPythonRepl,
  type NCReplExecResult,
} from "./types";
import { resolveWorkerPath } from "./worker-path";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_NAMES = new Set([
  "llm_query",
  "json",
  "math",
  "re",
  "__builtins__",
  "__name__",
  "__doc__",
  "True",
  "False",
  "None",
]);

const MAX_LINE_BUFFER_BYTES = 2 * 1024 * 1024;

/**
 * Minimal env + cwd for the worker. The child must not inherit host
 * secrets (`ANTHROPIC_API_KEY`, Cursor agent vars, etc.). `-I` only
 * affects Python import paths, not `os.environ`.
 */
export function createWorkerSpawnOptions(): {
  cwd: string;
  env: NodeJS.ProcessEnv;
} {
  const cwd = tmpdir();
  return {
    cwd,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      LANG: process.env.LANG ?? "C.UTF-8",
      LC_ALL: "C.UTF-8",
      TMPDIR: cwd,
      PYTHONIOENCODING: "utf-8",
    },
  };
}

interface Pending {
  id: string;
  resolve: (msg: Record<string, unknown>) => void;
  reject: (err: NCReplError) => void;
}

function assertIdent(name: string): void {
  if (
    name.length < 1 ||
    name.length > NC_REPL_MAX_IDENT_LENGTH ||
    !IDENT_RE.test(name)
  ) {
    throw new NCReplError(
      "limit",
      `invalid REPL identifier ${JSON.stringify(name)}`,
    );
  }
  if (name.startsWith("__") || RESERVED_NAMES.has(name)) {
    throw new NCReplError(
      "limit",
      `reserved REPL identifier ${JSON.stringify(name)}`,
    );
  }
}

function stringifyJson(value: unknown, maxBytes: number): string {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new NCReplError("limit", "value is not JSON-serializable");
  }
  if (text === undefined) {
    throw new NCReplError("limit", "value is not JSON-serializable");
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new NCReplError("limit", `value exceeds ${maxBytes} bytes`);
  }
  return text;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export class PythonRepl implements NCPythonRepl {
  private readonly pythonPath: string;
  private readonly timeoutMs: number;
  private readonly maxCodeBytes: number;
  private readonly maxStdoutBytes: number;
  private readonly maxValueBytes: number;
  private readonly llmQuery?: (prompt: string) => Promise<string>;
  private readonly workerPath: string;

  private child: ChildProcess | null = null;
  private pending: Pending | null = null;
  private destroyed = false;
  private ready = false;
  private lineBuf = "";
  private stderrTail = "";
  private starting: Promise<void> | null = null;

  constructor(options: CreatePythonReplOptions, workerPath: string) {
    this.pythonPath = options.pythonPath ?? NC_REPL_DEFAULT_PYTHON;
    this.timeoutMs = options.timeoutMs ?? NC_REPL_DEFAULT_TIMEOUT_MS;
    this.maxCodeBytes = options.maxCodeBytes ?? NC_REPL_MAX_CODE_BYTES;
    this.maxStdoutBytes = options.maxStdoutBytes ?? NC_REPL_MAX_STDOUT_BYTES;
    this.maxValueBytes = options.maxValueBytes ?? NC_REPL_MAX_VALUE_BYTES;
    this.llmQuery = options.llmQuery;
    this.workerPath = workerPath;
  }

  isBusy(): boolean {
    return this.pending !== null;
  }

  async exec(code: string): Promise<NCReplExecResult> {
    if (typeof code !== "string") {
      throw new NCReplError("limit", "code must be a string");
    }
    if (Buffer.byteLength(code, "utf8") > this.maxCodeBytes) {
      throw new NCReplError("limit", `code exceeds ${this.maxCodeBytes} bytes`);
    }
    const msg = await this.request({
      op: "exec",
      code,
      maxStdoutBytes: this.maxStdoutBytes,
    });
    const errorRec = asRecord(msg.error);
    return {
      ok: msg.ok === true,
      stdout: typeof msg.stdout === "string" ? msg.stdout : "",
      stderr: typeof msg.stderr === "string" ? msg.stderr : "",
      truncated: msg.truncated === true,
      error:
        errorRec &&
        typeof errorRec.type === "string" &&
        typeof errorRec.message === "string"
          ? { type: errorRec.type, message: errorRec.message }
          : undefined,
    };
  }

  async set(name: string, value: unknown): Promise<void> {
    assertIdent(name);
    const encoded = stringifyJson(value, this.maxValueBytes);
    const msg = await this.request({
      op: "set",
      name,
      value: JSON.parse(encoded) as unknown,
    });
    this.throwIfPythonFailed(msg, "set");
  }

  async get(name: string): Promise<unknown> {
    assertIdent(name);
    const msg = await this.request({
      op: "get",
      name,
      maxValueBytes: this.maxValueBytes,
    });
    this.throwIfPythonFailed(msg, "get");
    return msg.value;
  }

  loadContext(text: string): Promise<void> {
    if (typeof text !== "string") {
      return Promise.reject(
        new NCReplError("limit", "context must be a string"),
      );
    }
    return this.set(NC_REPL_CONTEXT_NAME, text);
  }

  async reset(): Promise<void> {
    const msg = await this.request({ op: "reset" });
    this.throwIfPythonFailed(msg, "reset");
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.failPending(
      new NCReplError("destroyed", "Python REPL destroy() was called"),
    );
    const starting = this.starting;
    await this.killChild();
    if (starting) {
      try {
        await starting;
      } catch {
        /* handshake may reject after we marked destroyed */
      }
      await this.killChild();
    }
  }

  async start(): Promise<void> {
    await this.ensureWorker();
  }

  private throwIfPythonFailed(msg: Record<string, unknown>, op: string): void {
    if (msg.ok === true) return;
    const errorRec = asRecord(msg.error);
    const type = typeof errorRec?.type === "string" ? errorRec.type : "Error";
    const message =
      typeof errorRec?.message === "string" ? errorRec.message : `${op} failed`;
    throw new NCReplError("python", `${type}: ${message}`);
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new NCReplError("destroyed", "Python REPL has been destroyed");
    }
  }

  private async request(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.assertNotDestroyed();
    if (this.isBusy()) {
      throw new NCReplError(
        "busy",
        "Python REPL already has an operation in flight",
      );
    }
    const id = randomUUID();
    const result = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending = { id, resolve, reject };
    });
    const timer = setTimeout(() => {
      void this.onTimeout(id);
    }, this.timeoutMs);
    try {
      await this.ensureWorker();
      this.assertNotDestroyed();
      this.write({ id, ...payload });
      return await result;
    } finally {
      clearTimeout(timer);
      if (this.pending?.id === id) this.pending = null;
    }
  }

  private write(msg: Record<string, unknown>): void {
    const stdin = this.child?.stdin;
    if (!stdin || !this.child) {
      throw new NCReplError("protocol", "Python worker stdin is not available");
    }
    try {
      stdin.write(`${JSON.stringify(msg)}\n`);
    } catch (err) {
      throw new NCReplError(
        "protocol",
        err instanceof Error
          ? `Python worker stdin write failed: ${err.message}`
          : "Python worker stdin write failed",
      );
    }
  }

  private async ensureWorker(): Promise<void> {
    if (this.destroyed) {
      throw new NCReplError("destroyed", "Python REPL has been destroyed");
    }
    if (this.child && this.child.exitCode === null && !this.starting) {
      return;
    }
    if (this.starting) {
      await this.starting;
      return;
    }
    this.starting = this.spawnWorker();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private spawnWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const child = spawn(
        this.pythonPath,
        ["-u", "-I", "-X", "utf8", this.workerPath],
        {
          stdio: ["pipe", "pipe", "pipe"],
          ...createWorkerSpawnOptions(),
        },
      );
      this.child = child;
      this.lineBuf = "";
      this.stderrTail = "";
      if (this.destroyed) {
        child.kill("SIGKILL");
        this.child = null;
        reject(new NCReplError("destroyed", "Python REPL has been destroyed"));
        return;
      }

      const fail = (err: NCReplError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };

      const timer = setTimeout(() => {
        fail(
          new NCReplError(
            "spawn",
            `Python worker did not send ready within ${this.timeoutMs}ms`,
          ),
        );
        child.kill("SIGKILL");
      }, this.timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        if (this.child !== child) return;
        this.onStdout(chunk, {
          onReady: () => {
            if (settled) return;
            settled = true;
            this.ready = true;
            clearTimeout(timer);
            resolve();
          },
          onFail: (err) => fail(err),
        });
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        this.stderrTail = (this.stderrTail + chunk.toString("utf8")).slice(
          -4096,
        );
      });

      child.on("error", (err) => {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          fail(
            new NCReplError(
              "spawn",
              `python executable not found: ${this.pythonPath}. Install Python 3.10+ or pass pythonPath.`,
            ),
          );
          return;
        }
        fail(
          new NCReplError(
            "spawn",
            `failed to spawn ${this.pythonPath}: ${err.message}`,
          ),
        );
      });

      child.on("exit", (code, signal) => {
        const wasCurrent = this.child === child;
        if (wasCurrent) this.child = null;
        if (!settled) {
          const detail = this.stderrTail.trim();
          fail(
            new NCReplError(
              "spawn",
              `Python worker exited during handshake (code=${code}, signal=${signal})${
                detail ? `: ${detail}` : ""
              }`,
            ),
          );
          return;
        }
        if (this.destroyed || !wasCurrent || !this.ready) return;
        this.failPending(
          new NCReplError(
            "protocol",
            `Python worker exited unexpectedly (code=${code}, signal=${signal})`,
          ),
        );
        if (!this.destroyed) {
          this.starting = this.spawnWorker().catch(() => {
            /* next public call retries spawn */
          });
        }
      });
    });
  }

  private onStdout(
    chunk: Buffer,
    handshake: { onReady: () => void; onFail: (err: NCReplError) => void },
  ): void {
    this.lineBuf += chunk.toString("utf8");
    if (Buffer.byteLength(this.lineBuf, "utf8") > MAX_LINE_BUFFER_BYTES) {
      this.failPending(
        new NCReplError(
          "protocol",
          "Python worker stdout exceeded line buffer",
        ),
      );
      this.child?.kill("SIGKILL");
      this.lineBuf = "";
      return;
    }
    let idx = this.lineBuf.indexOf("\n");
    while (idx !== -1) {
      const line = this.lineBuf.slice(0, idx).replace(/\r$/, "");
      this.lineBuf = this.lineBuf.slice(idx + 1);
      if (line.length > 0) this.onLine(line, handshake);
      idx = this.lineBuf.indexOf("\n");
    }
  }

  private onLine(
    line: string,
    handshake: { onReady: () => void; onFail: (err: NCReplError) => void },
  ): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.failPending(
        new NCReplError("protocol", `Python worker sent invalid JSON: ${line}`),
      );
      return;
    }
    const msg = asRecord(parsed);
    if (!msg) {
      this.failPending(
        new NCReplError("protocol", "Python worker sent a non-object line"),
      );
      return;
    }
    if (msg.op === "ready") {
      if (msg.version !== NC_REPL_PROTOCOL_VERSION) {
        handshake.onFail(
          new NCReplError(
            "protocol",
            `Python worker protocol ${String(msg.version)} != ${NC_REPL_PROTOCOL_VERSION}`,
          ),
        );
        this.child?.kill("SIGKILL");
        return;
      }
      handshake.onReady();
      return;
    }
    if (msg.op === "llm_query") {
      void this.handleLlmQuery(msg);
      return;
    }
    if (msg.op === "result") {
      const pending = this.pending;
      if (!pending) return;
      if (msg.id !== undefined && msg.id !== pending.id) {
        this.failPending(
          new NCReplError(
            "protocol",
            `Python worker result id ${String(msg.id)} != ${pending.id}`,
          ),
        );
        return;
      }
      this.pending = null;
      pending.resolve(msg);
    }
  }

  private async handleLlmQuery(msg: Record<string, unknown>): Promise<void> {
    const reply = (body: Record<string, unknown>): void => {
      if (this.destroyed || !this.child?.stdin) return;
      try {
        this.write(body);
      } catch {
        // Worker already gone; the in-flight exec will time out or fail.
      }
    };
    if (typeof msg.prompt !== "string") {
      reply({
        op: "llm_reply",
        ok: false,
        error: "llm_query prompt must be a string",
      });
      return;
    }
    if (Buffer.byteLength(msg.prompt, "utf8") > NC_REPL_MAX_LLM_PROMPT_BYTES) {
      reply({
        op: "llm_reply",
        ok: false,
        error: `llm_query prompt exceeds ${NC_REPL_MAX_LLM_PROMPT_BYTES} bytes`,
      });
      return;
    }
    if (!this.llmQuery) {
      reply({
        op: "llm_reply",
        ok: false,
        error: "llm_query is not configured",
      });
      return;
    }
    try {
      const raw = await this.llmQuery(msg.prompt);
      const text = typeof raw === "string" ? raw : String(raw);
      if (Buffer.byteLength(text, "utf8") > NC_REPL_MAX_LLM_REPLY_BYTES) {
        reply({
          op: "llm_reply",
          ok: false,
          error: `llm_query reply exceeds ${NC_REPL_MAX_LLM_REPLY_BYTES} bytes`,
        });
        return;
      }
      reply({
        op: "llm_reply",
        ok: true,
        text,
      });
    } catch (err) {
      reply({
        op: "llm_reply",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async onTimeout(id: string): Promise<void> {
    if (this.pending?.id !== id) return;
    this.failPending(
      new NCReplError(
        "timeout",
        `Python REPL operation exceeded ${this.timeoutMs}ms; worker was killed and will respawn empty`,
      ),
    );
    if (this.destroyed) return;
    await this.killChild();
    if (this.destroyed) return;
    try {
      await this.ensureWorker();
    } catch {
      // Next public call will retry spawn or throw spawn.
    }
  }

  private failPending(err: NCReplError): void {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(err);
  }

  private killChild(): Promise<void> {
    this.ready = false;
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        done();
      }, this.timeoutMs);
      child.once("exit", done);
      child.kill("SIGKILL");
    });
  }
}

export async function createPythonRepl(
  options: CreatePythonReplOptions = {},
): Promise<NCPythonRepl> {
  const workerPath = resolveWorkerPath();
  const repl = new PythonRepl(options, workerPath);
  try {
    await repl.start();
    return repl;
  } catch (err) {
    await repl.destroy();
    throw err;
  }
}
