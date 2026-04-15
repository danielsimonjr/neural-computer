# AGENTS.md

Instructions for AI coding agents working with this repository.

## Code Style

- Do not use emojis in code, comments, commit messages, or documentation output.
- Prefer plain prose over heavy bullet lists in documentation.
- Keep comments focused on *why*, not *what* — let well-named identifiers describe *what*.

## Workflow

- Run `npm run typecheck` after each turn to ensure type safety.
- Run `npm test` after changes that touch logic or tests.
- Local development requires the sibling `JSON-UI` repo at `../JSON-UI` (see README).

## Architecture References

All design decisions live in `docs/`. Read the relevant spec before implementing anything.

- **Active spec:** `docs/specs/2026-04-11-ephemeral-ui-state-design.md` — the staging buffer pattern for in-progress user input, including the five state surfaces, the four staging-buffer rules, failure modes, and the `DynamicValue` resolution path. Read this before touching anything under `src/renderer/`.
- **v1 implementation plan:** `docs/plans/2026-04-15-neural-computer-v2-plan.md` — 13-task breakdown shipped 2026-04-15. Supersedes the April-11 plan.
- **CHANGELOG.md** — every behavior change is documented here before shipping. Read the Fixed section for the list of review-caught bugs and the context to re-derive them.

## Dependency Notes

- `@json-ui/core`, `@json-ui/react`, and `@danielsimonjr/memoryjs` are all installed via `file:` deps pointing at sibling repos (`../JSON-UI/packages/core`, `../JSON-UI/packages/react`, `../memoryjs`). Neither library is published to npm yet. When the libraries publish, NC will switch to semver-pinned registry entries.
- `@anthropic-ai/sdk` — Anthropic's official TypeScript SDK. Use for LLM calls (stub handler only in v1).
- JSON-UI ships no built-in input components; the NC runtime implements `NCTextField`, `NCCheckbox`, `NCButton`, `NCContainer`, `NCText` in `src/renderer/input-components.tsx` and wires them to the staging buffer via `useStagingField`.
- **React dedup:** `@json-ui/react` installs as a symlink via `file:` deps. JSON-UI's own `node_modules/react` shadows NC's in Node's module resolution walk. `vitest.config.ts` has a `resolve.alias` pinning `react` and `react-dom` to NC's own `node_modules`. Without this, every rendering test throws `Cannot read properties of null (reading useState)` because the hooks dispatcher attaches to JSON-UI's React instance but the render walks NC's.

## Critical Conventions (that have caused bugs)

- **`NCButton` MUST forward `action.params` to `execute()`.** The prop type must include `params?: Record<string, unknown>` AND the `onClick` callback must pass `{name, params}` to `execute`. A v1 draft narrowed the type to `{name}` only and silently dropped LLM-emitted params, defeating NC Invariants 6 (action_params/staging_snapshot separation) and 11 (DynamicValue pre-resolution). Caught by the post-implementation Opus review.
- **`NCRenderer.onIntent` MUST attach a `.catch` on `runtime.emitIntent(event)`.** Using `void runtime.emitIntent(event)` silently swallows any rejection the handler produces, surfacing as a UI that appears to do nothing. Use `.catch(err => console.error("[NC] Intent handler threw:", err))`.
- **`createNCRuntime` owns the intent handler slot via `setIntentHandler`**, NOT via a constructor option. The React lifecycle needs deferred handler binding because the `setTree` reference captured by the handler only exists after React's `useState` runs in `NCApp`'s mount. `emitIntent` captures the handler BEFORE `await` so mid-flight swaps don't corrupt the running call.
- **`NCApp.buildIntentHandler` should be stable across renders.** Inline arrow functions create a new identity every render, which re-installs the handler in every commit. Not a bug (just wasteful), but memoize with `useCallback` in production code.
- **`useCommittedTree` MUST be used instead of `useUIStream` directly** for any flow that drives `NCRenderer.tree`. The atomic commit mode is non-negotiable for NC Invariant 9 (reconcile only on successful tree commits).

## What Not to Do

- Do not modify JSON-UI from this repo. JSON-UI is a dependency. If a change is needed there, it is a separate upstream contribution.
- Do not invent new state categories beyond the five named in the active spec.
- Do not call the LLM on every keystroke. Intents are the only flush boundary.
