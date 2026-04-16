# Neural Computer - Component Reference

**Version**: 0.1.0
**Last Updated**: 2026-04-16

---

This document provides per-file documentation for every source file in the NC runtime. Files are grouped by module in dependency order (leaves first, dependents last).

---

## Types (`src/types/`)

### `src/types/nc-types.ts`

Core type definitions for the NC runtime. No runtime code — types only.

| Export | Kind | Description |
|--------|------|-------------|
| `NCIntentHandler` | Type alias | `(event: IntentEvent) => Promise<void>` — the handler signature the runtime dispatches to |
| `NCCatalogVersion` | Type alias | `string & { __brand: "NCCatalogVersion" }` — nominal brand for catalog version strings |
| `NCRuntime` | Interface | The runtime handle: `stagingBuffer`, `durableStore`, `emitIntent`, `setIntentHandler`, `destroy` |

**Dependencies**: `@json-ui/core` (type-only: `IntentEvent`, `StagingBuffer`, `ObservableDataModel`)

**Tests**: `nc-types.test.ts` — validates type structure and branded string behavior

---

## Catalog (`src/catalog/`)

### `src/catalog/nc-catalog.ts`

Defines the NC starter catalog and its version constant.

| Export | Kind | Description |
|--------|------|-------------|
| `ncStarterCatalog` | Constant | `Catalog` with 5 components and 2 actions, built via `createCatalog` |
| `NC_CATALOG_VERSION` | Constant | `"nc-starter-0.1"` branded as `NCCatalogVersion` |

**Components declared**:

| Name | Props Schema | Has Children | Role |
|------|-------------|--------------|------|
| `Container` | `z.object({})` | Yes | Layout wrapper |
| `Text` | `{ content: z.string() }` | No | Display text |
| `TextField` | `{ id, label, placeholder?, error? }` | No | Text input (staging-bound) |
| `Checkbox` | `{ id, label }` | No | Boolean input (staging-bound) |
| `Button` | `{ label, action?: { name, params? } }` | No | Fires catalog actions |

**Actions declared**: `submit_form`, `cancel`

**Dependencies**: `@json-ui/core` (`createCatalog`), `zod` (`z`), `../types` (type-only: `NCCatalogVersion`)

**Tests**: `nc-catalog.test.ts` — validates catalog shape, `validateTree` behavior, duplicate field ID rejection

---

## Runtime (`src/runtime/`)

### `src/runtime/context.ts`

Factory function that creates the NC runtime handle.

| Export | Kind | Description |
|--------|------|-------------|
| `CreateNCRuntimeOptions` | Interface | `{ durableStore: ObservableDataModel }` |
| `createNCRuntime` | Async function | Returns `Promise<NCRuntime>` with fresh staging buffer and backpressure gate |

**Internal state** (not exported):

| Variable | Type | Purpose |
|----------|------|---------|
| `stagingBuffer` | `StagingBuffer` | Fresh buffer created per runtime instance |
| `intentHandler` | `NCIntentHandler \| null` | Mutable slot, installed via `setIntentHandler` |
| `intentInFlight` | `boolean` | Backpressure gate (Invariant 10) |
| `destroyed` | `boolean` | Idempotent destroy guard |

**Key behaviors**:
- `emitIntent` warns (does not throw) when called before `setIntentHandler` or after `destroy`
- Handler is captured BEFORE `await` so mid-flight swaps use the original handler
- `intentInFlight` clears in `finally` regardless of success or failure

**Dependencies**: `@json-ui/core` (`createStagingBuffer`, `IntentEvent`, `ObservableDataModel`), `../types` (type-only)

**Tests**: `context.test.ts` — 7 tests covering handles, forwarding, pre-handler warning, backpressure rejection, handler replacement, Invariant 4 (snapshot non-destructive), destroy idempotency

---

## Orchestrator (`src/orchestrator/`)

### `src/orchestrator/handle-intent.ts`

Deterministic intent handler factory for testing. No React dependencies.

| Export | Kind | Description |
|--------|------|-------------|
| `CreateStubIntentHandlerOptions` | Interface | `{ nextTree, onTreeCommit }` |
| `createStubIntentHandler` | Function | Returns `NCIntentHandler` that maps IntentEvent → UITree → onTreeCommit |

`nextTree` is a pure function `(IntentEvent) => UITree`. The stub does not batch; each intent produces exactly one tree. Throwing `nextTree` propagates through the returned promise.

**Dependencies**: `@json-ui/core` (type-only: `IntentEvent`, `UITree`), `../types` (type-only)

**Tests**: `handle-intent.test.ts` — handler invocation, async behavior, throwing nextTree propagation

**Meta-test**: `buffer-isolation.test.ts` — walks all non-test files under `src/orchestrator/` and asserts no forbidden imports (React, react-dom, @json-ui/react, @json-ui/headless, ../renderer, ../app)

---

## Memory (`src/memory/`)

### `src/memory/projection.ts`

Pure function that projects memoryjs graph data into the shape NC's `ObservableDataModel` expects.

| Export | Kind | Description |
|--------|------|-------------|
| `NCProjectedData` | Interface | `{ entitiesByType, entities, relationCount }` |
| `NCProjectedEntity` | Interface | `{ name, entityType, observations, createdAt, lastModified }` |
| `defaultNCProjection` | Constant | `GraphProjection` function: `(entities, relations) => Record<string, JSONValue>` |

