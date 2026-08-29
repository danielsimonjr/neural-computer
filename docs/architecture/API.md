# Neural Computer - API Reference

**Version**: 0.1.0 (docs refreshed 2026-08-29)
**Last Updated**: 2026-08-29

The package exposes three entry points via `exports` in `package.json`.

```typescript
// Client Components / tests (pulls React)
import { NCApp, createNCRuntime /* ... */ } from "neural-computer";
import { NCApp, NCRenderer } from "neural-computer/react";

// Node / orchestrator (no React, no @json-ui/react)
import { createNCRuntime, createStubIntentHandler } from "neural-computer/core";
```

`src/react.ts` is marked `"use client"`. Import `neural-computer/react` (or the root barrel) from a Client Component in Next.js App Router. Import `neural-computer/core` from Server Components and Node processes.

React 19 is a **peer dependency**. Host applications must dedupe React so `@json-ui/react` and NC share one dispatcher. This package's npm `overrides` apply only to its own install, not to consumers (NC-086). Pin `react` / `react-dom` in the host, or add host-level overrides.

`tsconfig.json` still sets `"skipLibCheck": true`.

---

## Root barrel (`neural-computer` / `src/index.ts`)

Catalog: `ncStarterCatalog`, `NC_CATALOG_VERSION`, `NC_LLM_ACCEPTANCE_CONTRACT`, `ncFieldIdSchema`, `isSafeFieldId`, `NC_FIELD_ID_MAX_LENGTH`, `NC_STRING_MAX_LENGTH`, `NC_STARTER_ACTIONS`.

Types: `NCIntentHandler`, `NCCatalogVersion`, `NCObserver`, `NCRuntime`. Values: `asNCCatalogVersion`, `isNCCatalogVersion`.

Runtime: `createNCRuntime`, `CreateNCRuntimeOptions`.

Memory: `defaultNCProjection`, `NCProjectedData`, `NCProjectedEntity`, `NCProjectedRelation`.

Renderer: `NCRenderer`, `NCContainer`, `NCText`, `NCTextField`, `NCCheckbox`, `NCButton`, `useCommittedTree`, `NCErrorBoundary`, plus `NCRendererProps`, `NCComponentProps`, `UseCommittedTreeOptions`.

Orchestrator: `createStubIntentHandler`, `CreateStubIntentHandlerOptions`.

App: `NCApp`, `NCAppProps`.

Observer: `createNCObserver`, `ncHeadlessRegistry`, `CreateNCObserverOptions`.

`neural-computer/core` is the same list minus renderer and app. `neural-computer/react` is renderer and app only.

---

## Catalog

### `ncStarterCatalog`

Six components (`Container`, `Text`, `TextField`, `Checkbox`, `Select`, `Button`) and two actions (`submit_form`, `cancel`). Version string `NC_CATALOG_VERSION` is `"nc-starter-0.3"`.

Container is a minimal flex wrapper (`direction` column or row). TextField supports `multiline` (textarea) and `inputType`. There is no Select. `Button.action.name` is the enum `submit_form | cancel`. `NCButton` forwards `action.params` to `execute()`.

Field ids use `ncFieldIdSchema`. Strings cap at `NC_STRING_MAX_LENGTH` (8192). `NC_LLM_ACCEPTANCE_CONTRACT` is the prompt-facing accept/reject rule.

### `asNCCatalogVersion` / `isNCCatalogVersion`

Runtime-checked constructor for the `NCCatalogVersion` brand. Throws on empty or >64 character strings. Prefer this over a TypeScript `as` cast.

---

## Types

### `NCIntentHandler`

```typescript
type NCIntentHandler = (event: IntentEvent) => Promise<void>;
```

Rejections propagate through `emitIntent` and are caught by NCRenderer's `.catch`.

### `NCRuntime`

```typescript
interface NCRuntime {
  stagingBuffer: StagingBuffer;
  durableStore: ObservableDataModel;
  observer: NCObserver;
  catalog: Catalog<any, any, any>;
  catalogVersion: NCCatalogVersion;
  emitIntent: (event: IntentEvent) => Promise<void>;
  setIntentHandler: (handler: NCIntentHandler) => void;
  isIntentInFlight: () => boolean;
  subscribeIntentFlight: (listener: () => void) => () => void;
  destroy: () => void;
}
```

