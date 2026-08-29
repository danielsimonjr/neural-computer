# Compute Layer: RLM-Pattern Python REPL Implementation Plan

**Goal:** Add `src/compute/` so the orchestrator can drive a persistent CPython REPL (RLM pattern) without attaching Python to `NCRuntime` or to React.

**Architecture:** A JSON-lines worker (`worker.py`) spawned with `python3 -u -I -X utf8`. Host factory `createPythonRepl` owns one child, one-at-a-time backpressure, timeout-and-kill with empty respawn, optional `llm_query` callback. Exported from `neural-computer/core` and the root barrel, not from `/react`.

**Tech stack:** TypeScript 5.9 strict, Vitest 4, Node `child_process`, CPython 3.10+ (`python3` on CI). No new npm dependencies.

**Spec:** [`docs/specs/2026-08-29-compute-rlm-repl-design.md`](../specs/2026-08-29-compute-rlm-repl-design.md)

---

## Task 1: Caps, error type, worker script

- Add `src/compute/limits.ts`, `src/compute/types.ts`, `src/compute/worker.py`, `src/compute/worker-path.ts`.
- Worker speaks JSON lines; handshake `ready`; ops `exec` / `set` / `get` / `reset`; `llm_query` control messages on the real stdout.

## Task 2: Host factory

- Add `src/compute/python-repl.ts` and `src/compute/index.ts`.
- `createPythonRepl` waits for handshake. `exec` / `set` / `get` / `loadContext` / `reset` / `isBusy` / `destroy`.
- Missing interpreter throws `spawn`. Timeout kills and respawns empty.

## Task 3: Tests

- `src/compute/python-repl.test.ts`: exec, persistence, set/get, loadContext, syntax error, timeout wipe, truncation, busy, destroy, missing binary, `llm_query` stub, reserved identifiers.
- `src/compute/isolation.test.ts`: no React / renderer / observer imports (mirrors Invariant 7).

## Task 4: Packaging

- Export from `src/core.ts` and `src/index.ts` (not `src/react.ts`).
- `tsup.config.ts` copies `worker.py` to `dist/worker.py` on the core bundle `onSuccess`.
- ESLint override for `src/compute/**/*.ts` matching orchestrator restricted imports.
- CI: fix the under-indented `run: |` block so typecheck/lint/test/build actually run; print `python3 --version`.

## Task 5: Docs

- CHANGELOG, README, SECURITY.md, AGENTS.md, CLAUDE.md, architecture pages, examples/README, v1 plan out-of-scope note.
- Compute is a tool, not an eighth named UI state surface.

## Done criteria

- `bun run typecheck`, `bun test`, `bun run lint`, `bun run format:check`, `bun run build` clean.
- `dist/worker.py` exists after build and `createPythonRepl` can spawn it from the bundled entry (tested via source-path resolution in unit tests; copy verified after `bun run build`).
