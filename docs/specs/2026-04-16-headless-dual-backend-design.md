# Headless Dual-Backend (Path C "LLM Observer") Design

**Status:** Design spec (not yet implemented)
**Date:** 2026-04-16
**Scope:** How the NC runtime maintains a second, non-React normalized view of the current UI tree for the LLM orchestrator to observe.
**Supersedes:** Deferred item #2 in [README.md](../../README.md) roadmap. Dependent on v1 runtime primitives shipped 2026-04-15.

## Context

NC v1 shipped with a React renderer (`NCRenderer`, `NCApp`, input components) that drives what the user sees. The runtime was designed for Path C — a dual-backend integration where the React path is accompanied by a headless path that serves the **LLM orchestrator**. The v1 primitives already expose the shared references (`runtime.stagingBuffer`, `runtime.durableStore`) needed for dual-backend operation, but no v1 code mounts a headless session.

`@json-ui/headless` is live (shipped as Plan 3 on 2026-04-13 in JSON-UI). It exports `createHeadlessRenderer`, `createHeadlessContext`, three serializers (`JsonSerializer`, `JsonStringSerializer`, `createHtmlSerializer`), and a `HeadlessRegistry` type. The renderer is documented as a pure function of `(tree, store-snapshots)` with FROZEN pass-start snapshots per JSON-UI Invariant 15.

This spec decides how the NC runtime wires that headless package into the v1 architecture without disturbing the React path, and what API surface the orchestrator gets for reading the normalized tree.

## The Problem

The orchestrator (today's stub, tomorrow's Anthropic handler) receives `IntentEvent` objects carrying `staging_snapshot`, `action_name`, `action_params`, and `catalog_version`. To compose a rich observation for the LLM, it also needs to know **what the user was looking at** — the current tree, post-visibility, post-reconciliation, with staging values baked in, as structured data the LLM can reason about.

The orchestrator cannot read React state directly (Invariant 7: buffer isolation). It cannot re-run the React render from outside React. It cannot ask `@json-ui/react`'s `Renderer` for the committed node graph — `Renderer` outputs DOM, not a structured tree.

`@json-ui/headless` produces exactly the shape the orchestrator needs: a `NormalizedNode` tree with resolved props, resolved actions, visibility-pruned children, and access to staging + data via `HeadlessContext`. What's missing is the runtime-level plumbing that keeps a headless session in sync with the React path on every tree commit, caches its output, and exposes it to the orchestrator via a pull-based API.

## Decision

**The NC runtime owns a single headless observer session that renders on every successful React tree commit and exposes its output via `runtime.observer.getLastRender()` and `runtime.observer.serialize(format)`.** The observer is created by `createNCRuntime`, driven by `NCRenderer.useLayoutEffect` (one added line after reconcile), and destroyed by `runtime.destroy()`. It is always present, always cheap (only renders when called), and never null.

Four options were considered:

- **A1 — Runtime field, shadow React 1:1 (selected).** `NCRuntime.observer`, renders in the same `useLayoutEffect` as reconcile. Matches React's semantics; pull-based read API; zero new timing concerns.
- **A2 — Separate factory `createNCObserver(runtime, catalog)`.** Callers opt in explicitly. More flexible but duplicates lifecycle management and forces callers to remember to wire it.
- **A3 — Optional boolean on `createNCRuntime({ observer: true })`.** Opt-in via config. Adds a toggle for something that should be always-on.
- **A4 — React-owned via `useState` inside `NCRenderer`.** Hides the observer from the orchestrator, defeating Path C's purpose.

A1 selected because it keeps the "set of shared references the orchestrator needs" in one place (alongside `stagingBuffer` and `durableStore`) and requires no caller ceremony.

## What Lives Where

The observer is a new state surface in NC's runtime. It joins the five existing named surfaces from the v1 spec.

**LLM observer cache.** Owned by the NC runtime's new `src/observer/` module. Holds the most recent `NormalizedNode` tree produced by the headless renderer. Updated synchronously inside `NCRenderer.useLayoutEffect`. Read via `runtime.observer.getLastRender()` / `.serialize()`. This is an in-memory cache; it does not survive `runtime.destroy()` past a final-frame read.

The runtime now owns six shared references the orchestrator can reach without going through React:

