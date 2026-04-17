# Neural Computer - API Reference

**Version**: 0.1.0
**Last Updated**: 2026-04-16

---

The public API is exposed via `src/index.ts`. The barrel exports 15 value symbols and 13 type symbols (28 total). All are documented below with their signatures, options, and return types.

```typescript
import {
  // Catalog
  ncStarterCatalog,
  NC_CATALOG_VERSION,

  // Types
  type NCIntentHandler,
  type NCCatalogVersion,
  type NCRuntime,
  type NCObserver,

  // Runtime
  createNCRuntime,
  type CreateNCRuntimeOptions,

  // Memory
  defaultNCProjection,
  type NCProjectedData,
  type NCProjectedEntity,

  // Renderer (React surface)
  NCRenderer,
  NCContainer,
  NCText,
  NCTextField,
  NCCheckbox,
  NCButton,
  useCommittedTree,
  type NCRendererProps,
  type NCComponentProps,
  type UseCommittedTreeOptions,

  // Orchestrator (intent handling — no React)
  createStubIntentHandler,
  type CreateStubIntentHandlerOptions,

  // App (top-level React mounting)
  NCApp,
  type NCAppProps,

  // Observer (LLM observer for Path C)
  createNCObserver,
  ncHeadlessRegistry,
  type CreateNCObserverOptions,
} from "neural-computer";
```

---

## Catalog

### `ncStarterCatalog`

```typescript
const ncStarterCatalog: Catalog<...>
```

The NC starter catalog. 5 components (`Container`, `Text`, `TextField`, `Checkbox`, `Button`) and 2 actions (`submit_form`, `cancel`). Built via `@json-ui/core`'s `createCatalog` with Zod-typed props schemas.

Every input component declares `id: z.string()` for staging-buffer keying. `Button.action.params` accepts `z.record(z.string(), z.unknown()).optional()` so LLM-emitted `DynamicValue` literals pass through.

### `NC_CATALOG_VERSION`

```typescript
const NC_CATALOG_VERSION: NCCatalogVersion  // "nc-starter-0.1"
```

Branded string threaded through every emitted `IntentEvent.catalog_version`. Bump this string when the catalog's public shape changes.

---

## Types

### `NCIntentHandler`

```typescript
type NCIntentHandler = (event: IntentEvent) => Promise<void>
```

The handler signature the runtime dispatches to. The promise resolves when the intent has been fully processed. Rejections propagate through `emitIntent` and are caught by NCRenderer's `.catch`.

### `NCCatalogVersion`

```typescript
type NCCatalogVersion = string & { readonly __brand: "NCCatalogVersion" }
```

Nominal brand that prevents accidental string assignments.

### `NCRuntime`

```typescript
interface NCRuntime {
  stagingBuffer: StagingBuffer;
  durableStore: ObservableDataModel;
  observer: NCObserver;
  emitIntent: (event: IntentEvent) => Promise<void>;
  setIntentHandler: (handler: NCIntentHandler) => void;
  destroy: () => void;
}
```

The runtime handle. Created once per process via `createNCRuntime`. Passed to `NCRenderer` and the orchestrator loop.

| Method | Behavior |
|--------|----------|
| `emitIntent` | Gates through backpressure. Warns (resolves, does not reject) if no handler or already in flight. Handler rejections propagate. |
| `setIntentHandler` | Installs or replaces the handler. In-flight intents continue with the old handler. |
| `destroy` | Idempotent. Clears the handler and rejects future calls. Does NOT dispose `durableStore` (caller-owned). |

---

## Runtime

### `createNCRuntime(options)`

```typescript
async function createNCRuntime(
  options: CreateNCRuntimeOptions
): Promise<NCRuntime>
```

Creates an NC runtime handle with a fresh `StagingBuffer`, a mutable intent-handler slot, and a backpressure gate.

**Options**:

```typescript
interface CreateNCRuntimeOptions {
  durableStore: ObservableDataModel;
  catalog: Catalog<any, any, any>;
  catalogVersion?: NCCatalogVersion;
}
```

The `durableStore` is caller-owned. For production use, build it from memoryjs via `createObservableDataModelFromGraph(ctx.storage, { projection: defaultNCProjection })`. For tests, use `@json-ui/core`'s `createObservableDataModel({})`.

The `catalog` is required because the runtime owns an `NCObserver` whose headless renderer binds the catalog at construction. It MUST match the catalog passed to `NCRenderer`, otherwise the observer renders a different post-Zod-strip tree than React does.

The factory is async to leave room for future initialization steps (persisted buffer hydration, remote handshake). The current implementation returns synchronously-available data.

### NCObserver

The runtime-owned LLM observer. Shadows every successful React tree commit by running `@json-ui/headless` on the same tree + shared stores, caching the `NormalizedNode` output for the orchestrator to read when composing an LLM observation. Owned by `NCRuntime`; never null.

**Interface:**

```typescript
interface NCObserver {
  render: (tree: UITree) => void;
  getLastRender: () => NormalizedNode | null;
  getLastRenderPassId: () => number;
  getConsecutiveFailures: () => number;
  serialize: (format: "json-string" | "html") => string | null;
  destroy: () => void;
}
```

**Methods:**