**Behavior**: Groups entities by `entityType`, indexes by name for O(1) lookup, counts relations. Full relation projection is deferred. Pure function, JSON round-trip safe.

**Dependencies**: `@danielsimonjr/memoryjs` (type-only: `Entity`, `Relation`, `GraphProjection`, `JSONValue`)

**Tests**: `projection.test.ts` — grouping, indexing, relation counting, empty input

---

## Renderer (`src/renderer/`)

### `src/renderer/input-components.tsx`

NC-authored React components wired to the staging buffer.

| Export | Kind | Description |
|--------|------|-------------|
| `NCComponentProps` | Interface | `{ element: UIElement, children?: ReactNode }` |
| `NCContainer` | Function component | Renders `<div>` with `data-key` |
| `NCText` | Function component | Renders `<p>` with `props.content` |
| `NCTextField` | Function component | `<label>` + `<input>` bound to staging via `useStagingField` |
| `NCCheckbox` | Function component | `<label>` + `<input type="checkbox">` bound to staging |
| `NCButton` | Function component | `<button>` that fires `execute({name, params})` with `.catch` |

**Key conventions**:
- Input components use `useStagingField<T>(props.id)` from `@json-ui/react`
- `NCButton` forwards BOTH `name` AND `params` to `execute()` (Invariants 6 and 11)
- `execute()` rejection is caught and logged (not silently voided)

**Dependencies**: `react`, `@json-ui/react` (`useStagingField`, `useActions`), `@json-ui/core` (type-only: `UIElement`)

**Tests**: `input-components.test.tsx` — rendering, staging binding, action firing

### `src/renderer/nc-renderer.tsx`

The NC React wrapper. Central coordination point for validation, reconciliation, and intent dispatch.

| Export | Kind | Description |
|--------|------|-------------|
| `NCRendererProps` | Interface | `{ tree, runtime, catalog, catalogVersion, extraRegistry? }` |
| `NCRenderer` | Function component | Mounts `JSONUIProvider` + `Renderer` with NC's shared stores |

**On every committed tree** (via `useLayoutEffect`):
1. `catalog.validateTree(tree)` — if fails, skip reconcile, log warning
2. `collectFieldIds(result.data!)` — walk the Zod-validated tree, NOT raw
3. `runtime.stagingBuffer.reconcile(liveIds)` — drop orphans

**`onIntent` callback** (via `useCallback`):
- `runtime.emitIntent(event).catch(err => console.error(...))`

**Dependencies**: `react`, `@json-ui/react` (`JSONUIProvider`, `Renderer`, `ComponentRegistry`, `ComponentRenderer`), `@json-ui/core` (`collectFieldIds`, `Catalog`, `IntentEvent`, `UITree`), `./input-components`, `../types` (type-only)

**Tests**: `nc-renderer.test.tsx` — 6 tests covering rendering, reconcile drop/preserve, Zod strip regression, intent dispatch, validation skip

### `src/renderer/use-committed-tree.ts`

Thin wrapper that enforces atomic commit mode for NC Invariant 9.

| Export | Kind | Description |
|--------|------|-------------|
| `UseCommittedTreeOptions` | Type alias | `Omit<UseUIStreamOptions, "commitMode">` |
| `useCommittedTree` | Function (hook) | `useUIStream({ ...options, commitMode: "atomic" })` |

**Dependencies**: `@json-ui/react` (`useUIStream`, `UseUIStreamOptions`)

**Tests**: `use-committed-tree.test.tsx` — atomic mode enforcement, error path (buffer untouched on stream failure)

---

## App (`src/app/`)

### `src/app/nc-app.tsx`

Top-level React mounting point. Intentionally small.

| Export | Kind | Description |
|--------|------|-------------|
| `NCAppProps` | Interface | `{ runtime, catalog, catalogVersion, initialTree, buildIntentHandler }` |
| `NCApp` | Function component | Owns `useState<UITree>`, wires handler via `useEffect`, renders `NCRenderer` |

**`buildIntentHandler` prop**: Factory `(setTree) => NCIntentHandler`. Callers SHOULD memoize with `useCallback` or hoist to module scope. An inline arrow re-runs the install `useEffect` every render (wasteful, not a correctness bug).

**Dependencies**: `react`, `@json-ui/core` (type-only: `Catalog`, `UITree`), `../renderer` (`NCRenderer`), `../types` (type-only)

**Tests**: `nc-app.test.tsx` — mounting, handler wiring, tree transitions

---

## Public Barrel (`src/index.ts`)

Re-exports 13 symbols from the modules above. See [API.md](./API.md) for the full public surface.

---

## Integration Test (`src/integration.test.tsx`)

Not a module, but a key test file covering the full Path C React flow end-to-end:

1. Type → submit → IntentEvent with full staging snapshot + catalog_version
2. Reconciliation preserves matching IDs and drops orphans across tree transitions
3. `action_params` and `staging_snapshot` stay separate on key collision (Invariant 6)
4. `DynamicValue {path: "email"}` resolves against staging (Invariant 11)
5. Backpressure rejects a second click while the first intent is in flight (Invariant 10)
