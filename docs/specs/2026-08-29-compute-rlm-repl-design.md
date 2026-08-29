# Compute Layer: RLM-Pattern Python REPL

**Status:** Active (implementation 2026-08-29).
**Date:** 2026-08-29
**Scope:** A persistent Python subprocess the orchestrator can drive. The Recursive Language Model _loop_ (model writes code until a final answer) belongs with a future LLM intent handler, not this module.
**Supersedes:** Deferred item "Python REPL subprocess dispatch" on the README roadmap and in `docs/plans/2026-04-15-neural-computer-v2-plan.md`.

## Context

Zhang, Kraska, and Khattab (MIT CSAIL), _Recursive Language Models_, treat a large prompt as a variable in a Python REPL. The model writes code against that variable; stdout is the next observation; an optional `llm_query` helper issues a recursive sub-call. NC's architecture paragraph has named this the computation arm since v1, but `src/compute/` did not exist.

This package still does not call an LLM. Compute is the subprocess and the JSON-lines protocol. A later Anthropic (or other) handler will sit in `src/orchestrator/` and call `createPythonRepl`.

## Decision

Ship an independent, React-free factory `createPythonRepl()` that owns one long-lived CPython worker. Do not attach the REPL to `NCRuntime`. The seven named UI state surfaces stay seven. Compute is a tool, like a database client, that a future handler may hold.

Four options were considered:

- **C1 — Independent factory (selected).** Callers who need a REPL construct one. `NCApp` and `NCRenderer` stay unaware of Python. Tests do not spawn a subprocess unless they import compute.
- **C2 — Field on `NCRuntime`.** Would force every render test and every `NCApp` mount to decide what to do with a child process. The renderer does not need Python.
- **C3 — Spawn per `exec`.** Matches a "run this snippet" helper, not an RLM: namespace would not survive across model turns.
- **C4 — In-process Pyodide.** No `python3` dependency, but a different language semantics, a large WASM payload, and no realistic `llm_query` blocking I/O. Out of scope.

C1 selected because the orchestrator already isolates itself from React (Invariant 7) and should be free to import compute the same way it imports memory projection helpers.

## What lives where

`src/compute/` owns the worker script, the host protocol, caps, and the public types. It imports only Node built-ins. It does not import `@json-ui/*`, React, `../renderer`, `../app`, `../observer`, or `../runtime`. The orchestrator may import compute. Compute is exported from `src/core.ts` and the root barrel, not from `src/react.ts`.

The worker is `src/compute/worker.py`. The TypeScript build copies it to `dist/worker.py` next to the bundled `core.js`, which locates it via `import.meta.url`. Tests that run against source files locate `worker.py` next to `python-repl.ts`.

## Public API

```typescript
function createPythonRepl(
  options?: CreatePythonReplOptions,
): Promise<NCPythonRepl>;

interface CreatePythonReplOptions {
  pythonPath?: string; // default "python3"
  timeoutMs?: number; // default 5000; per exec/set/get/reset
  maxCodeBytes?: number;
  maxStdoutBytes?: number;
  maxValueBytes?: number;
  llmQuery?: (prompt: string) => Promise<string>;
}

interface NCPythonRepl {
  exec(code: string): Promise<NCReplExecResult>;
  set(name: string, value: unknown): Promise<void>;
  get(name: string): Promise<unknown>;
  loadContext(text: string): Promise<void>; // set("context", text)
  reset(): Promise<void>;
  isBusy(): boolean;
  destroy(): Promise<void>;
}

interface NCReplExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  truncated: boolean;
  error?: { type: string; message: string };
}
```

`createPythonRepl` is async because it must spawn a process and wait for a `ready` handshake. That is unlike `createNCRuntime`, which is synchronous because it has no I/O.

`loadContext` is the paper's "prompt lives in a variable" helper. The variable name is the constant `NC_REPL_CONTEXT_NAME` (`"context"`).

`exec` always fulfills with an `NCReplExecResult` when the worker runs the snippet. Syntax errors and runtime exceptions are `ok: false` plus `error`. Infrastructure failures (busy, timeout, destroyed, spawn, protocol, host-side cap) throw `NCReplError`.

`set` / `get` / `reset` throw `NCReplError` on infrastructure or cap failures. A Python `NameError` on `get` is `code: "python"`.

## Protocol

JSON lines, UTF-8, one object per line, over the worker's stdin/stdout. The worker is launched as:

```
<pythonPath> -u -I -X utf8 <worker.py>
```

