# Neural Computer - System Architecture

**Version**: 0.1.0 (docs refreshed 2026-08-29)
**Last Updated**: 2026-08-29

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [System Context](#system-context)
4. [Layer Architecture](#layer-architecture)
5. [State Surfaces](#state-surfaces)
6. [Key Design Decisions](#key-design-decisions)
7. [Staging Buffer Rules](#staging-buffer-rules)
8. [Failure Modes](#failure-modes)
9. [Testing Strategy](#testing-strategy)
10. [Path C: Observer](#path-c-observer)

---

## System Overview

Neural Computer is a TypeScript runtime that ships a catalog-constrained form widget, a stub intent handler, a headless observer cache, and a Python REPL compute arm (`createPythonRepl`). It is **not** yet an LLM-driven application runtime. The shipped UI loop is: user types into staging, a named action emits an `IntentEvent`, the stub (or a future handler) commits a new `UITree`, NCRenderer validates during render and keeps the last-good tree on screen, then reconcile and `observer.render` run after a successful commit. A future handler may also `exec` Python against a loaded `context` variable; the renderer never does.

Key properties: every tree is validated against a Zod-typed catalog before JSON-UI renders it; staging is flushed only on named intents; concurrent intents are rejected and the in-flight flag is public; memoryjs entities are projected into the React data model.

### Key Statistics

| Metric                | Value                                         |
| --------------------- | --------------------------------------------- |
| Test files            | 17 under `src/**/*.test.*`                    |
| Catalog version       | `nc-starter-0.3`                              |
| Named state surfaces  | 7 (compute is a tool, not a surface)          |
| Spec invariants       | 13 UI-runtime, all tested, plus compute rules |
| Circular dependencies | 0                                             |

`skipLibCheck` remains `true` in `tsconfig.json`. React 19 is a peer dependency; host apps must dedupe React (this package's `overrides` do not protect consumers).

---

## Architecture Principles

### 1. Access Discipline Over Ontology

The staging buffer is real state. The spec names it along with every other surface. The useful guarantee is that a future LLM orchestrator's observation surface is narrow: exactly `(durable state + intent event payloads)`. That is an access constraint, not an ontological claim.

### 2. Mechanical Reconciliation

The buffer reconciles itself. The handler never imperatively manipulates it — it only emits trees. Same field id present means preserve. Field id absent means drop. `cancel` is the exception: after the IntentEvent snapshot is built, emitIntent reconciles against an empty set so staging is discarded.

### 3. Deferred Handler Binding

The runtime is created **synchronously** at app start. The intent handler (which closes over React's `setTree`) is installed later via `setIntentHandler` in a `useEffect`. This bridges runtime construction and React's post-mount lifecycle.

### 4. Buffer Isolation

The orchestrator module never imports from the renderer, React, `@json-ui/headless`, `../observer`, `../renderer`, or `../app`. It sees `IntentEvent` objects from `@json-ui/core` and reads the observer only through `runtime.observer` on the handle it is given. Enforced by `buffer-isolation.test.ts`.

### 5. Validate During Render, Walk Stripped Data

`catalog.validateTree(tree)` runs in `useMemo` during render. Failed validation returns the last-good tree to `<Renderer>` (or null on the first paint if `initialTree` is invalid). After a successful parse, all downstream code — reconcile, `observer.render`, and React — walks the Zod-stripped `result.data`, never the raw incoming prop. Zod v4 strips unknown keys; walking the raw tree would pick up phantom props.

---

## System Context

```
┌─────────────────────────────────────────────────────────┐
│                    Host Application                      │
│         (must provide a single React 19 instance)        │
└────────────────────────┬────────────────────────────────┘
                         │ Library API
┌────────────────────────┴────────────────────────────────┐
│                  Neural Computer Runtime                  │
│                                                          │
│  Layer 1: App (NCApp)                                    │
│  Layer 2: Renderer (NCRenderer + inputs + error boundary)│
│  Layer 3: Runtime (createNCRuntime, observer, freeze)    │
│  Layer 4: Orchestrator (createStubIntentHandler)         │
│  Catalog: ncStarterCatalog (nc-starter-0.3)              │
│  Memory:  defaultNCProjection                            │
│  Compute: createPythonRepl (optional; not on NCRuntime)  │
└──────────────────────────────────────────────────────────┘
                         │
          ┌──────────────┴─────────────┐
          │                            │
┌─────────┴──────────┐   ┌─────────────┴─────────────┐
│  @json-ui/core     │   │  @danielsimonjr/memoryjs  │
│  @json-ui/react    │   │  (knowledge graph)        │
│  @json-ui/headless │   │                           │
└────────────────────┘   └───────────────────────────┘
```

---

## Layer Architecture

### Layer 1: App (`src/app/`)

`NCApp` owns the current UITree in `useState` and wires the intent handler on mount. Changing the `initialTree` **reference** resets the current tree (same as remounting with a new `key`). Unmount installs a no-op handler so a late intent cannot call `setTree`. `extraRegistry`, `onValidationError`, and `onRenderError` are plumbed through to `NCRenderer`.

Callers who own tree state themselves (for example a `useCommittedTree` stream) mount `NCRenderer` directly and call `runtime.setIntentHandler` manually.

### Layer 2: Renderer (`src/renderer/`)

`NCRenderer` mounts `JSONUIProvider` with NC's shared `StagingBuffer` and `ObservableDataModel`. On every incoming `tree` prop it:

1. Validates during render (`useMemo` + `catalog.validateTree`). Identity-checks `catalog` / `catalogVersion` against `runtime.catalog` / `runtime.catalogVersion` and uses the runtime's copies if they diverge.
2. Rejects same-id, different-component-type commits via `field-id-stability.ts`.
3. Passes the last-good Zod-stripped tree to `<Renderer>` (never the raw invalid prop).
4. After a successful commit, `useLayoutEffect` reconciles staging against live ids collected from that stripped tree, then calls `runtime.observer.render` with the same tree. Strict Mode double-invokes are skipped when the incoming `tree` reference was already shadowed.
5. Wires `onIntent` to `runtime.emitIntent` with a `.catch` for diagnostics.
6. Subscribes to `runtime.subscribeIntentFlight` so buttons disable while an intent is in flight.

Input components bind to staging via `useStagingField`. `NCButton` forwards `{name, params}` to `execute()`. `NCErrorBoundary` catches render throws. Three id namespaces must not be conflated: React `key`, `element.key` (`data-key`), and staging field `id` (`data-field-id`).

### Layer 3: Runtime (`src/runtime/`)

`createNCRuntime({ durableStore, catalog, catalogVersion? })` is **synchronous**. It returns an `NCRuntime` with:

- A fresh `StagingBuffer`
- The caller-owned `durableStore`
- The same `catalog` / `catalogVersion` the renderer must echo
- An `observer` whose headless renderer is bound to that catalog at construction
- A mutable intent-handler slot (`setIntentHandler`)
- Public backpressure: `isIntentInFlight()` and `subscribeIntentFlight(listener)`
- `destroy()` (idempotent; in-flight handlers still run to completion but cannot emit further; `setIntentHandler` is ignored after destroy)

`emitIntent` captures `const currentHandler = intentHandler` **before** `await`. Drops (no handler, already in flight, after destroy) **resolve**. Handler failures **reject**. The in-flight flag always clears in `finally`. If `action_name === "cancel"`, staging is reconciled to empty after the event (with its snapshot) has been handed to the handler path — the snapshot is already on the IntentEvent.

`freeze.ts` deep-freezes observer output and provides null-prototype dictionaries for the projection.

### Layer 4: Orchestrator (`src/orchestrator/`)

`createStubIntentHandler` requires `catalog`. It maps an `IntentEvent` to a `UITree` via `nextTree`, **validates** that tree, and calls `onTreeCommit` only on success. Invalid `nextTree` results reject; `onTreeCommit` is not called. There is no Anthropic handler in this package. The orchestrator may import `createPythonRepl` from `src/compute/` (or `neural-computer/core`); it still must not import the renderer, React, headless, or `../observer`.

### Cross-Cutting: Compute (`src/compute/`)

`createPythonRepl({ pythonPath?, timeoutMs?, llmQuery? })` is **async**. It spawns `python3 -u -I -X utf8 worker.py`, waits for a JSON-lines `ready` handshake, and exposes `exec` / `set` / `get` / `loadContext` / `reset` / `isBusy` / `destroy`. One operation at a time (`busy` rather than queue). Timeout SIGKILLs the worker and respawns empty. Restricted builtins are not a jail; see SECURITY.md. Exported from `neural-computer/core`, not from `/react`. Not a field on `NCRuntime`.

### Cross-Cutting: Catalog (`src/catalog/`)

`ncStarterCatalog` declares six components and two actions. `NC_CATALOG_VERSION` is `nc-starter-0.3`. Field ids go through `ncFieldIdSchema` (non-empty, no path separators, not `__proto__` / `constructor` / `prototype`). Strings are capped at 8192 characters. `Button.action.name` is `z.enum(["submit_form", "cancel"])`.

| Component   | Props (v0.2)                                                                    | Role                                                       |
| ----------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `Container` | `direction?: "column" \| "row"`, `visible?`                                     | Minimal flex wrapper. Not a layout system.                 |
| `Text`      | `content`, `visible?`                                                           | Display text                                               |
| `TextField` | `id`, `label`, `placeholder?`, `error?`, `multiline?`, `inputType?`, `visible?` | Staging-bound input; `multiline` is a textarea. No Select. |
| `Checkbox`  | `id`, `label`, `visible?`                                                       | Boolean input                                              |
| `Button`    | `label`, `visible?`, `action?: { name, params? }`                               | Forwards `params` to `execute()`                           |

### Cross-Cutting: Memory (`src/memory/`)

`defaultNCProjection` groups entities by type, indexes by name (last write wins, with a warning on duplicates), and projects relations as `{from, to, relationType}` plus `relationCount`. Maps use null-prototype objects. Missing timestamps become `null`.

### Cross-Cutting: Observer (`src/observer/`)

`createNCObserver` wraps `@json-ui/headless`. `getLastRender()` returns a deeply frozen graph. `serialize("html")` is diagnostic only and is not safe for `innerHTML`. Builtin registry keys cannot be overridden via `extraRegistry` / `extraHeadlessRegistry`.

---

## State Surfaces

The runtime names **seven** surfaces. The April-11 spec originally named five; Path C added the observer cache; the in-flight flag is a first-class public surface after the 2026-08-29 audit.

| Surface                   | Owner                    | Orchestrator Access             | Persistence                |
| ------------------------- | ------------------------ | ------------------------------- | -------------------------- |
| **Durable state**         | memoryjs                 | Read/write freely               | Across sessions            |
| **Current UI tree**       | Handler (re-emitted)     | None (pure derivation)          | None                       |
| **Staging buffer**        | NCRenderer / runtime     | Read-only, on intent flush only | In-memory, dies on unmount |
| **In-flight intent flag** | createNCRuntime          | Implicit; also public API       | In-memory                  |
| **Catalog version**       | Config constant          | Read-only, on IntentEvent       | Constant per session       |
| **LLM session state**     | Future Anthropic SDK     | Invisible to NC                 | Within session             |
| **Observer cache**        | createNCRuntime.observer | `getLastRender` / `serialize`   | In-memory, frozen          |

LLM session state is acknowledged rather than managed. NC does not construct an SDK client.

---

## Key Design Decisions

### Why a mutable handler slot instead of constructor injection?

React's `useState` only exists after the component mounts. The handler needs `setTree`, so it cannot be created until after `useEffect` runs. `setIntentHandler` lets the runtime be constructed synchronously while the handler is installed later.

### Why validate in `useMemo` rather than `useLayoutEffect`?

Validation in an effect runs after React has already committed the incoming `tree` to `<Renderer>`. That was NC-001: invalid trees reached JSON-UI. Validating during render and passing only `renderTree` (last-good stripped data) keeps Invariant 8. Reconcile and `observer.render` still run in `useLayoutEffect` because they are store mutations, not render.

### Why walk `result.data` instead of the raw `tree`?

Zod v4 object schemas strip unknown keys. A Container with a stray `id: "phantom"` passes validation while a walk of the raw tree would preserve a phantom staging entry forever. React and the observer both walk the stripped tree (Invariant 12).

### Why public `isIntentInFlight` instead of a silent drop?

Spec Open Question 2 forbade shipping backpressure as a silent drop. Drops still resolve (they are not errors), but the flag is public, `subscribeIntentFlight` drives `useSyncExternalStore`, and `NCButton` disables while true.

### Why `.catch` on every `execute()` and `emitIntent()`?

Both return promises that can reject. A bare `void` swallows the rejection. The in-flight flag still clears in `finally`.

---

## Staging Buffer Rules

Derived from `docs/specs/2026-04-11-ephemeral-ui-state-design.md`:

1. **Ownership**: The buffer is owned by the runtime / NCRenderer, not by JSON-UI. The orchestrator never reads it directly.
2. **Keying**: Entries are keyed by the element's `id` prop. Field ids must be unique within a tree and must not change component type across commits in one renderer lifetime.
3. **Reconciliation**: On a successful commit, field ids present in the new stripped tree are preserved; absent ids are dropped. Props do not affect keying.
4. **Flush**: On intent events only. The buffer is snapshotted (not consumed) onto `staging_snapshot`. `cancel` then clears it. `submit_form` leaves it for the next reconcile.

---

## Failure Modes

| Risk                         | Handling                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Malformed tree               | `validateTree` fails during render; `<Renderer>` keeps last-good; reconcile skipped             |
| Same id, different type      | `detectFieldIdTypeChanges` rejects; last-good stays                                             |
| Streaming response times out | `useCommittedTree` atomic mode suppresses partial trees; stub handler also validates `nextTree` |
| NCRenderer unmounts          | Buffer dies. Persistent drafts are a separate spec                                              |
| Handler throws               | `emitIntent` rejects; NCRenderer `.catch` logs; `isIntentInFlight` clears in `finally`          |
| Duplicate field ids          | `validateUniqueFieldIds` inside `validateTree`; last-good stays                                 |
| Observer throw               | Last cached render kept; `getConsecutiveFailures` advances (Invariant 13)                       |
| Render throw in a component  | `NCErrorBoundary` shows an alert; `onRenderError` fires                                         |

---

## Testing Strategy

Unit tests live next to modules (catalog, runtime, orchestrator, renderer, app, memory, observer, types, compute). The meta-test `buffer-isolation.test.ts` walks orchestrator source and asserts no forbidden imports, including `../observer`. Compute has a matching isolation test. `integration/path-c.test.tsx` covers type → submit → intent → reconcile → observer. Field-id stability and last-good-tree behavior live in `nc-renderer.test.tsx` and `field-id-stability.test.ts`. All 13 UI invariants have tests (see [INVARIANTS.md](./INVARIANTS.md)).

---

## Path C: Observer

Path C (plan `2026-04-16-headless-dual-backend`) runs `@json-ui/headless` alongside React on the same shared stores. `createNCRuntime` owns the observer; after every successful commit NCRenderer calls `runtime.observer.render(renderTree)` with the Zod-stripped tree React received.

`FORBIDDEN_IMPORTS` includes `@json-ui/headless` and `../observer` so the orchestrator consumes `NormalizedNode` output via `runtime.observer` without importing the observer module. Observer render is a second full tree walk on the layout path (NC-087); it is skipped when the same `tree` reference was already shadowed.

Still deferred: real Anthropic-backed intent handler, persistent staging buffer, catalog migration from `nc-starter-0.1`. Python REPL dispatch shipped 2026-08-29 (`createPythonRepl`).

---

_Last Updated_: 2026-08-29
_Version_: 0.1.0
