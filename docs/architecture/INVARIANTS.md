# Neural Computer - Spec Invariants

**Version**: 0.1.0
**Last Updated**: 2026-04-16
**Source**: `docs/specs/2026-04-11-ephemeral-ui-state-design.md`

---

The NC spec defines 13 testable invariants. Each maps to one or more tests in the v1 implementation. These are the correctness guarantees the runtime must maintain; any code change that violates one is a bug.

---

## Invariant 1: Reconciliation Drops

> After reconciling against a tree without field `X`, `snapshot()` does not contain a value for `X`.

When the LLM emits a new tree that no longer contains an input field, the staging buffer drops its entry. This is how "accepting a submission" works mechanically — the LLM writes values to memoryjs and emits a tree without those input fields; the buffer drops them via reconciliation. No "clear the form" instruction is needed.

**Tests**: `nc-renderer.test.tsx` (orphan drop), `integration.test.tsx` (reconciliation across tree transitions)

---

## Invariant 2: Reconciliation Preserves Across Presence

> After reconciling against a tree that still contains field `X`, `snapshot()` still contains the previously-set value for `X`.

If the LLM re-emits a tree that still contains the same field, the user's typed value stays in the buffer. The buffer reconciles on field ID, not on props or element identity.

**Tests**: `nc-renderer.test.tsx`, `integration.test.tsx`

---

## Invariant 3: Reconciliation Preserves Across Prop Changes

> After reconciling against a tree containing field `X` with different props than before, `snapshot()` still contains the previously-set value for `X`.

The most important preservation case: the LLM rejects a form submission and re-emits the same fields with an `error` prop to display validation feedback. The user's typed values must survive. Props describe how the field is drawn, not how the buffer is keyed. Same ID, any props, preserve.

**Tests**: `nc-renderer.test.tsx` (field with error prop added, value preserved)

---

## Invariant 4: Snapshot Is Non-Destructive

> Two `snapshot()` calls back-to-back, with no intervening `set()` or `reconcile()`, return equal data.

Reading the staging buffer is a read-only operation. Flushing on intent is a read, not a consume. If the LLM rejects the input and re-emits the same tree, the user's partial input stays visible without any explicit "keep" step.

**Tests**: `context.test.ts` (multiple snapshot reads plus intent round-trip, buffer unchanged)

---

## Invariant 5: Intent Events Carry Full Snapshot

> A fired intent event's `staging_snapshot` contains every field ID currently in the buffer, not just the fields referenced by the action's params.

The orchestrator receives the complete staging state at flush time. It can inspect any field, not just those the LLM explicitly referenced in the action declaration.

**Tests**: `integration.test.tsx` (type email + check agree + submit, snapshot contains both)

---

## Invariant 6: `action_params` and `staging_snapshot` Are Separate

> When a firing action has explicit params that collide with buffer keys, both fields reach the orchestrator unmerged, with both values preserved.

If a Button declares `action.params: { email: "fixed@example.com" }` while the user typed a different email in a TextField, the IntentEvent carries both the literal param and the user-typed value in separate fields (`action_params` and `staging_snapshot`). The renderer does not merge; the orchestrator does not merge; the LLM interprets.

**Tests**: `integration.test.tsx` (key collision test: literal `email` param + user-typed `email` field)

---

## Invariant 7: Buffer Isolation

> The orchestrator module does not import from the renderer or any rendering library. Enforced by test or lint rule.

The spec's original wording references `renderer/staging-buffer.ts`, but v1's implementation moved staging buffer ownership into `@json-ui/core` via `createStagingBuffer`. The invariant's intent is preserved: the orchestrator only sees `IntentEvent` objects from `@json-ui/core` and never touches the rendering layer directly. This guarantees the LLM's observation surface remains narrow and well-defined.

**Enforcement**: `buffer-isolation.test.ts` — a meta-test that walks every non-test file under `src/orchestrator/` and asserts no forbidden import pattern (`@json-ui/react`, `@json-ui/headless`, `react`, `react-dom`, `../renderer`, `../app`).

---

## Invariant 8: Field ID Uniqueness

> Attempting to render a tree with two fields sharing the same `id` raises a catalog validation error before the tree reaches JSON-UI.

Duplicate field IDs are a catalog error. NC's catalog validator (`catalog.validateTree`) runs `validateUniqueFieldIds` automatically after Zod parsing and returns `success: false` with a `fieldIdError` when duplicates are found. NCRenderer skips reconciliation on failed validation, leaving the buffer untouched.

**Tests**: `nc-catalog.test.ts` (duplicate ID rejection), `nc-renderer.test.tsx` (reconcile skipped on invalid tree)

