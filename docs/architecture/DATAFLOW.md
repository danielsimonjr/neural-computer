# Neural Computer - Data Flow

**Version**: 0.1.0
**Last Updated**: 2026-04-16

---

This document traces how data flows through the NC runtime, from user input to LLM response to re-render.

---

## The Intent Loop

NC's core loop is: **type → click → intent → dispatch → commit → reconcile → render**. Each step has a single owner and a well-defined data shape.

```
  User types      User clicks       Runtime gates      Handler runs
  into field      Button action     backpressure       (stub or LLM)
      │                │                 │                  │
      ▼                ▼                 ▼                  ▼
┌──────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│ Staging  │    │ ActionProv │    │ emitIntent │    │ nextTree() │
│ Buffer   │───▶│ builds     │───▶│ checks     │───▶│ produces   │
│ .set()   │    │ IntentEvent│    │ in-flight  │    │ new UITree │
└──────────┘    └────────────┘    └────────────┘    └─────┬──────┘
                                                          │
      ┌───────────────────────────────────────────────────┘
      ▼
┌──────────┐    ┌────────────┐    ┌────────────┐
│ setTree  │    │ NCRenderer │    │ Renderer   │
│ (React)  │───▶│ validate + │───▶│ re-renders │
│          │    │ reconcile  │    │ new tree   │
└──────────┘    └────────────┘    └────────────┘
```

---

## Step-by-Step Data Flow

### 1. User Types (Staging Accumulation)

**Owner**: `NCTextField` / `NCCheckbox` via `useStagingField`

```
onChange(e) → setValue(e.target.value)
                    │
                    ▼
          StagingBuffer.set(fieldId, value)
```

The staging buffer is a `Map<FieldId, unknown>` wrapped in `@json-ui/core`'s `createStagingBuffer`. Every `set()` invalidates the cached snapshot and fires subscribers synchronously. The orchestrator never observes these writes.

### 2. User Clicks a Button (Action Dispatch)

**Owner**: `NCButton` → `useActions().execute` → `ActionProvider`

```
NCButton.onClick()
    │
    ▼
execute({ name: "submit_form", params: action.params })
    │
    ▼
ActionProvider processes:
  1. resolveActionWithStaging(action, staging, data)
     ├── DynamicValue {path: "email"} → staging["email"]  (single segment, staging wins)
     └── DynamicValue {path: "user/name"} → data["user"]["name"]  (multi-segment, data wins)
  2. Build IntentEvent:
     {
       action_name: "submit_form",
       action_params: { to: "resolved-email@..." },  // resolved params
       staging_snapshot: { email: "alice@...", agree: true },  // full buffer snapshot
       catalog_version: "nc-starter-0.1",
       timestamp: Date.now()
     }
  3. Call onIntent(event) → NCRenderer's callback
```

**Key point**: `action_params` and `staging_snapshot` are SEPARATE fields that are NEVER merged, even on key collision (Invariant 6). The LLM interprets both.

### 3. Intent Emission (Backpressure Gate)

**Owner**: `createNCRuntime.emitIntent`

```
NCRenderer.onIntent(event)
    │
    ▼
runtime.emitIntent(event)
    │
    ├── destroyed? → warn, return
    ├── no handler? → warn, return
    ├── intentInFlight? → warn "Rejected in-flight intent", return
    │
    ▼
intentInFlight = true
const currentHandler = intentHandler  // capture BEFORE await
try {
  await currentHandler(event)
} finally {
  intentInFlight = false
}
```

The handler is captured before `await` so that if `setIntentHandler` is called during the handler's execution, the in-flight call still runs against its original handler. Swaps take effect on the next emit.

### 4. Handler Execution (Tree Production)

**Owner**: `createStubIntentHandler` (v1) / future LLM-backed handler

```
Stub handler:
  const tree = options.nextTree(event)  // pure function
  await options.onTreeCommit(tree)      // typically setTree(tree)

Future LLM handler:
  const observation = compose(event, durableState)
  const response = await anthropic.messages.create(...)
  const tree = parseUITree(response)
  await onTreeCommit(tree)
```

### 5. Tree Commit (React State Update)