- `render(tree)` — called by NCRenderer after every successful tree commit. Runs the headless renderer synchronously; caches the result on success, leaves the previous cache intact on failure.
- `getLastRender()` — returns the cached NormalizedNode from the most recent successful render, or null before any render has completed.
- `getLastRenderPassId()` — monotonic counter advanced only on successful renders. Zero before the first render. Pairs with `getConsecutiveFailures` so callers can detect runaway staleness.
- `getConsecutiveFailures()` — number of consecutive render() calls that have thrown since the last successful render. Resets to 0 on each successful render.
- `serialize(format)` — serialize the last render via `@json-ui/headless` built-in serializers. `"json-string"` for LLM prompts; `"html"` for fallback-only diagnostic preview. Returns null if no render has completed.
- `destroy()` — release resources. Idempotent. Called by `runtime.destroy()`.

**Behavioral contract:** Per NC Invariant 13, a render failure does not propagate to React, does not corrupt the staging buffer, and does not clear the previous cached render. Per spec line 367, the observer reflects the last *tree* commit, not the last keystroke — intent events carry up-to-the-click `staging_snapshot` separately.

---

## Memory

### `defaultNCProjection`

```typescript
const defaultNCProjection: GraphProjection
// (entities: Entity[], relations: Relation[]) => Record<string, JSONValue>
```

Projection function for memoryjs's `createObservableDataModelFromGraph`. Groups entities by `entityType`, indexes by name for O(1) lookup, and counts relations.

**Output shape** (`NCProjectedData`):

```typescript
interface NCProjectedData {
  entitiesByType: Record<string, NCProjectedEntity[]>;
  entities: Record<string, NCProjectedEntity>;
  relationCount: number;
}

interface NCProjectedEntity {
  name: string;
  entityType: string;
  observations: string[];
  createdAt: string;
  lastModified: string;
}
```

---

## Renderer

### `NCRenderer`

```typescript
function NCRenderer(props: NCRendererProps): JSX.Element
```

The NC React wrapper. Mounts `JSONUIProvider` + `Renderer` with NC's shared stores, validates + reconciles on every committed tree, and dispatches intents to the runtime.

```typescript
interface NCRendererProps {
  tree: UITree;
  runtime: NCRuntime;
  catalog: Catalog<any, any, any>;
  catalogVersion: NCCatalogVersion;
  extraRegistry?: ComponentRegistry;
}
```

| Prop | Required | Description |
|------|----------|-------------|
| `tree` | Yes | The committed tree to render. Must come from a successful stream commit. |
| `runtime` | Yes | NC runtime handle (staging buffer, durable store, emitIntent). |
| `catalog` | Yes | Catalog used to validate the tree before reconciliation. |
| `catalogVersion` | Yes | Version string threaded through emitted IntentEvents. |
| `extraRegistry` | No | Additional component registry entries merged with defaults. |

### Input Components

All five components accept `NCComponentProps`:

```typescript
interface NCComponentProps {
  element: UIElement;
  children?: React.ReactNode;
}
```

| Component | Staging-Bound | Action | Notes |
|-----------|---------------|--------|-------|
| `NCContainer` | No | — | Renders `<div data-key={element.key}>` with children |
| `NCText` | No | — | Renders `<p>` with `props.content` |
| `NCTextField` | Yes (`useStagingField<string>`) | — | `<input type="text">` with label and optional error |
| `NCCheckbox` | Yes (`useStagingField<boolean>`) | — | `<input type="checkbox">` with label |
| `NCButton` | No | Fires `execute({name, params})` | Forwards action.params; `.catch` on rejection |

### `useCommittedTree`

```typescript
function useCommittedTree(
  options: UseCommittedTreeOptions
): ReturnType<typeof useUIStream>
```

Thin wrapper around `@json-ui/react`'s `useUIStream` that pre-selects `commitMode: "atomic"`. NC consumers that reconcile on tree identity MUST use this hook — `useUIStream` directly would allow partial trees to trigger reconciliation.

```typescript
type UseCommittedTreeOptions = Omit<UseUIStreamOptions, "commitMode">
```

---

## Orchestrator

### `createStubIntentHandler(options)`

```typescript
function createStubIntentHandler(
  options: CreateStubIntentHandlerOptions
): NCIntentHandler
```

Builds a deterministic intent handler for testing.

```typescript
interface CreateStubIntentHandlerOptions {
  nextTree: (event: IntentEvent) => UITree;
  onTreeCommit: (tree: UITree) => Promise<void> | void;
}
```

| Option | Description |
|--------|-------------|
| `nextTree` | Pure function mapping an IntentEvent to the next UITree. Throwing propagates through the handler. |
| `onTreeCommit` | Callback fired with the committed tree. Typically `setTree` from `useState`. May return a promise. |

---

## App

### `NCApp`

```typescript
function NCApp(props: NCAppProps): JSX.Element
```

Top-level React mounting point. Owns tree state and wires the intent handler.

```typescript
interface NCAppProps {
  runtime: NCRuntime;
  catalog: Catalog<any, any, any>;
  catalogVersion: NCCatalogVersion;
  initialTree: UITree;
  buildIntentHandler: (setTree: (tree: UITree) => void) => NCIntentHandler;
}
```

| Prop | Description |
|------|-------------|
| `runtime` | NC runtime handle. |
| `catalog` | Catalog for validation. |
| `catalogVersion` | Version constant. |
| `initialTree` | The tree to render before any intent fires. |
| `buildIntentHandler` | Factory that takes `setTree` and returns a handler. SHOULD be memoized or hoisted — inline arrows re-run the install `useEffect` every render. |

**Typical usage**:

```tsx
<NCApp
  runtime={runtime}
  catalog={ncStarterCatalog}
  catalogVersion={NC_CATALOG_VERSION}
  initialTree={initialTree}
  buildIntentHandler={(setTree) =>
    createStubIntentHandler({
      nextTree: (event) => computeNextTree(event),
      onTreeCommit: setTree,
    })
  }
/>
```