---

## Invariant 9: Partial-Tree Safety

> If a streaming LLM response fails to complete a valid tree, reconciliation does not run and the buffer contents are unchanged.

Reconciliation runs only on successful tree commits, not on partial streams. `useCommittedTree` wraps `useUIStream` with `commitMode: "atomic"`, suppressing every `setTree` call until the stream completes successfully. A user who typed a 500-word message and hit Submit cannot lose their input to a network hiccup.

**Tests**: `use-committed-tree.test.tsx` (error path), `nc-renderer.test.tsx` (Zod strip regression — reconcile walks `result.data`, not raw tree)

---

## Invariant 10: Backpressure Rejection

> While an intent is in flight, new intent events are rejected (and logged), not queued.

`createNCRuntime` gates every emit through an `intentInFlight` boolean. The handler is captured via `const currentHandler = intentHandler` BEFORE the `await`, so mid-flight handler swaps do not corrupt the running call. The flag clears in `finally` regardless of success or failure.

**Tests**: `context.test.ts` (deferred promise interleave), `integration.test.tsx` (two rapid clicks, only first reaches handler)

---

## Invariant 11: DynamicValue Pre-Resolution

> When an action's `DynamicValue` param references a staging-buffer field ID, the substitution happens before `resolveAction` is called, and the substituted value is what reaches JSON-UI.

`@json-ui/core`'s `resolveActionWithStaging` implements the rule: for `{path: "<id>"}` where the path is a single segment with no `/`, if staging has the key, prefer staging; otherwise walk the data model. NCButton forwards `action.params` through `execute()`, and ActionProvider runs the resolver before constructing the IntentEvent.

**Tests**: `integration.test.tsx` (`{path: "email"}` resolves to staging value, appears in `action_params`)

---

## Invariant 12: Observer Shadows React Renders

> After a successful React tree commit, `runtime.observer.getLastRender()` returns a `NormalizedNode` tree derived from the same validated tree that drove the React render.

**Why:** The LLM orchestrator composes observations from `runtime.observer.serialize()` without importing React. Without this invariant, the observer could drift out of sync with the UI the user actually sees.

**Tests:** `src/observer/nc-observer.test.ts` (passId advancement); `src/renderer/nc-renderer.test.tsx` ("populates runtime.observer.getLastRender() after a React commit"); `src/integration.test.tsx` (Path C end-to-end).

---

## Invariant 13: Observer Failure Is Best-Effort, But Detectable

> A headless render exception does not propagate to React, does not corrupt the staging buffer, and does not clear the previous cached render. The observer exposes `getLastRenderPassId()` (monotonic; advances only on success) and `getConsecutiveFailures()` (resets on success) so callers can detect runaway staleness.

**Why:** The observer is best-effort — a malformed tree or a broken registry component shouldn't take down the React UI. But silent failure is a debugging nightmare, so the observer exposes counter-based observability for callers that care.

**Tests:** `src/observer/nc-observer.test.ts` ("Invariant 13: throwing registry component logs warning, keeps cache, advances failure count").

---

## Coverage Summary

| # | Invariant | Status | Test Location(s) |
|---|-----------|--------|-------------------|
| 1 | Reconciliation drops | Covered | `nc-renderer.test.tsx`, `integration.test.tsx` |
| 2 | Preserves matched IDs | Covered | `nc-renderer.test.tsx`, `integration.test.tsx` |
| 3 | Preserves across prop changes | Covered | `nc-renderer.test.tsx` |
| 4 | Snapshot non-destructive | Covered | `context.test.ts` |
| 5 | Intent carries full snapshot | Covered | `integration.test.tsx` |
| 6 | action_params / staging_snapshot separate | Covered | `integration.test.tsx` |
| 7 | Buffer isolation | Covered | `buffer-isolation.test.ts` |
| 8 | Field ID uniqueness | Covered | `nc-catalog.test.ts`, `nc-renderer.test.tsx` |
| 9 | Partial-tree safety | Covered | `use-committed-tree.test.tsx`, `nc-renderer.test.tsx` |
| 10 | Backpressure rejection | Covered | `context.test.ts`, `integration.test.tsx` |
| 11 | DynamicValue pre-resolution | Covered | `integration.test.tsx` |
| 12 | Observer shadows React renders | Covered | `nc-observer.test.ts`, `nc-renderer.test.tsx`, `integration.test.tsx` |
| 13 | Observer failure best-effort / detectable | Covered | `nc-observer.test.ts` |

All 13 invariants have test coverage as of Path C (66 tests, 13 files).