1. `stagingBuffer` — in-progress user input (existing)
2. `durableStore` — memoryjs-backed durable state (existing)
3. `emitIntent` — backpressure-gated dispatch (existing)
4. `setIntentHandler` — mutable handler slot (existing)
5. `destroy` — lifecycle (existing)
6. `observer` — LLM observer handle (NEW)

The observer's own internal state consists of:

- A single long-lived `HeadlessRenderer` instance (created via `createHeadlessRenderer` from `@json-ui/headless`) configured with NC's headless component registry.
- A cached `NormalizedNode | null` field — `null` before the first successful render, otherwise the result of the most recent successful `render()` call.
- A `destroyed` boolean for idempotent destroy.

## Observer Rules

### Rule 1 — Ownership

The observer lives in `src/observer/` inside the NC repo. JSON-UI's `@json-ui/headless` remains unchanged. The observer is a thin wrapper around `createHeadlessRenderer` that adds caching, NC-specific error handling, and NC's component registry.

The orchestrator never touches `@json-ui/headless` directly. Its only interaction is via `runtime.observer.getLastRender()` / `runtime.observer.serialize(format)`.

### Rule 2 — Shadow cadence

The observer renders on every successful React tree commit. NCRenderer's `useLayoutEffect` calls `runtime.observer.render(result.data!)` immediately after `runtime.stagingBuffer.reconcile(liveIds)` — passing the **validated, Zod-stripped** tree, not the raw `tree` prop. This mirrors the v1 Zod-strip regression fix so the LLM sees the same post-strip tree that the React path reconciled against, and it keeps NCRenderer as the single validation point (the observer does not re-validate; it trusts its caller).

**The observer does not reconcile.** The React path owns `stagingBuffer.reconcile()` — the observer reads the buffer via JSON-UI's `ReadonlyStagingView` inside a FROZEN pass-start snapshot (JSON-UI Invariant 15, `context.ts:94-99`). There is only one reconciliation event per tree commit, performed by NCRenderer.

If `catalog.validateTree` fails, NCRenderer skips both reconcile and `observer.render()`. The cached observer result stays at the last-known-good tree. This extends NC Invariant 9 (partial-tree safety) to the observer.

### Rule 3 — Keying

The observer uses the SAME tree the React path uses. There is no separate "observer tree" — the whole point of the observer is that the LLM sees what the user sees. Staging values are included via the headless context's staging view; resolved action params are included via headless's existing `resolveActionWithStaging` pass.

### Rule 4 — Failure isolation

If the headless renderer throws during `observer.render()` (a registry bug, a malformed element the React path somehow accepted, a catalog mismatch), the observer catches the error, logs via `console.warn`, and leaves the previous cached result intact. React keeps working; the observer serves its last good result. The error does NOT propagate to NCRenderer's `useLayoutEffect` — React must not crash because of an observer bug.

### Rule 5 — Pull-based reads

Callers read via `getLastRender()` or `serialize(format)`. There is no subscribe/push API in v1. The orchestrator is naturally pull-based — it reads the cache when composing an observation, not reactively. Adding subscribe later (for diagnostics consumers) is non-breaking.

## Surfaces and File Layout

```
neural-computer/
└── src/
    └── observer/                       # NEW module
        ├── index.ts                    # barrel: createNCObserver, types, registry
        ├── nc-observer.ts              # createNCObserver factory + NCObserver interface
        ├── nc-headless-components.ts   # 5 headless components mirroring React
        └── nc-observer.test.ts         # unit tests
```

Changes to existing files:

- `src/types/nc-types.ts` — add `observer: NCObserver` to `NCRuntime` interface; add the `NCObserver` interface itself.
- `src/runtime/context.ts` — `CreateNCRuntimeOptions` gains two required fields: `catalog: Catalog<any, any, any>` and `catalogVersion?: NCCatalogVersion`. `createNCRuntime` constructs the observer internally via `createNCObserver({ catalog, staging: stagingBuffer, data: durableStore, catalogVersion })` and wires it into the returned handle. `destroy()` calls `observer.destroy()`.
- `src/renderer/nc-renderer.tsx` — one added line in the existing `useLayoutEffect` after reconcile: `runtime.observer.render(result.data!)`. The observer's bound catalog is already the same catalog NCRenderer validates against (both come from the caller), so no catalog argument is passed per-render.
- `src/app/nc-app.tsx` — `NCApp` already receives `catalog` and `catalogVersion` as props. These must be forwarded into the `createNCRuntime` call when constructing the runtime. Existing callers that construct the runtime ahead of `NCApp` (e.g., the README quickstart) must thread catalog + catalogVersion into `createNCRuntime` — this is a breaking change to the runtime factory signature. Documented in the migration note below.
- `src/index.ts` — re-export `createNCObserver`, `ncHeadlessRegistry`, `CreateNCObserverOptions`; ensure `NCObserver` type is reachable.