`-u` is unbuffered stdio. `-I` is isolated mode (ignores user site and `PYTHON*` env). `-X utf8` forces UTF-8 even under `-I`, which otherwise ignores `PYTHONIOENCODING`.

Handshake: the worker writes `{"op":"ready","version":1}` before reading. The host rejects the factory if that line does not arrive before `timeoutMs`.

Request: `{"id":"...","op":"exec"|"set"|"get"|"reset","..."}`.

Result: `{"id":"...","op":"result","ok":true|false,...}`.

During `exec`, the worker may write `{"op":"llm_query","prompt":"..."}` on the real stdout (not the captured `print` stream). The host calls `llmQuery` if configured, then writes `{"op":"llm_reply","ok":true,"text":"..."}` or `{"op":"llm_reply","ok":false,"error":"..."}`. User `print` output is captured separately and returned on the final `result`.

## Worker environment

The namespace persists across `exec` calls until `reset`, timeout-respawn, crash-respawn, or `destroy`. It contains `json`, `math`, `re`, `llm_query`, and a restricted `__builtins__` (no `eval`, `exec`, `open`, `__import__`, `getattr`/`setattr`). This is a footgun reduction, not a jail. Timeout-and-kill is the hard boundary. Production deployments that need isolation wrap `pythonPath` (container, seccomp, nsjail). See SECURITY.md.

Identifiers for `set`/`get` match `^[A-Za-z_][A-Za-z0-9_]*$`, length 1–64, no dunder prefix, not in the reserved set (`llm_query`, `json`, `math`, `re`, `__builtins__`, …).

## Caps and backpressure

Defaults: 5s timeout, 64 KiB code, 64 KiB stdout/stderr, 256 KiB JSON values. One in-flight operation at a time. A second `exec`/`set`/`get`/`reset` throws `busy` rather than queueing, matching the intent gate's "reject, don't queue" shape.

On timeout or unexpected worker exit, the host SIGKILLs the child (if still alive) and respawns an empty worker unless `destroy` has already been called. Namespace from before the kill is gone. That is documented, not a bug.

`destroy` is idempotent. It does not respawn. Later calls throw `destroyed`.

Missing `python3` (or a bad `pythonPath`) throws `spawn` with a message that names the path and says to install Python 3.10+ or pass `pythonPath`.

## What this is not

This is not an LLM. `llm_query` is a hole the host fills. If `llmQuery` is omitted and user code calls `llm_query`, the worker sees a failed reply and raises.

This is not a new named UI state surface. Staging, the tree, the observer cache, and the in-flight intent flag are unchanged.

This is not attached to `emitIntent`. A future handler may call `exec` while handling an intent; the runtime does not.

JSON-UI is not modified.

## Invariants (compute)

These are in addition to NC Invariants 1–13, which remain UI-runtime properties.

1. **Reject, don't queue.** `isBusy()` is true while an operation is in flight. A second operation throws `busy`.
2. **Timeout wipes state.** After a timeout the next successful `exec` runs in a fresh namespace.
3. **Destroy is terminal.** `destroy` then `exec` throws `destroyed`. A second `destroy` is a no-op.
4. **No React graph.** Non-test files under `src/compute/` do not import React, `@json-ui/react`, `@json-ui/headless`, `../renderer`, `../app`, or `../observer`.
5. **Stdout is the observation.** `print` during `exec` is what `NCReplExecResult.stdout` contains. `llm_query` traffic does not leak into stdout.

## Failure modes

| Failure                      | Handling                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| `python3` missing            | `createPythonRepl` throws `spawn`                                  |
| Worker handshake timeout     | `spawn`, child killed                                              |
| User code exception          | `exec` fulfills `{ok:false, error}`                                |
| User code infinite loop      | timeout → kill → respawn empty → throw `timeout`                   |
| Oversized code / value       | throw `limit` before talking to the worker                         |
| Oversized stdout             | truncate, `truncated: true`                                        |
| Concurrent operation         | throw `busy`                                                       |
| `llm_query` without callback | worker raises; `exec` returns `{ok:false}`                         |
| Worker crash                 | pending op throws `protocol`; host respawns empty unless destroyed |
| `destroy` during `exec`      | pending op throws `destroyed`; no respawn                          |

## Open non-goals

Windows `py` launcher detection. Default remains `python3`.

A full capability-based sandbox. Restricted builtins plus kill is v1.

Pip-installing user packages into the worker.

Binding the REPL to `NCRuntime` or calling it from `NCRenderer`.
