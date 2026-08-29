# Neural Computer - Spec Invariants

**Version**: 0.1.0 (docs refreshed 2026-08-29)
**Last Updated**: 2026-08-29
**Source**: `docs/specs/2026-04-11-ephemeral-ui-state-design.md` plus Path C (`2026-04-16-headless-dual-backend-design.md`)

The NC spec defines 13 testable invariants. Each maps to tests in the tree. A change that violates one is a bug.

---

## Invariant 1: Reconciliation Drops

> After reconciling against a tree without field `X`, `snapshot()` does not contain a value for `X`.

When the next tree no longer contains an input field, the staging buffer drops its entry. Accepting a submission is mechanical: persist values to durable state and emit a tree without those ids.

**Tests**: `nc-renderer.test.tsx`, `integration/path-c.test.tsx`

---

## Invariant 2: Reconciliation Preserves Across Presence

> After reconciling against a tree that still contains field `X`, `snapshot()` still contains the previously-set value for `X`.

The buffer reconciles on field id, not on props or element identity.

**Tests**: `nc-renderer.test.tsx`, `integration/path-c.test.tsx`

---

## Invariant 3: Reconciliation Preserves Across Prop Changes

> After reconciling against a tree containing field `X` with different props than before, `snapshot()` still contains the previously-set value for `X`.

Rejecting a submission by re-emitting the same ids with an `error` prop must not wipe the user's typing. Same id, any props, preserve.

**Tests**: `nc-renderer.test.tsx`

---

## Invariant 4: Snapshot Is Non-Destructive

> Two `snapshot()` calls back-to-back, with no intervening `set()` or `reconcile()`, return equal data.

Flushing on intent is a read, not a consume.

**Tests**: `context.test.ts`

---

## Invariant 5: Intent Events Carry Full Snapshot

> A fired intent event's `staging_snapshot` contains every field ID currently in the buffer, not just the fields referenced by the action's params.

**Tests**: `integration/path-c.test.tsx`

---

## Invariant 6: `action_params` and `staging_snapshot` Are Separate

> When a firing action has explicit params that collide with buffer keys, both fields reach the orchestrator unmerged.

`NCButton` must forward `action.params` to `execute()` or this invariant is dead at the source.

**Tests**: `integration/path-c.test.tsx`, `input-components.test.tsx`

---

## Invariant 7: Buffer Isolation

> The orchestrator module does not import from the renderer or any rendering library. Enforced by test or lint rule.

The spec's original wording referenced `renderer/staging-buffer.ts`; staging now lives in `@json-ui/core`. The invariant's intent is unchanged: the orchestrator only sees `IntentEvent` objects from `@json-ui/core` and never touches the rendering layer. The meta-test's forbidden list includes `@json-ui/react`, `@json-ui/headless`, `react`, `react-dom`, `../renderer`, `../app`, and **`../observer`**. Reading `runtime.observer` through the `NCRuntime` handle is allowed; importing `src/observer/` from `src/orchestrator/` is not.

**Enforcement**: `buffer-isolation.test.ts`

---

## Invariant 8: Field ID Uniqueness (Last-Good Tree)

> Attempting to render a tree with two fields sharing the same `id` raises a catalog validation error before the tree reaches JSON-UI.

`catalog.validateTree` runs `validateUniqueFieldIds` after Zod parsing. NCRenderer validates **during render** (`useMemo`), not in `useLayoutEffect`. On failure it keeps the **last-good** stripped tree on `<Renderer>` (or renders nothing if there is not yet a last-good tree). Same-id, different-component-type commits are also rejected (`field-id-stability.ts`) and keep last-good.

**Tests**: `nc-catalog.test.ts`, `nc-renderer.test.tsx`, `field-id-stability.test.ts`

---

## Invariant 9: Partial-Tree Safety

> If a streaming LLM response fails to complete a valid tree, reconciliation does not run and the buffer contents are unchanged.

`useCommittedTree` wraps `useUIStream` with `commitMode: "atomic"`. `NCApp` uses `useState`; the stub handler validates `nextTree` before `onTreeCommit`, so the primary path still refuses incomplete/invalid trees. Reconcile walks stripped `renderTree` only after a successful validation.

**Tests**: `use-committed-tree.test.tsx`, `nc-renderer.test.tsx`, `handle-intent.test.ts`

---

## Invariant 10: Backpressure Rejection (Public Flag)

> While an intent is in flight, new intent events are rejected (and logged), not queued.