**Migration note.** The `createNCRuntime` signature change is a minor breaking change. Before:

```typescript
await createNCRuntime({ durableStore });
```

After:

```typescript
await createNCRuntime({
  durableStore,
  catalog: ncStarterCatalog,
  catalogVersion: NC_CATALOG_VERSION,
});
```

This is unavoidable: the observer's headless renderer requires the catalog at construction (`renderer.ts:27`), and the runtime owns the observer. README quickstart and AGENTS.md examples must be updated alongside the implementation.

### NC headless component registry

Five headless components mirroring the React `input-components.tsx` surface. `HeadlessComponent` is typed by JSON-UI as a **positional** function `(element, ctx, children) => NormalizedNode` (`@json-ui/headless/registry.ts:10-14`), not destructured.

```typescript
// src/observer/nc-headless-components.ts
import type {
  HeadlessComponent,
  HeadlessRegistry,
  NormalizedNode,
} from "@json-ui/headless";

const NCContainerHeadless: HeadlessComponent = (element, _ctx, children) => ({
  type: "Container",
  key: element.key,
  props: {},
  children,
  meta: { visible: true },
});

const NCTextHeadless: HeadlessComponent = (element) => ({
  type: "Text",
  key: element.key,
  props: { content: (element.props as { content: string }).content },
  children: [],
  meta: { visible: true },
});

const NCTextFieldHeadless: HeadlessComponent = (element, ctx) => {
  const props = element.props as {
    id: string;
    label: string;
    placeholder?: string;
    error?: string;
  };
  // ctx.staging is a ReadonlyStagingView: {get, has, snapshot}. `get` already
  // returns `JSONValue | undefined`, so the `has` guard is not required for
  // correctness — but it clarifies intent and lets the NormalizedNode omit
  // the `currentValue` prop entirely when the field has never been typed.
  const value = ctx.staging.has(props.id) ? ctx.staging.get(props.id) : undefined;
  return {
    type: "TextField",
    key: element.key,
    props: value === undefined ? props : { ...props, currentValue: value },
    children: [],
    meta: { visible: true },
  };
};

const NCCheckboxHeadless: HeadlessComponent = (element, ctx) => {
  const props = element.props as { id: string; label: string };
  const value = ctx.staging.has(props.id) ? ctx.staging.get(props.id) : undefined;
  return {
    type: "Checkbox",
    key: element.key,
    props: value === undefined ? props : { ...props, currentValue: value },
    children: [],
    meta: { visible: true },
  };
};

const NCButtonHeadless: HeadlessComponent = (element) => {
  // Note: action.params arrive pre-resolved by the context's
  // resolveActionWithStaging pass — literal values, not DynamicValue refs.
  const props = element.props as {
    label: string;
    action?: { name: string; params?: Record<string, unknown> };
  };
  return {
    type: "Button",
    key: element.key,
    props,
    children: [],
    meta: { visible: true },
  };
};

export const ncHeadlessRegistry: HeadlessRegistry = {
  Container: NCContainerHeadless,
  Text: NCTextHeadless,
  TextField: NCTextFieldHeadless,
  Checkbox: NCCheckboxHeadless,
  Button: NCButtonHeadless,
};
```

### NCObserver interface

