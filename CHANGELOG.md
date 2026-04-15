# Changelog

All notable changes to the Neural Computer runtime are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). This project is pre-1.0 (`0.x.y`); breaking changes may land in any minor bump until a 1.0.0 release.

---

## [Unreleased]

### Added

- **v1 scaffold implementing `docs/plans/2026-04-15-neural-computer-v2-plan.md`** — 13 tasks covering the full React-side Path C integration. Ships 44 tests across 11 test files; typecheck + build clean; public barrel exposes 13 runtime symbols.

- **Catalog (`src/catalog/`)** — `ncStarterCatalog` built via `@json-ui/core`'s `createCatalog`. Declares five components (`Container`, `Text`, `TextField`, `Checkbox`, `Button`) and two actions (`submit_form`, `cancel`). Every input component carries a required `id: z.string()` prop for staging-buffer keying. `Button.action` is optional but when present accepts `{name, params?}` so LLM-emitted action declarations reach the orchestrator intact. `NC_CATALOG_VERSION = "nc-starter-0.1"` is a branded string threaded through every emitted `IntentEvent.catalog_version`.

- **Core types (`src/types/`)** — `NCRuntime` interface, `NCIntentHandler` type alias, and `NCCatalogVersion` nominal brand. `NCRuntime` exposes `stagingBuffer`, `durableStore`, `emitIntent`, `setIntentHandler`, and `destroy`. The `setIntentHandler` slot is deliberate: it lets the runtime be constructed synchronously at app start while the actual handler (which closes over React's `setTree`) is installed later in a `useEffect`.

- **Runtime factory (`src/runtime/`)** — `createNCRuntime({ durableStore })` returns an `NCRuntime` with a fresh `StagingBuffer`, a mutable intent-handler slot, and a backpressure gate. The gate enforces NC Invariant 10: `intentInFlight` flips true before `await`, false in `finally`, and the handler is captured via `const currentHandler = intentHandler` BEFORE the await so mid-flight handler swaps do not corrupt the running call. `emitIntent` warns (does not throw) when called before `setIntentHandler` or after `destroy`.

- **Stub intent handler (`src/orchestrator/handle-intent.ts`)** — `createStubIntentHandler({ nextTree, onTreeCommit })` returns a deterministic `NCIntentHandler` that maps an `IntentEvent` to a `UITree` via the pure `nextTree` function and calls `onTreeCommit` with the result. The real Anthropic SDK-backed handler is deferred to a follow-up spec; this stub keeps the runtime testable end-to-end without an LLM.

- **Memory projection (`src/memory/`)** — `defaultNCProjection(entities, relations)` returns a flat `Record<string, JSONValue>` view: `entitiesByType` groups entities by their `entityType`, `entities` indexes by name for O(1) lookup, and `relationCount` exposes a scalar for diagnostic display. Full relation projection is deferred. Pure function, JSON round-trip safe. Intended to be passed as the `projection` option to `createObservableDataModelFromGraph` from memoryjs.

- **React input components (`src/renderer/input-components.tsx`)** — `NCContainer`, `NCText`, `NCTextField`, `NCCheckbox`, `NCButton`. Input components bind to the shared `StagingBuffer` via `@json-ui/react`'s `useStagingField` hook. `NCButton` fires catalog actions via `useActions().execute`, forwarding BOTH `name` AND `params` (so `DynamicValue` literals inside `action.params` reach `ActionProvider` and resolve against staging via `resolveActionWithStaging`).

- **`NCRenderer` (`src/renderer/nc-renderer.tsx`)** — mounts `@json-ui/react`'s `JSONUIProvider` with NC's runtime-shared `StagingBuffer` and `ObservableDataModel`, wires `onIntent` to `runtime.emitIntent` via a `.catch` that logs handler exceptions, and runs `catalog.validateTree + reconcile` on every committed tree in a `useEffect`. Trees that fail validation (Zod errors OR field-ID duplicates) are skipped — the staging buffer is left untouched, preserving user input across rejection. Passes `registry` to both `JSONUIProvider` (for forward-compat) and `Renderer` (which requires it structurally).

- **`useCommittedTree` (`src/renderer/use-committed-tree.ts`)** — thin wrapper around `useUIStream` that pre-selects `commitMode: "atomic"`. NC consumers that reconcile on tree identity MUST use this hook, not `useUIStream` directly — NC Invariant 9 forbids reconciling against partial streams, and the atomic mode in `@json-ui/react` suppresses every `setTree` call until the stream completes successfully.

- **`NCApp` (`src/app/nc-app.tsx`)** — top-level React mounting component. Owns `useState<UITree>(initialTree)`, calls `runtime.setIntentHandler(buildIntentHandler(setTree))` in a `useEffect`, and renders `NCRenderer`. The `buildIntentHandler: (setTree) => NCIntentHandler` prop lets the caller close over `setTree` when constructing the handler (typically via `createStubIntentHandler({onTreeCommit: setTree})`). The factory pattern bridges the runtime's synchronous construction with React's post-mount lifecycle without mutating state across function boundaries.

- **Orchestrator buffer-isolation test (`src/orchestrator/buffer-isolation.test.ts`)** — meta-test that walks every non-test file under `src/orchestrator/` and asserts no forbidden import pattern (React, `react-dom`, `@json-ui/react`, `../renderer`, `../app`). Enforces NC Invariant 7 structurally rather than by convention.

- **End-to-end integration test (`src/integration.test.tsx`)** — covers the full Path C React flow: (1) type → submit → `IntentEvent` with full staging snapshot + `catalog_version` threaded through, (2) reconciliation preserves matching IDs and drops orphans across tree transitions, (3) `action_params` and `staging_snapshot` stay separate on key collision (NC Invariant 6), (4) `DynamicValue {path: "email"}` params resolve against staging at the NC layer (NC Invariant 11), (5) backpressure rejects a second click while the first intent is in flight (NC Invariant 10).

- **Scaffold config (`vitest.config.ts`, `tsup.config.ts`, `.eslintrc.cjs`)** — vitest jsdom env with `passWithNoTests: true` and a `resolve.alias` pinning `react`/`react-dom` to NC's own `node_modules` (because `@json-ui/react` installs as a symlink via `file:` deps and JSON-UI's own `node_modules/react` was shadowing NC's in Node's module resolution walk). tsup builds ESM + CJS + `.d.ts` with sourcemaps. ESLint config is a minimal root.

