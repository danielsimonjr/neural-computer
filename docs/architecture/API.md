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

`tsconfig.json` sets `"skipLibCheck": false`.

---

## Root barrel (`neural-computer` / `src/index.ts`)

Catalog: `ncStarterCatalog`, `NC_CATALOG_VERSION`, `NC_LLM_ACCEPTANCE_CONTRACT`, `ncFieldIdSchema`, `isSafeFieldId`, `NC_FIELD_ID_MAX_LENGTH`, `NC_STRING_MAX_LENGTH`, `NC_STARTER_ACTIONS`.

Types: `NCIntentHandler`, `NCCatalogVersion`, `NCObserver`, `NCRuntime`, `AnyCatalog`. Values: `asNCCatalogVersion`, `isNCCatalogVersion`. `AnyCatalog` is NC's alias for `Catalog<any, any, any>` (JSON-UI method variance). JSON-UI will export the same name; until CI pins that SHA, NC owns the alias.

Runtime: `createNCRuntime`, `CreateNCRuntimeOptions`.

Memory: `defaultNCProjection`, `NCProjectedData`, `NCProjectedEntity`, `NCProjectedRelation`.

Renderer: `NCRenderer`, `NCContainer`, `NCText`, `NCTextField`, `NCCheckbox`, `NCSelect`, `NCButton`, `useCommittedTree`, `NCErrorBoundary`, plus `NCRendererProps`, `NCComponentProps`, `UseCommittedTreeOptions`.

Orchestrator: `createStubIntentHandler`, `createLlmIntentHandler`, `createAnthropicIntentHandler`, `composeNcObservation`.

App: `NCApp`, `NCAppProps`.

Observer: `createNCObserver`, `ncHeadlessRegistry`, `CreateNCObserverOptions`.

Compute: `createPythonRepl`, `NCReplError`, `NC_REPL_CONTEXT_NAME`, caps, `NCPythonRepl`. Not exported from `neural-computer/react`.

`neural-computer/core` is the same list minus renderer and app (compute included). `neural-computer/react` is renderer and app only.

---

## Catalog

### `ncStarterCatalog`

Six components (`Container`, `Text`, `TextField`, `Checkbox`, `Select`, `Button`) and two actions (`submit_form`, `cancel`). Version string `NC_CATALOG_VERSION` is `"nc-starter-0.3"`.

Container is a minimal flex wrapper (`direction` column or row). TextField supports `multiline` (textarea) and `inputType`. Select is a native list of string options. `Button.action.name` is the enum `submit_form | cancel`. `NCButton` forwards `action.params` to `execute()`.

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
  catalog: AnyCatalog;
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
  catalog: AnyCatalog;
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
  catalog: AnyCatalog;
  catalogVersion: NCCatalogVersion;
  extraRegistry?: ComponentRegistry;
  onValidationError?: (error: unknown) => void;
  onRenderError?: (error: Error) => void;
}
```

Invalid trees are not passed to JSON-UI. Built-in registry keys cannot be overridden. `NCErrorBoundary` wraps the tree.

### Input components

The six built-ins accept `NCComponentProps` (`element`, optional `children`). `NCContainer` is flex, not a general layout system. `NCTextField` may render a textarea. `NCSelect` is a native `<select>`. `NCButton` forwards `{name, params}` and disables while `isIntentInFlight`.

### `useCommittedTree`

Thin wrapper around `useUIStream` with `commitMode: "atomic"`. Required for streamed trees. `NCApp` plus the stub or LLM handler validate complete trees instead. The LLM handler does not POST patches to this hook.

### `NCErrorBoundary`

Class boundary. Optional `onError`. Exported from the React entries.

---

## Orchestrator

### `createStubIntentHandler(options)`

```typescript
interface CreateStubIntentHandlerOptions {
  catalog: AnyCatalog; // required; nextTree is validated
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
  catalog: AnyCatalog;
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

---

## Compute

### `createPythonRepl(options?)`

```typescript
function createPythonRepl(
  options?: CreatePythonReplOptions,
): Promise<NCPythonRepl>;

interface NCPythonRepl {
  exec(code: string): Promise<NCReplExecResult>;
  set(name: string, value: unknown): Promise<void>;
  get(name: string): Promise<unknown>;
  loadContext(text: string): Promise<void>;
  reset(): Promise<void>;
  isBusy(): boolean;
  destroy(): Promise<void>;
}
```

**Async** (spawn + handshake). Default interpreter `python3`. One operation at a time; a second call throws `NCReplError("busy")`. `exec` fulfills with `{ok, stdout, stderr, truncated, error?}` for user-code failures. Infrastructure failures (timeout, spawn, destroyed, limit) throw `NCReplError`. Timeout kills the worker and respawns empty. `loadContext` is `set("context", text)`. Optional `llmQuery` implements in-REPL `llm_query`. Spec: `docs/specs/2026-08-29-compute-rlm-repl-design.md`. Not a field on `NCRuntime`.

---

## LLM handler

### `createLlmIntentHandler(options)`

```typescript
function createLlmIntentHandler(
  options: CreateLlmIntentHandlerOptions,
): NCIntentHandler;
```

Same signature as the stub. Requires `runtime`, `catalog`, `onTreeCommit`, and an `NCLlmTransport`. Optional `repl` advertises Python tools. Optional `onDurableWrite` advertises `durable_write`. The model must call `commit_ui_tree` with a catalog-valid tree within `maxRounds` (default 8). Invalid trees come back as tool errors. Spec: `docs/specs/2026-08-29-llm-intent-handler-design.md`.

`createAnthropicIntentHandler` / `createAnthropicTransport` map this onto Anthropic Messages. Inject `send` in tests. This handler commits complete trees; it does not POST JSON patches to `useCommittedTree`.

`durable_write` is always advertised. It prefers `onDurableWrite`, then `durableStore.write` (memoryjs `onWrite`), then `durableStore.set` (in-memory).
