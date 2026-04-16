# Changelog

All notable changes to the Neural Computer runtime are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). This project is pre-1.0 (`0.x.y`); breaking changes may land in any minor bump until a 1.0.0 release.

---

## [Unreleased]

### Added

- **Architecture documentation (`docs/architecture/`)** — 9 files covering the full NC v1 surface: OVERVIEW.md (high-level summary, architecture diagram, stats, quickstart), ARCHITECTURE.md (system layers, design decisions, six state surfaces, failure modes), COMPONENTS.md (per-file reference for all 17 source files), DATAFLOW.md (type-click-intent-commit-render loop with diagrams), API.md (all 24 public exports with signatures and options), INVARIANTS.md (all 11 spec invariants with test locations). Plus three auto-generated files: DEPENDENCY_GRAPH.md (file-level imports/exports/Mermaid diagram), TEST_COVERAGE.md (13/17 source files tested, 4 untested are barrel re-exports), unused-analysis.md.

- **Codebase inventory tool (`tools/create-dependency-graph/`)** — cloned from `memoryjs/tools/create-dependency-graph` with `.tsx` file support (source/test discovery, `resolvePath` with `.tsx` + `index.ts` fallback, `stripTsExt` helper). Generates DEPENDENCY_GRAPH.md, dependency-graph.json/yaml, dependency-summary.compact.json, TEST_COVERAGE.md, test-coverage.json, and unused-analysis.md. Run via `npm run docs:deps`.

- **v1 scaffold implementing `docs/plans/2026-04-15-neural-computer-v2-plan.md`** — 13 tasks covering the full React-side Path C integration. Ships 47 tests across 11 test files; typecheck + build clean; public barrel exposes 13 runtime symbols (24 total with types).

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

- **Second post-ship review (RLM + HonestClaude, 2026-04-15)** — a full Opus-architectural + Sonnet-tactical sweep through NC v1 source, tests, configs, and upstream API ground truth. Ten real issues found, all HonestClaude-verified and fixed in this patch:

  1. **`NCRenderer` reconciled over the raw unvalidated `tree` prop, not the Zod-parsed `result.data`.** Zod v4 strips unknown keys by default, so a Container element with a stray `id: "phantom"` prop passed `catalog.validateTree` (the stray key was stripped in `result.data`) while `collectFieldIds(rawTree)` still picked it up and marked `"phantom"` as a live staging field — a phantom entry that would survive every reconcile pass forever. Fixed by walking `result.data!` instead of `tree`. Regression test in `nc-renderer.test.tsx` uses `as unknown as UITree` to sneak a Container with a stray `id` past the strict prop types and asserts the phantom entry is dropped.

  2. **Reconcile ran in `useEffect`, leaving a one-frame window** where an orphan field's unmounted React component could leave its staging value visible to any reader of the buffer. Fixed by switching to `useLayoutEffect`, which runs synchronously after DOM mutations but before paint. The reconcile is a pure in-memory operation so the layout-effect timing has no perf cost.

  3. **`vitest.config.ts` react dedup alias covered `react` and `react-dom` but NOT `react/jsx-runtime` / `react/jsx-dev-runtime`.** With tsconfig `"jsx": "react-jsx"`, every compiled `.tsx` file imports from `react/jsx-runtime`, and without pinning the subpath, the symlinked `@json-ui/react` could still resolve to its own React instance via JSON-UI's `node_modules` — reintroducing the two-React-instances bug the base alias was added to fix. Fixed by adding explicit `react/jsx-runtime` and `react/jsx-dev-runtime` aliases.

  4. **`NCRuntime.emitIntent` docstring claimed "Rejects the event synchronously (and logs)"** but the actual implementation resolves (never rejects) and logs. Fixed the docstring to describe the real contract: returned promise always resolves, backpressure and missing-handler drops produce warnings only, handler rejections propagate through the returned promise.

  5. **`src/index.ts` public-entry header comment pre-promised `@json-ui/headless`** as a v1 dependency. NC v1 does not use `@json-ui/headless` — the primitives (shared `stagingBuffer` and `durableStore`) are shaped for a future dual-backend integration but no v1 code mounts a headless session. Fixed the header to say so.

  6. **`NCButton.onClick` bare-voided the `execute(...)` promise** — same failure mode as the already-fixed `NCRenderer.onIntent`. `execute` returns `Promise<void>` and rejects when the `ActionProvider`'s `onIntent` throws or `resolveActionWithStaging` hits an unresolved `DynamicValue`; `void` silently swallowed those, turning real errors into clicks that appear to do nothing. Fixed by attaching a `.catch(err => console.error(...))`.

  7. **NC Invariant 4 (staging snapshot reads are non-destructive) had no test.** Added `src/runtime/context.test.ts` coverage that writes two values, reads the snapshot multiple times through `runtime.stagingBuffer.snapshot()` plus routes an intent, and asserts all values are still in the buffer afterwards.

  8. **`createStubIntentHandler` had no test for a throwing `nextTree`.** NCRenderer's `onIntent` and NCButton's `execute` both attach `.catch` handlers that depend on rejections propagating up through the handler chain — if the stub silently swallowed a throwing `nextTree`, those diagnostics would never fire. Added a test asserting `handler(event)` rejects when `nextTree` throws and that `onTreeCommit` is not called.

  9. **`src/orchestrator/buffer-isolation.test.ts` `FORBIDDEN_IMPORTS` list missed `@json-ui/headless`.** The test is the structural guarantee that the orchestrator stays renderer-agnostic; `@json-ui/headless` is just as much a "renderer" as `@json-ui/react` is, and leaving it out meant a future accidental import would not trip the guard. Added the pattern.

  10. **`NCApp.buildIntentHandler` JSDoc did not document the stability requirement.** An inline arrow `buildIntentHandler={(setTree) => createStubIntentHandler({...})}` has a new identity on every parent render, which re-runs the install `useEffect` and rebuilds the handler every commit — not a correctness bug (the old handler is cleanly replaced) but wasteful, and React strict mode amplifies the churn during development. Documented the stability requirement with a note to memoize with `useCallback` or hoist to module scope.

  Net test count change: 44 → 47 (one test added for Invariant 4, one for throwing `nextTree`, one for the Zod strip regression). Typecheck + build still clean.

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