`emitIntent` **resolves** when the event is dropped (no handler, already in flight, after destroy). It **rejects** when a bound handler rejects or throws. The in-flight flag always clears in `finally`.

`isIntentInFlight` / `subscribeIntentFlight` are the public backpressure API. NCRenderer uses them via `useSyncExternalStore` so buttons disable.

`destroy` is idempotent. In-flight handlers still run to completion but cannot emit further intents. `setIntentHandler` is ignored after destroy. Unmount of `NCApp` installs a no-op handler so a late completion cannot call `setTree`.

---

## Runtime

### `createNCRuntime(options)`

```typescript
function createNCRuntime(options: CreateNCRuntimeOptions): NCRuntime;
```

**Synchronous.** There is no I/O. `await createNCRuntime(...)` still works because a non-Promise value is awaitable.

```typescript
interface CreateNCRuntimeOptions {
  durableStore: ObservableDataModel;
  catalog: Catalog<any, any, any>;
  catalogVersion?: NCCatalogVersion;
  extraHeadlessRegistry?: HeadlessRegistry;
  onObserverStale?: (consecutiveFailures: number, lastPassId: number) => void;
}
```

`catalog` is required (the observer binds it at construction). `NCRenderer` must pass the same catalog and version references; identity mismatches log and the runtime's copies win.

### `NCObserver`

```typescript
interface NCObserver {
  render: (tree: UITree) => void;
  getLastRender: () => NormalizedNode | null; // deeply frozen
  getLastRenderPassId: () => number;
  getConsecutiveFailures: () => number;
  serialize: (format: "json-string" | "html") => string | null;
  destroy: () => void;
}
```

`serialize("html")` is diagnostic. Do not assign it to `innerHTML`. `createNCObserver` is exported for tests; production code should use `runtime.observer`.

---

## Memory

### `defaultNCProjection`

```typescript
const defaultNCProjection: GraphProjection;
```

Output (`NCProjectedData`): `entitiesByType`, `entities` (by name), `relations` (`NCProjectedRelation`: from, to, relationType), `relationCount`. Null-prototype maps. Duplicate names: last write wins, with a warning. Missing timestamps are `null`.

---

## Renderer

### `NCRenderer`

```typescript
interface NCRendererProps {
  tree: UITree;
  runtime: NCRuntime;
  catalog: Catalog<any, any, any>;
  catalogVersion: NCCatalogVersion;
  extraRegistry?: ComponentRegistry;
  onValidationError?: (error: unknown) => void;
  onRenderError?: (error: Error) => void;
}
```

Invalid trees are not passed to JSON-UI. Built-in registry keys cannot be overridden. `NCErrorBoundary` wraps the tree.

### Input components

All five accept `NCComponentProps` (`element`, optional `children`). `NCContainer` is flex, not a general layout system. `NCTextField` may render a textarea. `NCButton` forwards `{name, params}` and disables while `isIntentInFlight`.

### `useCommittedTree`

Thin wrapper around `useUIStream` with `commitMode: "atomic"`. Required for streamed trees. `NCApp` + the stub handler validate complete trees instead.

### `NCErrorBoundary`

Class boundary. Optional `onError`. Exported from the React entries.

---

## Orchestrator

### `createStubIntentHandler(options)`

```typescript
interface CreateStubIntentHandlerOptions {
  catalog: Catalog<any, any, any>; // required; nextTree is validated
  nextTree: (event: IntentEvent) => UITree;
  onTreeCommit: (tree: UITree) => Promise<void> | void;
}
```

Invalid `nextTree` rejects; `onTreeCommit` is not called.

---

## App

### `NCApp`

```typescript
interface NCAppProps {
  runtime: NCRuntime;
  catalog: Catalog<any, any, any>;
  catalogVersion: NCCatalogVersion;
  initialTree: UITree;
  buildIntentHandler: (setTree: (tree: UITree) => void) => NCIntentHandler;
  extraRegistry?: ComponentRegistry;
  onValidationError?: (error: unknown) => void;
  onRenderError?: (error: Error) => void;
}
```

Changing `initialTree` by reference resets the current tree. `buildIntentHandler` should be memoized or hoisted. Typical usage:

```tsx
<NCApp
  runtime={runtime}
  catalog={ncStarterCatalog}
  catalogVersion={NC_CATALOG_VERSION}
  initialTree={initialTree}
  buildIntentHandler={buildIntentHandler}
/>
```