**Owner**: `NCApp.setTree` (via React's `useState`)

```
onTreeCommit(newTree) → setTree(newTree) → React re-render
```

This triggers NCRenderer to re-render with the new `tree` prop.

### 6. Validation + Reconciliation

**Owner**: `NCRenderer` (via `useLayoutEffect`)

```
useLayoutEffect(() => {
  const result = catalog.validateTree(tree)
  │
  ├── !result.success → warn, SKIP reconcile (buffer untouched)
  │
  ▼
  const liveIds = collectFieldIds(result.data!)  // walk VALIDATED tree
  runtime.stagingBuffer.reconcile(liveIds)
      │
      ├── field "email" in liveIds → PRESERVE
      ├── field "name" NOT in liveIds → DROP
      └── field "orphan" NOT in liveIds → DROP
}, [tree, catalog, runtime.stagingBuffer])
```

**Critical**: walks `result.data` (Zod-validated/stripped), NOT the raw `tree` prop. This prevents phantom staging entries from stray props that Zod strips.

**Timing**: `useLayoutEffect` runs synchronously after DOM mutations but before paint, closing the one-frame window where orphan staging values would be visible.

### 7. Re-Render

**Owner**: `@json-ui/react`'s `Renderer`

The `Renderer` walks the tree, looks up each element's `type` in the component registry, and renders the corresponding NC component. Input components bind to the staging buffer via `useStagingField`, which reads from the (now-reconciled) buffer. The cycle is ready to repeat.

---

## DynamicValue Resolution Path

When a Button's action includes `DynamicValue` params like `{ to: { path: "email" } }`, the resolution follows a specific rule:

```
DynamicValue { path: "email" }
    │
    ▼
Is path single-segment (no "/")?
    ├── YES → Does staging have key "email"?
    │         ├── YES → Use staging["email"]  ✓
    │         └── NO  → Fall through to data model
    │
    └── NO  → Walk data model via getByPath("user/name")
```

This rule lives in `@json-ui/core`'s `resolveActionWithStaging` (`packages/core/src/resolve-with-staging.ts`) and is upstream behavior — NC consumes it but does not implement it. Both `@json-ui/headless` and NC's React-side action handler use the same implementation. Do NOT reimplement the rule inline. If the upstream rule changes, this documentation section must be updated to match.

---

## Reconciliation Decision Tree

```
New tree committed
    │
    ▼
catalog.validateTree(tree)
    │
    ├── success: false (Zod error)
    │   └── SKIP reconcile, log warning, buffer UNTOUCHED
    │
    ├── success: false (fieldIdError — duplicates)
    │   └── SKIP reconcile, log warning, buffer UNTOUCHED
    │
    └── success: true
        │
        ▼
    collectFieldIds(result.data!)
        │
        ▼
    For each staging entry:
        ├── ID in liveIds → PRESERVE (user's value stays)
        └── ID not in liveIds → DROP (orphan removed)
```

---

## Backpressure Sequence

```
Click 1:
  emitIntent(event1)
  intentInFlight = true
  currentHandler = handler
  await handler(event1)  ← takes time (LLM call)

Click 2 (while Click 1 in flight):
  emitIntent(event2)
  intentInFlight === true → REJECT
  console.warn("Rejected in-flight intent: submit_form")
  return (no handler call)

Click 1 completes:
  finally { intentInFlight = false }

Click 3 (after Click 1 done):
  emitIntent(event3)
  intentInFlight = false → ACCEPT
  handler(event3) ← runs normally
```

---

## Data Flow Invariants

| # | Guarantee | Enforced By |
|---|-----------|-------------|
| Orchestrator sees only IntentEvent | Buffer isolation (Invariant 7) |
| Staging survives failed validation | Reconcile skips on `!result.success` (Invariant 9) |
| Staging survives partial streams | `useCommittedTree` atomic mode (Invariant 9) |
| No phantom staging entries | Walk `result.data`, not raw tree |
| One intent at a time | `intentInFlight` flag (Invariant 10) |
| Full snapshot on every intent | ActionProvider includes all buffer entries (Invariant 5) |
| Params and snapshot unmerged | Separate fields on IntentEvent (Invariant 6) |
| DynamicValue resolves from staging | Single-segment paths prefer staging (Invariant 11) |
