# AGENTS.md

Instructions for AI coding agents working with this repository.

## Code Style

- Do not use emojis in code, comments, commit messages, or documentation output.
- Prefer plain prose over heavy bullet lists in documentation.
- Keep comments focused on _why_, not _what_ — let well-named identifiers describe _what_.

## Workflow

- Run `bun run typecheck` after each turn to ensure type safety.
- Run `bun test` after changes that touch logic or tests.
- Local development requires sibling repos at `../JSON-UI` and `../memoryjs` (see README). Use Bun.

## Architecture References

All design decisions live in `docs/`. Read the relevant spec before implementing anything.

- **Active spec:** `docs/specs/2026-04-11-ephemeral-ui-state-design.md` (shipped) — staging buffer, named state surfaces, four staging-buffer rules, `DynamicValue`. Read this before touching `src/renderer/`.
- **Path C spec:** `docs/specs/2026-04-16-headless-dual-backend-design.md` (shipped) — LLM observer.
- **Compute spec:** `docs/specs/2026-08-29-compute-rlm-repl-design.md` — Python REPL (RLM pattern). Read this before touching `src/compute/`.
- **v1 implementation plan:** `docs/plans/2026-04-15-neural-computer-v2-plan.md` — supersedes the April-11 plan (which is marked SUPERSEDED).
- **CHANGELOG.md** — behavior changes and traps not to re-introduce.
- **docs/audits/** — 2026-08-29 full-repo audit; do not re-introduce NC-001–NC-092.

## Dependency Notes

- `@json-ui/core`, `@json-ui/react`, `@json-ui/headless`, and `@danielsimonjr/memoryjs` are `file:` siblings. React 19 is a **peerDependency**.
- JSON-UI ships no built-in input components; NC implements them in `src/renderer/input-components.tsx`.
- **React dedup:** `vitest.config.ts` aliases `react` / `react-dom` / jsx runtimes to NC's `node_modules`.

## Critical Conventions

- **`NCButton` MUST forward `action.params` to `execute()`.** extraRegistry cannot override built-in `Button`.
- **`NCRenderer.onIntent` MUST attach a `.catch` on `runtime.emitIntent(event)`.**
- **`createNCRuntime` owns the intent handler slot via `setIntentHandler`.** `emitIntent` captures the handler BEFORE `await`. The factory is **synchronous**.
- **`NCApp.buildIntentHandler` should be stable** (`useCallback` or module scope).
- **`useCommittedTree` MUST be used** for streamed trees. `NCApp` + `createStubIntentHandler` validate complete trees instead.
- **`createNCRuntime` requires `catalog`.** NCRenderer's `catalog` / `catalogVersion` must be the same references as `runtime.catalog` / `runtime.catalogVersion`.
- **Validate during render.** Invalid trees must not reach `<Renderer>`; keep last-good. Reconcile and `observer.render` walk Zod-stripped data.
- **Same field id cannot change component type** across commits in one renderer lifetime.

## Named state surfaces (seven)

Durable state, current UI tree, staging buffer, in-flight intent flag, catalog version, LLM session state (future), observer cache.

## What Not to Do

- Do not modify JSON-UI from this repo.
- Do not invent new state categories beyond the seven named above.
- Do not call the LLM on every keystroke. Intents are the only flush boundary.
- Do not attach the Python REPL to `NCRuntime` or import compute from the renderer. Compute is a tool for a future handler, not an eighth UI state surface.
