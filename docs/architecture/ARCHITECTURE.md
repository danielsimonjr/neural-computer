# Neural Computer - System Architecture

**Version**: 0.1.0
**Last Updated**: 2026-04-16

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
10. [Path C Readiness](#path-c-readiness)

---

## System Overview

Neural Computer is a TypeScript runtime providing:

- **Intent-Event UI Architecture**: User input accumulates in a staging buffer; the LLM only observes it when a named action fires
- **Catalog-Constrained Rendering**: Every UI tree is validated against a Zod-typed component catalog before rendering
- **Mechanical Reconciliation**: Staging buffer entries are preserved or dropped based solely on field ID presence in the committed tree
- **Backpressure-Gated Dispatch**: One intent at a time; concurrent intents are rejected, not queued
- **Knowledge Graph Projection**: memoryjs entities projected into the React data model for display components

### Key Statistics (v1)

| Metric | Value |
|--------|-------|
| Source Files | 17 TypeScript files |
| Lines of Code | ~830 |
| Public Exports | 24 (13 values + 11 types) |
| Tests | 47 across 11 files |
| Circular Dependencies | 0 |
| Spec Invariants | 11, all tested |

---

## Architecture Principles

### 1. Access Discipline Over Ontology

The staging buffer is real state. The spec does not pretend it is "not state" — it names it explicitly along with every other state surface. The useful guarantee is that the LLM orchestrator's observation surface is narrow: exactly `(durable state + intent event payloads)`. This is an access constraint, not an ontological claim.

### 2. Mechanical Reconciliation

The buffer reconciles itself. The LLM never imperatively manipulates it — it only emits trees. Same field ID present = preserve. Field ID absent = drop. No "clear form" instruction. No "keep input" instruction. The LLM controls the buffer's contents by controlling which fields appear in the next tree.

### 3. Deferred Handler Binding

The runtime is created synchronously at app start, but the intent handler (which closes over React's `setTree`) is installed later via `setIntentHandler` in a `useEffect`. This bridges the gap between runtime construction and React's post-mount lifecycle without mutating state across function boundaries.

### 4. Buffer Isolation

The orchestrator module never imports from the renderer, React, or any rendering library. It sees only `IntentEvent` objects from `@json-ui/core`. This is enforced structurally by a meta-test (`buffer-isolation.test.ts`) that walks every non-test file under `src/orchestrator/` and asserts no forbidden import pattern.

### 5. Validate-Then-Walk

After `catalog.validateTree(tree)`, all downstream code walks `result.data` (the Zod-parsed/stripped tree), never the raw `tree` prop. Zod v4 strips unknown keys by default; walking the raw tree would pick up phantom props that the validator silently dropped.

---

## System Context

```
┌─────────────────────────────────────────────────────────┐
│                    Host Application                      │
└────────────────────────┬────────────────────────────────┘
                         │ Library API
┌────────────────────────┴────────────────────────────────┐
│                  Neural Computer Runtime                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Layer 1: App (NCApp)                              │  │
│  │  Tree state (useState) + handler wiring (useEffect)│  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │                              │
│  ┌────────────────────────┴───────────────────────────┐  │
│  │  Layer 2: Renderer (NCRenderer)                    │  │
│  │  ┌──────────────┬──────────────┬────────────────┐  │  │
│  │  │ Validate     │ Reconcile    │ Input Components│  │  │
│  │  │ (catalog)    │ (staging)    │ (staging hooks) │  │  │
│  │  └──────────────┴──────────────┴────────────────┘  │  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │                              │
│  ┌────────────────────────┴───────────────────────────┐  │
│  │  Layer 3: Runtime (createNCRuntime)                │  │
│  │  StagingBuffer + durableStore + backpressure gate  │  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │                              │
│  ┌────────────────────────┴───────────────────────────┐  │
│  │  Layer 4: Orchestrator (createStubIntentHandler)   │  │
│  │  IntentEvent → nextTree → onTreeCommit             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Catalog: ncStarterCatalog + NC_CATALOG_VERSION    │  │
│  │  5 components, 2 actions, Zod-typed props          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Memory: defaultNCProjection                       │  │
│  │  memoryjs entities → ObservableDataModel            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
┌─────────┴──────────┐   ┌─────────────┴─────────────┐
│  @json-ui/core     │   │  @danielsimonjr/memoryjs   │
│  @json-ui/react    │   │  (knowledge graph)          │
│  (renderer)        │   │                             │
└────────────────────┘   └───────────────────────────────┘
```

---

## Layer Architecture

### Layer 1: App (`src/app/`)

`NCApp` owns the current UITree in `useState` and wires the intent handler to the runtime on mount via `useEffect`. The `buildIntentHandler` prop is a factory that takes `setTree` and returns an `NCIntentHandler`, bridging runtime construction with React's lifecycle.

Callers who need to own tree state themselves (e.g., because the tree comes from a `useUIStream` hook running elsewhere) mount `NCRenderer` directly and call `runtime.setIntentHandler` manually.

### Layer 2: Renderer (`src/renderer/`)

`NCRenderer` mounts `@json-ui/react`'s `JSONUIProvider` with NC's runtime-shared `StagingBuffer` and `ObservableDataModel`. On every committed tree, it:

1. Validates the tree against the catalog (`catalog.validateTree`)
2. Walks the **validated** tree (`result.data`) to collect live field IDs
3. Reconciles the staging buffer — drops entries not in the live set
4. Wires `onIntent` to `runtime.emitIntent` with a `.catch` for diagnostics

Reconciliation runs in `useLayoutEffect` (not `useEffect`) to close the one-frame window where an orphan field's staging value would be visible between DOM mutation and paint.

Input components (`NCTextField`, `NCCheckbox`, `NCButton`) bind to the shared `StagingBuffer` via `useStagingField` and fire catalog actions via `useActions().execute`.

### Layer 3: Runtime (`src/runtime/`)

`createNCRuntime({ durableStore })` returns an `NCRuntime` with:

- A fresh `StagingBuffer` (created via `@json-ui/core`'s `createStagingBuffer`)
- A mutable intent-handler slot (installed later via `setIntentHandler`)
- A backpressure gate (`intentInFlight` boolean, enforcing Invariant 10)
- A `destroy()` method for cleanup

The handler is captured via `const currentHandler = intentHandler` BEFORE the `await`, so mid-flight handler swaps do not corrupt the running call.

### Layer 4: Orchestrator (`src/orchestrator/`)

`createStubIntentHandler` maps an `IntentEvent` to a `UITree` via a pure `nextTree` function and calls `onTreeCommit` with the result. This is the v1 stub; the real Anthropic SDK-backed handler will conform to the same `NCIntentHandler` signature.

The orchestrator module does NOT import React, `@json-ui/react`, or anything from `src/renderer/` or `src/app/`. This is enforced by the buffer-isolation meta-test.

### Cross-Cutting: Catalog (`src/catalog/`)

`ncStarterCatalog` declares 5 components and 2 actions via `@json-ui/core`'s `createCatalog`:

| Component | Props | Role |
|-----------|-------|------|
| `Container` | `{}` | Layout wrapper with children |
| `Text` | `{ content: string }` | Display text |
| `TextField` | `{ id, label, placeholder?, error? }` | Text input bound to staging |
| `Checkbox` | `{ id, label }` | Boolean input bound to staging |
| `Button` | `{ label, action?: { name, params? } }` | Fires catalog actions |

Every input component carries `id: z.string()` for staging-buffer keying. `NC_CATALOG_VERSION = "nc-starter-0.1"` is threaded through every emitted `IntentEvent`.

### Cross-Cutting: Memory (`src/memory/`)

`defaultNCProjection` groups memoryjs entities by type and builds an O(1) name-indexed map for display components. Relations are counted but not projected in v1.

---

## State Surfaces

The NC spec names six state surfaces explicitly. Each has a declared owner and a declared read discipline.

| Surface | Owner | Orchestrator Access | Persistence |
|---------|-------|---------------------|-------------|
| **Durable state** | memoryjs | Read/write freely | Across sessions |
| **Current UI tree** | LLM (re-emitted each cycle) | None (pure derivation) | None |
| **Staging buffer** | NCRenderer wrapper | Read-only, on intent flush only | In-memory, dies on unmount |
| **In-flight intent flag** | createNCRuntime | Implicit (backpressure gate) | In-memory |
| **Catalog version** | Config constant | Read-only, on IntentEvent | Constant per session |
| **LLM session state** | Anthropic SDK | Invisible to NC | Within session |

The sixth surface (LLM session state) is the Anthropic SDK's prompt-cache and tool-use state between calls. It is durable within a session but invisible to the rest of the system. NC treats it as an implementation detail of the orchestrator — its existence is acknowledged rather than managed.

---

## Key Design Decisions

### Why a mutable handler slot instead of constructor injection?

React's `useState` only exists after the component mounts. The intent handler needs to close over `setTree`, which means the handler cannot be created until after React's `useEffect` runs. The mutable slot via `setIntentHandler` lets the runtime be constructed synchronously at app start while the handler is installed later.

### Why `useLayoutEffect` for reconciliation?

`useEffect` runs asynchronously after paint. Between DOM mutation and the effect firing, there is a one-frame window where an orphan field's unmounted React component has already removed itself from the DOM but its staging value is still in the buffer. Any code that reads the buffer during this window (e.g., a sibling component's render) would see stale data. `useLayoutEffect` runs synchronously after DOM mutations but before paint, closing this window. The reconcile is a pure in-memory operation, so the timing has no perf cost.

### Why walk `result.data` instead of the raw `tree`?

Zod v4 object schemas strip unknown keys by default. A Container element with a stray `id: "phantom"` prop passes `catalog.validateTree` (the key is stripped in `result.data`) but `collectFieldIds(rawTree)` would still pick it up, wrongly preserving a phantom staging entry forever. Walking the validated tree avoids this class of bugs entirely.

### Why `.catch` on every `execute()` and `emitIntent()`?

Both return `Promise<void>` and can reject. A bare `void` silently swallows the rejection, turning real errors into a UI that appears to do nothing. The `.catch(err => console.error(...))` gives a diagnostic trail. The `intentInFlight` flag clears in `finally` regardless, so the runtime recovers either way.

---

## Staging Buffer Rules

Derived from the spec (`docs/specs/2026-04-11-ephemeral-ui-state-design.md`):

1. **Ownership**: The buffer is owned by NCRenderer, not by JSON-UI. The orchestrator never reads it directly.
2. **Keying**: Entries are keyed by the element's `id` prop. Field IDs must be unique within a tree.
3. **Reconciliation**: On re-render, field IDs present in the new tree are preserved; absent IDs are dropped. Props do not affect keying.
4. **Flush**: On intent events only. The buffer is snapshotted (not consumed) and sent as `staging_snapshot`. The buffer stays live for the next cycle.

---

## Failure Modes

| Risk | Handling |
|------|----------|
| LLM emits malformed tree | `catalog.validateTree` returns `success: false`; reconcile is skipped, buffer untouched |
| Streaming response times out | `useCommittedTree` (atomic mode) suppresses partial trees; reconcile never runs on incomplete data |
| NCRenderer unmounts | Buffer dies. Deliberate non-goal — persistent drafts are a separate spec |
| Handler throws | `emitIntent` propagates the rejection; NCRenderer's `.catch` logs it; `intentInFlight` clears in `finally` |
| Duplicate field IDs | `validateUniqueFieldIds` (inside `catalog.validateTree`) returns `fieldIdError`; reconcile skipped |

---

## Testing Strategy

- **Unit tests**: Per-module coverage for types, catalog, runtime, orchestrator, renderer, app, memory (9/17 source files have direct test files; the 8 untested files are barrel re-exports with zero logic)
- **Meta-test**: `buffer-isolation.test.ts` walks orchestrator source files and asserts no forbidden imports
- **Integration test**: `integration.test.tsx` covers the full Path C React flow end-to-end (type → submit → intent → reconcile)
- **Regression test**: Zod strip regression in `nc-renderer.test.tsx` uses `as unknown as UITree` to test phantom prop behavior
- **Invariant coverage**: All 11 spec invariants have at least one dedicated test (see [INVARIANTS.md](./INVARIANTS.md))

---

## Path C Readiness

Path C calls for a headless renderer (`@json-ui/headless`) running alongside the React renderer on the same shared stores. The v1 primitives are shaped for this:

- `NCRuntime.stagingBuffer` and `NCRuntime.durableStore` are shared references that a headless session can consume
- The `FORBIDDEN_IMPORTS` list in `buffer-isolation.test.ts` already includes `@json-ui/headless` — ensuring the orchestrator stays renderer-agnostic when headless lands
- `collectFieldIds` lives in `@json-ui/core` (not in headless or react) so both paths can reach it

What is NOT in v1:
- No headless session is mounted
- No dual-backend tree comparison
- No LLM Observer layer consuming the headless output

These are separate specs.

---

*Last Updated*: 2026-04-16
*Version*: 0.1.0