### Fixed

- **`NCButton` dropped `action.params` on execute** (found by the post-implementation Opus architectural review). The React component's prop type narrowed `action?` to `{name: string}`, omitting the `params` field declared in the catalog schema. Any LLM-emitted `action.params` silently vanished — the orchestrator's `IntentEvent.action_params` was always empty regardless of what the tree declared. This defeated NC Invariants 6 (action_params vs staging_snapshot separation) and 11 (DynamicValue pre-resolution) at the source. Fixed by widening the prop type to include `params?: Record<string, unknown>` and forwarding `{name, params}` through `execute()`. Two new integration tests pin the fix.

- **`runtime.emitIntent` rejection was silently swallowed** (same review). `NCRenderer` called `void runtime.emitIntent(event)` in its `onIntent` callback, which drops any rejection the handler produced. A throwing intent handler surfaced as a UI that appeared to do nothing. Fixed by changing to `runtime.emitIntent(event).catch(err => console.error(...))`. The `intentInFlight` flag in `createNCRuntime`'s `finally` already cleared on throw so the runtime was recovering; this just gives a diagnostic trail.

### Dependencies

- **`file:` deps for local development.** Until `@json-ui/core`, `@json-ui/react`, and `@danielsimonjr/memoryjs` are published to npm, NC's `package.json` points at the sibling repos via relative `file:` paths. `npm install` creates symlinks; the vitest `resolve.alias` above deduplicates React across those symlinks. When the libraries publish, NC will switch to semver-pinned registry entries.

- Bumped `@danielsimonjr/memoryjs` target from `^1.8.0` to `file:../memoryjs` (which ships the 1.10.0 `createObservableDataModelFromGraph` adapter).
- Added `react-dom` to `dependencies` (NC is a React app, not a library).
- Added `@types/react-dom` to `devDependencies`.
- Added npm `overrides` forcing `react` / `react-dom` to a single version across the dep tree.

### Known deferred items

- **Real LLM-backed intent handler.** The v1 ships `createStubIntentHandler` only. A follow-up spec will introduce `createAnthropicIntentHandler` against `@anthropic-ai/sdk`, streaming the response and feeding patches through `useCommittedTree`'s atomic mode.
- **`@json-ui/headless` dual-backend session.** Path C calls for a headless renderer running alongside the React renderer on the same shared stores. The runtime primitives are shaped for this (`stagingBuffer` and `durableStore` are shared references), but no v1 code mounts a headless session. Separate spec.
- **Python REPL subprocess dispatch.** The RLM-pattern computation arm from the NC architecture paper. Independent subsystem; separate spec.
- **Persistent staging buffer across process restart.** Explicit non-goal in the ephemeral-UI-state spec (Risk 3 + Open Question 3).
- **Backpressure UX.** The runtime rejects and logs but the visual treatment (disabled Submit button, toast, silent) is a UX decision flagged as load-bearing in the design spec. Separate spec.
- **Catalog versioning / migration.** `NC_CATALOG_VERSION` is a constant. A real versioning flow (old trees still validate gracefully when the catalog bumps) is a follow-up.