```typescript
// src/types/nc-types.ts — added to existing types
import type { NormalizedNode } from "@json-ui/headless";
import type { UITree } from "@json-ui/core";

export interface NCObserver {
  /** Called by NCRenderer after every successful tree commit. Runs the
   *  headless renderer synchronously; caches the result. Errors are logged
   *  and leave the previous cached render intact. Catalog is NOT passed
   *  per-render — it was bound at observer construction. */
  render(tree: UITree): void;

  /** Returns the normalized tree from the most recent successful render,
   *  or null if no render has completed yet. */
  getLastRender(): NormalizedNode | null;

  /** Serialize the last render. Returns null if no render has completed.
   *  - "json":        structured NormalizedNode (identity; primarily for
   *                    callers who would otherwise use getLastRender())
   *  - "json-string": JSON.stringify(lastRender) — for LLM prompts
   *  - "html":        debug HTML preview via a fallback emitter
   *                    (not production UI; primarily for diagnostics) */
  serialize(format: "json-string" | "html"): string | null;

  /** Monotonic counter incremented on every successful render. Zero before
   *  any render has completed. Pairs with getLastRender() so callers can
   *  detect runaway staleness (e.g. if this counter doesn't advance across
   *  a tree commit, the observer registry is failing). */
  getLastRenderPassId(): number;

  /** Number of consecutive render() calls that have thrown since the last
   *  successful render. Callers can use this to detect that the cached
   *  tree is becoming stale. Reset to 0 on each successful render. */
  getConsecutiveFailures(): number;

  /** Release resources. Idempotent. */
  destroy(): void;
}
```

### createNCObserver factory (sketch)