`createNCRuntime` gates every emit through an in-flight boolean. The handler is captured before `await`. The flag clears in `finally`. The flag is **public**: `runtime.isIntentInFlight()` and `runtime.subscribeIntentFlight(listener)`. NCRenderer subscribes so `NCButton` disables. Drops resolve; they are not silent from the UI's point of view.

**Tests**: `context.test.ts`, `integration/path-c.test.tsx`, `input-components.test.tsx`

---

## Invariant 11: DynamicValue Pre-Resolution

> When an action's `DynamicValue` param references a staging-buffer field ID, the substitution happens before `resolveAction` is called, and the substituted value is what reaches JSON-UI.

Implemented in `@json-ui/core`'s `resolveActionWithStaging`. NCButton must pass `params` through `execute()`.

**Tests**: `integration/path-c.test.tsx`

---

## Invariant 12: Observer Shadows React Renders

> After a successful React tree commit, `runtime.observer.getLastRender()` returns a `NormalizedNode` tree derived from the same validated tree that drove the React render.

Both walks use Zod-stripped data: `<Renderer tree={renderTree}>` and `observer.render(renderTree)` receive the same `result.data` (or last-good). `extraRegistry` / `extraHeadlessRegistry` cannot override builtins, which would otherwise desync Button params.

**Tests**: `nc-observer.test.ts`, `nc-renderer.test.tsx`, `integration/path-c.test.tsx`

---

## Invariant 13: Observer Failure Is Best-Effort, But Detectable

> A headless render exception does not propagate to React, does not corrupt the staging buffer, and does not clear the previous cached render. `getLastRenderPassId()` advances only on success; `getConsecutiveFailures()` resets on success.

**Tests**: `nc-observer.test.ts`

---

## Compute rules (not numbered with 1–13)

These belong to `src/compute/` and do not extend the UI-runtime invariant list. Spec: `docs/specs/2026-08-29-compute-rlm-repl-design.md`.

1. A second `exec`/`set`/`get`/`reset` while busy throws `busy` (does not queue).
2. Timeout kills the worker and the next successful call runs in a fresh namespace.
3. `destroy` is terminal and idempotent.
4. Non-test files under `src/compute/` do not import React, `@json-ui/*`, `../renderer`, `../app`, `../observer`, or `../runtime`.
5. `llm_query` protocol traffic does not appear in `NCReplExecResult.stdout`.

**Tests**: `python-repl.test.ts`, `isolation.test.ts`

---

## Coverage Summary

| #   | Invariant                                        | Status  | Test Location(s)                                                               |
| --- | ------------------------------------------------ | ------- | ------------------------------------------------------------------------------ |
| 1   | Reconciliation drops                             | Covered | `nc-renderer.test.tsx`, `integration/path-c.test.tsx`                          |
| 2   | Preserves matched IDs                            | Covered | `nc-renderer.test.tsx`, `integration/path-c.test.tsx`                          |
| 3   | Preserves across prop changes                    | Covered | `nc-renderer.test.tsx`                                                         |
| 4   | Snapshot non-destructive                         | Covered | `context.test.ts`                                                              |
| 5   | Intent carries full snapshot                     | Covered | `integration/path-c.test.tsx`                                                  |
| 6   | action_params / staging_snapshot separate        | Covered | `integration/path-c.test.tsx`, `input-components.test.tsx`                     |
| 7   | Buffer isolation (includes `../observer`)        | Covered | `buffer-isolation.test.ts`                                                     |
| 8   | Field ID uniqueness / last-good tree             | Covered | `nc-catalog.test.ts`, `nc-renderer.test.tsx`, `field-id-stability.test.ts`     |
| 9   | Partial-tree safety                              | Covered | `use-committed-tree.test.tsx`, `nc-renderer.test.tsx`, `handle-intent.test.ts` |
| 10  | Backpressure (public flag)                       | Covered | `context.test.ts`, `integration/path-c.test.tsx`                               |
| 11  | DynamicValue pre-resolution                      | Covered | `integration/path-c.test.tsx`                                                  |
| 12  | Observer shadows React (both walk stripped data) | Covered | `nc-observer.test.ts`, `nc-renderer.test.tsx`, `integration/path-c.test.tsx`   |
| 13  | Observer failure best-effort / detectable        | Covered | `nc-observer.test.ts`                                                          |

15 test files under `src/**/*.test.*`; 84 `it`/`test` cases as of the 2026-08-29 documentation refresh. Compute tests (`python-repl.test.ts`, `isolation.test.ts`) are additional and cover the REPL rules above.
