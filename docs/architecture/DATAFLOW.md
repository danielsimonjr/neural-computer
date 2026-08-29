# Neural Computer - Data Flow

**Version**: 0.1.0 (docs refreshed 2026-08-29)
**Last Updated**: 2026-08-29

This document traces data from user input through intent dispatch, tree commit, validation during render, last-good display, reconcile, and observer shadow.

---

## The Intent Loop

NC's core loop is: **type → click → intent → dispatch → commit → validate (render) → last-good to Renderer → reconcile + observer.render**. Each step has a single owner.

```
  User types      User clicks       Runtime gates      Handler runs
  into field      Button action     isIntentInFlight   (stub only)
      │                │                 │                  │
      ▼                ▼                 ▼                  ▼
┌──────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│ Staging  │    │ ActionProv │    │ emitIntent │    │ nextTree() │
│ Buffer   │───▶│ builds     │───▶│ drops or   │───▶│ + validate │
│ .set()   │    │ IntentEvent│    │ awaits     │    │ then commit│
└──────────┘    └────────────┘    └────────────┘    └─────┬──────┘
                                                          │
      ┌───────────────────────────────────────────────────┘
      ▼
┌──────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│ setTree  │    │ useMemo    │    │ <Renderer  │    │ layout fx  │
│ (React)  │───▶│ validate;  │───▶│ tree=      │───▶│ reconcile  │
│          │    │ last-good  │    │ renderTree>│    │ observer.  │
└──────────┘    └────────────┘    └────────────┘    │ render()   │
                                                    └────────────┘
```

Validation is **not** in `useLayoutEffect`. `useMemo` decides `renderTree`. The layout effect mutates the staging buffer and the observer cache after a successful commit.

---

## Step-by-Step Data Flow

### 1. User Types (Staging Accumulation)

**Owner**: `NCTextField` / `NCCheckbox` via `useStagingField`

`onChange` writes into `StagingBuffer.set(fieldId, value)` with a 8192-character cap on strings. The orchestrator never observes these writes. `multiline` TextFields use a textarea; there is no Select component.

### 2. User Clicks a Button (Action Dispatch)

**Owner**: `NCButton` → `useActions().execute` → `ActionProvider`

`NCButton` passes `{ name, params }` (params must not be dropped). While `IntentFlightContext` is true the button is disabled (`isIntentInFlight`).

ActionProvider resolves DynamicValue params (`resolveActionWithStaging`), snapshots the full buffer, stamps `catalog_version`, and calls `onIntent`. `action_params` and `staging_snapshot` stay separate even on key collision (Invariant 6).

### 3. Intent Emission (Backpressure Gate)

**Owner**: `createNCRuntime.emitIntent`

Destroyed, missing handler, or already in flight: warn and **resolve** (drop). Otherwise set `isIntentInFlight` true, capture the handler, and if `action_name === "cancel"` reconcile staging to empty (the snapshot is already on the event). Await the handler; `finally` always clears the flag and notifies `subscribeIntentFlight` listeners.

### 4. Handler Execution (Tree Production)

**Owner**: `createStubIntentHandler`

`nextTree(event)` must produce a catalog-valid tree or the handler rejects and `onTreeCommit` is not called. Typical `onTreeCommit` is `setTree`.

### 5. Tree Commit (React State Update)

**Owner**: `NCApp.setTree`

`setTree(newTree)` re-renders `NCRenderer` with the new `tree` prop. Changing `initialTree` by reference also resets.

### 6. Validation During Render

**Owner**: `NCRenderer` via `useMemo` (not `useLayoutEffect`)

```
renderTree = useMemo(() => {
  const result = activeCatalog.validateTree(tree)
  if (!result.success) return lastGoodRef.current   // may be null on first paint
  const data = result.data ?? tree
  if (field-id type changed) return lastGoodRef.current
  lastGoodRef.current = data
  return data
}, [tree, activeCatalog])
```

`<Renderer tree={renderTree} />` mounts only when `renderTree` is non-null. Invalid incoming trees never reach JSON-UI. `onValidationError` fires from the subsequent layout effect when a pending error is set.

### 7. Reconcile + Observer After Commit

**Owner**: `NCRenderer` `useLayoutEffect`

If validation failed, skip reconcile (buffer untouched) and return. If `renderTree` is null, return. If this `tree` reference was already shadowed for this runtime (Strict Mode), skip. Otherwise `collectFieldIds(renderTree)`, `stagingBuffer.reconcile(liveIds)`, then `runtime.observer.render(renderTree)` — the same stripped tree React has. Optionally restore focus to `data-field-id`.

### 8. Re-Render of Inputs

`Renderer` walks `renderTree`, looks up types in the registry (builtins always win over `extraRegistry`), and mounts NC components. Inputs read the reconciled buffer via `useStagingField`.

---

## DynamicValue Resolution Path

When a Button's action includes `DynamicValue` params like `{ to: { path: "email" } }`:

A single-segment path with no `/` prefers staging if that key exists, otherwise the data model. A multi-segment path walks the data model via `getByPath`. The rule lives in `@json-ui/core`'s `resolveActionWithStaging`. NC must not reimplement it. Values copied into `action_params` from durable paths are visible to a future LLM; do not put secrets on those paths.

---

## Reconciliation Decision Tree

```
New tree prop arrives
    │
    ▼
useMemo: catalog.validateTree(tree)
    │
    ├── success: false
    │   └── render last-good (or null); skip reconcile
    │
    ├── field-id type change
    │   └── render last-good; skip reconcile
    │
    └── success: true
        │
        ▼
    <Renderer tree={stripped data}>
        │
        ▼
    useLayoutEffect:
        collectFieldIds(renderTree)
        reconcile; observer.render(renderTree)
```

---

## Backpressure Sequence

Click 1 sets `isIntentInFlight` true; subscribers re-render; buttons disable. Click 2 is a drop (promise resolves, warning logged, handler not called). When click 1's handler settles, the flag clears even if the handler threw. Click 3 is accepted.

---

## Data Flow Invariants

| # | Guarantee | Enforced By |
|---|-----------|-------------|
| Orchestrator sees only IntentEvent | Buffer isolation including `../observer` (Invariant 7) |
| Invalid trees never reach Renderer | `useMemo` last-good (Invariant 8) |
| Staging survives failed validation | Reconcile skipped when pending error is set (Invariant 9) |
| Staging survives partial streams | `useCommittedTree` atomic mode + stub `validateTree` (Invariant 9) |
| No phantom staging entries | Walk stripped `renderTree` |
| React and observer see the same data | Both walk stripped `renderTree` (Invariant 12) |
| One intent at a time, visible | `isIntentInFlight` / `subscribeIntentFlight` (Invariant 10) |
| Full snapshot on every intent | ActionProvider (Invariant 5) |
| `cancel` discards staging | `emitIntent` reconciles to empty after snapshot is on the event |
| Params and snapshot unmerged | Separate fields (Invariant 6) |
| DynamicValue resolves from staging | Single-segment paths prefer staging (Invariant 11) |