```typescript
// src/observer/nc-observer.ts
import {
  createHeadlessRenderer,
  JsonStringSerializer,
  createHtmlSerializer,
  type NormalizedNode,
} from "@json-ui/headless";
import type {
  Catalog,
  ObservableDataModel,
  StagingBuffer,
  UITree,
} from "@json-ui/core";
import { ncHeadlessRegistry } from "./nc-headless-components";
import type { NCObserver } from "../types";

export interface CreateNCObserverOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catalog: Catalog<any, any, any>;
  staging: StagingBuffer;
  data: ObservableDataModel;
  catalogVersion?: string;
}

// Minimal fallback-only HTML serializer for diagnostics. Production HTML
// output (if ever needed) belongs in a separate spec with per-type emitters.
const ncHtmlSerializer = createHtmlSerializer({
  emitters: {},
  // `fallback` defaults to <div data-type="...">children</div> per
  // html.ts:41-42. That's exactly what we want for diagnostic output.
});

export function createNCObserver(options: CreateNCObserverOptions): NCObserver {
  // createHeadlessRenderer (renderer.ts:25-37) requires `catalog`, accepts
  // optional `staging` and `data` keyed as such (NOT stagingBuffer/durableStore).
  // The renderer.render(tree) signature takes a single argument (renderer.ts:40).
  const renderer = createHeadlessRenderer({
    catalog: options.catalog,
    registry: ncHeadlessRegistry,
    staging: options.staging,
    data: options.data,
    catalogVersion: options.catalogVersion,
  });

  let lastRender: NormalizedNode | null = null;
  let lastPassId = 0;
  let consecutiveFailures = 0;
  let destroyed = false;

  return {
    render(tree) {
      if (destroyed) return;
      try {
        lastRender = renderer.render(tree);
        lastPassId += 1;
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures += 1;
        console.warn(
          `[NC] Observer render threw (failure #${consecutiveFailures}); ` +
            `keeping last good cache:`,
          err,
        );
      }
    },
    getLastRender() {
      return lastRender;
    },
    getLastRenderPassId() {
      return lastPassId;
    },
    getConsecutiveFailures() {
      return consecutiveFailures;
    },
    serialize(format) {
      if (lastRender === null) return null;
      // JsonSerializer is an IDENTITY serializer returning NormalizedNode
      // (json.ts:5-9), not a string. Removed from the serialize() surface —
      // callers who want the structured node should use getLastRender().
      if (format === "json-string") return JsonStringSerializer.serialize(lastRender);
      if (format === "html") return ncHtmlSerializer.serialize(lastRender);
      throw new Error(`[NC] Unknown serialize format: ${format as string}`);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      renderer.destroy();
    },
  };
}
```

**Note on the serialize API surface.** `JsonSerializer` in `@json-ui/headless` is an **identity** serializer (returns the `NormalizedNode` unchanged per `json.ts:5-9`) — it exists for callers who want a uniform `Serializer<T>` shape. Because callers with a `NormalizedNode` already have access to it via `getLastRender()`, the NC observer's `serialize()` omits the `"json"` format; requesting it would be redundant with `getLastRender()`. `"json-string"` returns `JSON.stringify(node)` for LLM prompt composition; `"html"` returns a fallback-only diagnostic HTML (not production UI — that would require per-type emitters mapping Container, Text, TextField, Checkbox, and Button to real markup, which is out of scope for v1).

**Catalog is bound at construction**, not passed per-render. This is dictated by JSON-UI's `HeadlessRendererOptions.catalog` being required at factory time (`renderer.ts:27`) and the absence of a catalog parameter on `HeadlessRenderer.render` (`renderer.ts:40`). The NC runtime must therefore thread the catalog into `createNCRuntime` (see next section).

## New Invariants

Extending the existing 11 NC invariants:

- **Invariant 12 — Observer shadows React renders.** After a successful React tree commit, `runtime.observer.getLastRender()` returns a `NormalizedNode` tree derived from the same validated tree that drove the React render. Verified by an integration test that reads `getLastRender()` after `rerender()` and checks the element keys match.

- **Invariant 13 — Observer failure is best-effort, but detectable.** A headless render exception does not propagate to React, does not corrupt the staging buffer, and does not clear the previous cached render. React's UI keeps working; `console.warn` is the diagnostic trail. The observer additionally exposes `getLastRenderPassId()` (monotonic; advances only on success) and `getConsecutiveFailures()` (resets on success) so callers can detect runaway staleness — e.g. if the pass ID does not advance across three tree commits, the observer registry has a systematic bug and the cached tree is increasingly stale. Verified by a test that injects a throwing registry, asserts React keeps rendering + staging untouched + `getLastRender()` returns the prior successful tree, AND asserts `getConsecutiveFailures()` advances while `getLastRenderPassId()` does not.

## Failure Modes

| Risk | Handling |
|------|----------|
| Headless registry throws | `console.warn("[NC] Observer render threw (failure #N)")`, keep previous cache, React unaffected, `getConsecutiveFailures()` advances, `getLastRenderPassId()` does not |
| Tree fails catalog validation | Observer render skipped (same as reconcile); cache stays at last good (Invariant 9) |
| `runtime.destroy()` called | Observer destroyed; final cached value still readable until runtime is GC'd |
| Observer read before any render | `getLastRender()` / `serialize()` return `null` — caller must handle |
| LLM observer sees stale staging | By design — observer reflects last *tree* commit, not last keystroke. Intent events carry up-to-the-click `staging_snapshot` separately |
| Multiple React paths mount same runtime | Not supported in v1. Behavior undefined; may corrupt observer cache |

## Testing Strategy

Estimated 10 new `it()` blocks. Current suite 47 → ~57.

| Test file | `it()` block |
|-----------|---------------|
| `src/observer/nc-observer.test.ts` | Factory constructs observer; `getLastRender()` null before first render; `getLastRenderPassId() === 0`; `getConsecutiveFailures() === 0` |
| `src/observer/nc-observer.test.ts` | After `render(tree)`, `getLastRender()` returns a `NormalizedNode`; `getLastRenderPassId() === 1`; repeated render advances passId monotonically |
| `src/observer/nc-observer.test.ts` | `serialize("json-string")` returns `JSON.stringify(lastRender)` (byte-for-byte equal) |
| `src/observer/nc-observer.test.ts` | `serialize("html")` returns a non-empty string with fallback `<div data-type="...">` wrappers |
| `src/observer/nc-observer.test.ts` | `destroy()` is idempotent; `render()` after destroy is a no-op; subsequent serialize calls still return the last cached result |
| `src/observer/nc-observer.test.ts` | **Invariant 12** — after `render(tree)`, cached normalized tree's root key matches input tree's root key, element keys are preserved (modulo visibility pruning) |
| `src/observer/nc-observer.test.ts` | **Invariant 13** — throwing registry → `console.warn` fires; `getLastRender()` returns the prior cached tree; `getConsecutiveFailures()` advances to 1 then 2 on successive throws; `getLastRenderPassId()` does not advance; a subsequent successful render resets `getConsecutiveFailures()` to 0 |
| `src/renderer/nc-renderer.test.tsx` | After `render(<NCRenderer ... />)`, `runtime.observer.getLastRender()` is non-null and reflects the rendered tree |
| `src/renderer/nc-renderer.test.tsx` | Tree fails validation (duplicate field IDs) → observer NOT updated; `getLastRenderPassId()` stays at its prior value |
| `src/integration.test.tsx` | End-to-end: type value into a TextField → staging buffer updates → next tree commit → `observer.getLastRender()` includes `currentValue` for the field → submit → handler reads `runtime.observer.serialize("json-string")` and sees the tree + staging snapshot |

**Negative-control discipline** (per JSON-UI Invariant guidance): the throwing-registry test must also assert that a non-throwing registry produces a valid render in the same test file, so the test would actually fail if the observer's registry wiring were silently broken.

**Updated existing tests.** `runtime/context.test.ts` — the existing 7 tests construct `createNCRuntime({ durableStore })`. With the migration, they must pass `catalog` and `catalogVersion` too. This is a mechanical change across ~7 test blocks; no new assertions needed, just updated constructor calls.

## Public Barrel Additions

```typescript
// src/index.ts — additions
export {
  createNCObserver,
  ncHeadlessRegistry,
  type CreateNCObserverOptions,
} from "./observer";
// NCObserver type re-exported via existing src/types barrel:
export type { NCObserver } from "./types";
```

Public barrel goes from 13 values + 11 types = 24 to **15 values + 13 types = 28**. Two new values (`createNCObserver`, `ncHeadlessRegistry`) and two new types (`NCObserver`, `CreateNCObserverOptions`).

Why export `createNCObserver` at all if `createNCRuntime` always constructs one? For advanced callers who want to mount a second observer session (e.g., a diagnostics-only observer separate from the runtime's primary one) or who need to construct an observer without a full runtime (server-side tests, CLI previews). Low cost, keeps the door open.

## What This Spec Is Not

- **Not an Anthropic handler spec.** Replacing `createStubIntentHandler` with a real LLM-backed handler is a separate spec. This spec only ensures the observer is *available* for that future handler to consume.
- **Not a multi-session spec.** NC supports exactly one React path and one observer per runtime in v1. Dual mounting of either is undefined behavior.
- **Not a persistence spec.** The observer cache is in-memory and does not survive `runtime.destroy()` or process restart. Persistent observation trails are out of scope.
- **Not a visual testing tool.** The HTML serializer is available but NC does not ship a viewer, snapshot framework, or visual-regression harness. Consumers build those separately if they want them.

## Open Questions

1. **Should `serialize("html")` be lazy or cached?** If called repeatedly on the same `lastRender`, caching the string saves work. But that adds invalidation logic (clear cache on every successful render). Leaning toward: no caching in v1 — render is cheap, HTML serializer is only for diagnostics (not the LLM prompt path), and consumers that care can cache externally.

2. **Should the headless registry be user-overridable via `createNCRuntime` options?** Matches the pattern of `extraRegistry` on `NCRendererProps`. Leaning toward: not in v1 — add later when a real use case emerges. V1 uses `ncHeadlessRegistry` only.

3. **Should consecutive-failure counter trigger a backoff or circuit breaker?** `getConsecutiveFailures()` exposes the count so callers can detect runaway staleness, but the observer itself keeps retrying on every commit. Alternative: after N consecutive failures, stop calling the headless renderer and return null from `getLastRender()` until `runtime.destroy()` or a manual reset. Leaning toward: no circuit breaker in v1 — retries are cheap and the failure mode (buggy registry) is a developer bug that should surface via warnings, not be silenced.

*Resolved during spec review (2026-04-16):* the raw-tree-vs-`result.data` ambiguity from the first draft: `NCRenderer` passes `result.data!` to `observer.render(tree)`. The observer does not re-validate. Decided in favor of keeping NCRenderer as the single validation point and avoiding a second Zod pass.

## Non-Goals

- No React-side visual regression testing or snapshot framework.
- No dual-React-path support (e.g., two NCRenderer instances sharing one runtime).
- No push/subscribe API. Pull-based `getLastRender()` only.
- No modification to `@json-ui/headless`. If a future need requires headless changes, it is a separate upstream contribution.
- No observer persistence across restart.

## Prior Art

- JSON-UI Plan 3 (`2026-04-13-headless-renderer-plan.md`), which shipped `@json-ui/headless` and formalized the pure-function-of-(tree, store-snapshots) contract.
- The NC v1 ephemeral-UI-state spec (`2026-04-11-ephemeral-ui-state-design.md`), which defines the 11 existing invariants and the five v1 state surfaces. This spec extends the invariant set (12, 13) and adds a sixth state surface (observer cache).
- React's `useSyncExternalStore` pattern, which the React side of Path C already uses via `@json-ui/react`'s `StagingProvider`. The observer uses the same underlying stores but via headless's snapshot-based context.
- The Elm architecture's view function: `view(model) → tree`. The observer is effectively exposing NC's `view(model)` output as a structured tree, separate from DOM rendering.
