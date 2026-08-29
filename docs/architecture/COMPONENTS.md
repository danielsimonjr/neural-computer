# Neural Computer - Component Reference

**Version**: 0.1.0 (docs refreshed 2026-08-29)
**Last Updated**: 2026-08-29

This document covers every source file in the NC runtime, grouped by module in dependency order (leaves first). Catalog version is `nc-starter-0.3`. `NCButton` forwards `action.params` to `execute()`. Validation of trees happens during render (`useMemo`), not in `useLayoutEffect`.

---

## Types (`src/types/`)

### `src/types/nc-types.ts`

Core type definitions plus the catalog-version constructor.

| Export               | Kind       | Description                                                                                                                                      |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NCIntentHandler`    | Type alias | `(event: IntentEvent) => Promise<void>`                                                                                                          |
| `NCCatalogVersion`   | Type alias | Nominal brand. Construct with `asNCCatalogVersion`; a bare `as` at the runtime boundary is rejected by `asNCCatalogVersion`.                     |
| `asNCCatalogVersion` | Function   | Throws if the string is empty or longer than 64 characters                                                                                       |
| `isNCCatalogVersion` | Type guard | Non-empty string, max 64 chars                                                                                                                   |
| `NCObserver`         | Interface  | Headless shadow renderer API                                                                                                                     |
| `NCRuntime`          | Interface  | Staging buffer, durable store, observer, catalog, catalogVersion, emitIntent, setIntentHandler, isIntentInFlight, subscribeIntentFlight, destroy |

**Tests**: `nc-types.test.ts` (includes `NCRuntime.observer` and the brand constructor).

### `src/types/index.ts`

Barrel: types plus `asNCCatalogVersion` / `isNCCatalogVersion`.

---

## Catalog (`src/catalog/`)

### `src/catalog/limits.ts`

Caps and the starter action allowlist. `NC_FIELD_ID_MAX_LENGTH` is 128, `NC_STRING_MAX_LENGTH` is 8192, `NC_ACTION_PARAM_MAX_KEYS` is 32, `NC_OBSERVER_STALE_THRESHOLD` is 3. `NC_STARTER_ACTIONS` is `["submit_form", "cancel"]`. Reserved field ids: `__proto__`, `constructor`, `prototype`.

### `src/catalog/field-id.ts`

`isSafeFieldId` and `ncFieldIdSchema`. Ids must be trimmed, non-empty, without `/` or `\`, and not reserved.

**Tests**: `field-id.test.ts`.

### `src/catalog/nc-catalog.ts`

| Export                       | Kind     | Description                                                                                         |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `ncStarterCatalog`           | Constant | Six components (including Select), two actions                                                      |
| `NC_CATALOG_VERSION`         | Constant | `"nc-starter-0.3"` via `asNCCatalogVersion`                                                         |
| `NC_LLM_ACCEPTANCE_CONTRACT` | Constant | Prompt-facing text: accept by omitting field ids; never reuse an id with a different component type |

**Components**:

| Name        | Props                                                                           | Has children | Role                                                                  |
| ----------- | ------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| `Container` | `direction?`, `visible?`                                                        | Yes          | Minimal flex (`column` default, `row` optional). Not a layout system. |
| `Text`      | `content`, `visible?`                                                           | No           | Display text                                                          |
| `TextField` | `id`, `label`, `placeholder?`, `error?`, `multiline?`, `inputType?`, `visible?` | No           | Staging-bound; `multiline` is a textarea.                             |
| `Checkbox`  | `id`, `label`, `visible?`                                                       | No           | Boolean                                                               |
| `Select`    | `id`, `label`, `options`, `error?`, `visible?`                                  | No           | Native `<select>`; option label is the value                          |
| `Button`    | `label`, `visible?`, `action?: { name: submit_form \| cancel, params? }`        | No           | Fires catalog actions                                                 |

**Tests**: `nc-catalog.test.ts`.

### `src/catalog/index.ts`

Re-exports catalog, version, contract, field-id helpers, and limits.

---

## Runtime (`src/runtime/`)

### `src/runtime/freeze.ts`

`freezeDeep` for the observer cache. `dict<T>()` returns a null-prototype map so entity names cannot pollute `Object.prototype`.

### `src/runtime/context.ts`

| Export                   | Kind                     | Description                                                                                      |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `CreateNCRuntimeOptions` | Interface                | `durableStore`, `catalog`, optional `catalogVersion`, `extraHeadlessRegistry`, `onObserverStale` |
| `createNCRuntime`        | **Synchronous** function | Returns `NCRuntime`                                                                              |

Internal state: staging buffer, observer, handler slot, `intentInFlight` plus a listener set, `destroyed`.

`emitIntent` resolves on drops (no handler, in flight, after destroy) and rejects when the handler throws. `cancel` clears staging after the event is in hand. `isIntentInFlight` / `subscribeIntentFlight` are public.

**Tests**: `context.test.ts` (handles, backpressure, cancel, destroy, throwing handler clears the flag).

### `src/runtime/index.ts`

Barrel.

---

## Orchestrator (`src/orchestrator/`)

### `src/orchestrator/handle-intent.ts`

| Export                           | Kind      | Description                                                            |
| -------------------------------- | --------- | ---------------------------------------------------------------------- |
| `CreateStubIntentHandlerOptions` | Interface | `{ catalog, nextTree, onTreeCommit }` — `catalog` is required          |
| `createStubIntentHandler`        | Function  | Validates `nextTree` with `catalog.validateTree` before `onTreeCommit` |

**Tests**: `handle-intent.test.ts`.

### `src/orchestrator/observation.ts`

`composeNcObservation` builds the stable system prompt (`generateCatalogPrompt` + acceptance contract + finish instructions) and a size-capped user JSON (intent, durable snapshot, observer JSON, `observer_stale`, `submitted_field_ids`). Truncates observer first, then durable; never drops `intent`.

**Tests**: `observation.test.ts`.

### `src/orchestrator/llm-handler.ts`

`createLlmIntentHandler` is the production `NCIntentHandler`. Tool loop: always `commit_ui_tree`; optional `python_exec` / `python_load_context` / `python_reset` when `repl` is passed; optional `durable_write` when `onDurableWrite` is passed. Invalid trees come back as tool errors until `maxRounds`. Commits one catalog-valid tree via `onTreeCommit`. Does not stream patches into `useCommittedTree`.

**Tests**: `llm-handler.test.ts` (fake transport; no network).

### `src/orchestrator/anthropic-transport.ts`

`createAnthropicTransport` / `createAnthropicIntentHandler`. Inject `send` in tests. Default model `NC_DEFAULT_ANTHROPIC_MODEL`.

**Tests**: `anthropic-transport.test.ts`.

**Meta-test**: `buffer-isolation.test.ts` — forbidden imports include React, `@json-ui/react`, `@json-ui/headless`, `../renderer`, `../app`, and **`../observer`**. The handler reads `runtime.observer`, never `../observer`.

---

## Memory (`src/memory/`)

### `src/memory/projection.ts`

`defaultNCProjection` plus `NCProjectedData`, `NCProjectedEntity`, `NCProjectedRelation`. Groups by type, indexes by name, projects relations, uses `dict()` maps, warns on duplicate names. Missing timestamps are `null`.

**Tests**: `projection.test.ts`.

---

## Observer (`src/observer/`)

### `src/observer/nc-headless-components.ts`

`ncHeadlessRegistry`: `Container`, `Text`, `TextField`, `Checkbox`, `Select`, `Button` as positional `HeadlessComponent` functions. Inputs emit `currentValue` only when staging has a value. Button copies `action.params` from props; DynamicValue pre-resolution is upstream JSON-UI behavior.

**Tests**: `nc-headless-components.test.ts`.

### `src/observer/nc-observer.ts`

`createNCObserver` / `CreateNCObserverOptions`. Binds catalog at construction. `getLastRender()` returns a frozen graph. Builtin keys cannot be overridden via `extraRegistry`. `registry` is a test-only full replacement for Invariant 13.

**Tests**: `nc-observer.test.ts`.

### `src/observer/index.ts`

Barrel.

---

## Renderer (`src/renderer/`)

### `src/renderer/intent-flight-context.ts`

`IntentFlightContext` (boolean; `NCButton` disables when true). `FocusFieldContext` records the focused field id so NCRenderer can restore focus after a commit.

### `src/renderer/field-id-stability.ts`

`collectFieldIdTypes`, `detectFieldIdTypeChanges`, `commitFieldIdTypes`, `FieldIdTypeChangeError`. Same field id cannot change between `TextField` and `Checkbox` across commits in one renderer lifetime.

**Tests**: `field-id-stability.test.ts`.

### `src/renderer/error-boundary.tsx`

`NCErrorBoundary` class component. Catches render throws, logs, calls `onError`, shows a `role="alert"` fallback.

### `src/renderer/input-components.tsx`

| Export             | Kind      | Description                                                                                      |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------ |
| `NCComponentProps` | Interface | `{ element, children? }`                                                                         |
| `NCContainer`      | Component | Flex `div` with `data-key`; `direction` row/column; `visible === false` returns null             |
| `NCText`           | Component | `<p>` with `props.content`                                                                       |
| `NCTextField`      | Component | `<input>` or `<textarea>` when `multiline`; `maxLength` 8192; `aria-invalid` when `error` is set |
| `NCCheckbox`       | Component | Checkbox bound to staging                                                                        |
| `NCSelect`         | Component | Native `<select>` bound to staging                                                               |
| `NCButton`         | Component | `execute({ name, params })` — **params are forwarded**; disabled while in flight                 |

Three id namespaces: React `key`, `data-key` (`element.key`), `data-field-id` (staging id).

**Tests**: `input-components.test.tsx` (includes NCButton execute/params).

### `src/renderer/nc-renderer.tsx`

| Export            | Kind               | Description                                                                                                    |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `NCRendererProps` | Interface          | `tree`, `runtime`, `catalog`, `catalogVersion`, optional `extraRegistry`, `onValidationError`, `onRenderError` |
| `NCRenderer`      | Function component | Validates during render; last-good tree to `<Renderer>`                                                        |

`extraRegistry` cannot override builtin names (`Container`, `Text`, `TextField`, `Checkbox`, `Select`, `Button`) so a host cannot drop `action.params` by replacing `Button`.

After a successful commit, `useLayoutEffect` reconciles and calls `observer.render` on the **same Zod-stripped tree** the Renderer received. That effect is not validation.

**Tests**: `nc-renderer.test.tsx`.

### `src/renderer/use-committed-tree.ts`

`useCommittedTree` wraps `useUIStream` with `commitMode: "atomic"` (Invariant 9). `NCApp` itself uses `useState`; the stub and LLM handlers validate complete trees. Streamed JSON-patch HTTP responses belong in a custom owner that uses this hook. The in-process LLM handler does not POST to it.

**Tests**: `use-committed-tree.test.tsx`.

### `src/renderer/index.ts`

Re-exports components, NCRenderer, useCommittedTree, NCErrorBoundary, and field-id-stability helpers.

---

## App (`src/app/`)

### `src/app/nc-app.tsx`

| Export       | Kind               | Description                                                                                                                   |
| ------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `NCAppProps` | Interface          | runtime, catalog, catalogVersion, initialTree, buildIntentHandler, optional extraRegistry / onValidationError / onRenderError |
| `NCApp`      | Function component | Owns tree state, installs handler, renders NCRenderer                                                                         |

`buildIntentHandler` should be stable (`useCallback` or module scope). Unmount installs a no-op handler.

**Tests**: `nc-app.test.tsx`.

---

## Public barrels

### `src/index.ts`

Root package export: catalog, types, runtime, memory, renderer, orchestrator (stub + LLM handler), app, observer, compute. Pulls React. See [API.md](./API.md).

### `src/core.ts`

`neural-computer/core`. Same as the root barrel minus React renderer/app, including `createPythonRepl` and `createLlmIntentHandler`. Safe for Node / orchestrator processes.

### `src/react.ts`

`neural-computer/react`. `"use client"`. NCRenderer, input components, useCommittedTree, NCErrorBoundary, NCApp. Does not export compute.

---

## Compute (`src/compute/`)

### `src/compute/python-repl.ts`

`createPythonRepl` owns one CPython child. JSON-lines protocol. Caps in `limits.ts`. Worker script `worker.py` is copied to `dist/worker.py` by tsup.

**Tests**: `python-repl.test.ts`, `isolation.test.ts`.

---

## Integration Test (`src/integration/path-c.test.tsx`)

End-to-end Path C: type → submit → IntentEvent with snapshot + catalog_version; reconcile across trees; Invariant 6 key collision; Invariant 11 DynamicValue; Invariant 10 backpressure; observer populated after commit; cancel clears staging.
