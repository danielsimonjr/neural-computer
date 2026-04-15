# Ephemeral UI State in the Neural Computer Runtime

**Status:** Design spec (not yet implemented)
**Date:** 2026-04-11
**Scope:** How the Neural Computer runtime handles in-progress user input between renders.

## Context

The Neural Computer (NC) runtime is an LLM-driven application architecture inspired by Zhuge et al., *Neural Computers* (arXiv:2604.04625, April 2026). The paper proposes that a single learned runtime state can unify computation, memory, and I/O through an update-and-render loop, and flags "separation between run and update" as an unresolved problem — distinguishing invocations of existing capabilities from modifications to them.

The NC runtime takes the paper's abstraction as inspiration but replaces the substrate. The paper's update-and-render loop decomposes into three roles; those roles map onto concrete components in this design:

- **Durable runtime state** — [memoryjs](https://github.com/danielsimonjr/memoryjs), a TypeScript knowledge graph library with transactions, audit, and governance.
- **State update function** — a TypeScript orchestrator driving an LLM (Anthropic SDK) that dispatches work to a Python subprocess for real computation (RLM pattern).
- **Decoder and renderer** — [JSON-UI](https://github.com/danielsimonjr/JSON-UI), a constrained JSON-to-UI library forked from Vercel Labs' json-render.

Both JSON-UI and memoryjs are **components**, imported as npm packages. The NC runtime is their consumer and owns the architectural decisions about how they fit together. This spec is one such decision.

For the rest of this document, I use plain terms — "durable state," "the LLM orchestrator," "the renderer" — rather than the paper's Greek-letter notation. The design's guarantees are ordinary access-discipline guarantees; nothing is gained by importing symbols whose semantics in the paper (a learned video model) differ from their semantics here (an LLM calling real code). The paper framing is acknowledged as prior art and anchors the mapping above, but it does not do work in the rest of the spec.

## The Problem

The paper's open problem — distinguishing running from updating — has a mundane version at the UI layer. Traditional UI libraries smuggle the distinction into their data model. Vercel Labs' json-render, for example, uses a single `DataProvider` React context holding an arbitrary `dataModel` object in which durable facts and transient input share paths, distinguished only by convention.

The NC runtime needs something sharper: a place for in-progress user input that the LLM orchestrator cannot accidentally observe, and a clear rule for when that input becomes an observation the orchestrator *does* see. This is access discipline, not ontology. The in-progress input is real state — it has a value, persists across renders, and can be read — but the orchestrator's access to it is constrained to a single well-defined boundary: intent events.

## Decision

**Typing accumulates in a staging buffer. The LLM orchestrator only reads the buffer when a named intent fires.** Non-intent interactions (typing, focus changes, scrolling, field toggles) never reach the orchestrator. When the user triggers a catalog-declared action — a `Button` with an `action` prop, a form submission, a menu selection — the buffer is snapshotted and passed to the orchestrator along with the action. The LLM is invoked once per intent, not once per keystroke.

Three candidates were considered during design:

- **A1 — keystroke granularity.** Every DOM event round-trips through the LLM. Philosophically pure but unusable: typing "hello" becomes five sequential LLM calls. Ruled out.
- **B — orchestrator handles "dumb" mutations locally, LLM handles intents.** Practical, but requires the orchestrator to decide what counts as "dumb," which smuggles state interpretation into a layer that should be mechanical. Rejected.
- **A3 — intent-event granularity, with a mechanical staging buffer.** Selected.

## What Lives Where

After A3, the NC runtime has the following state surfaces. Each has a declared owner and a declared read discipline; none is hidden behind a "there are only three things" rhetorical move, because there are in fact more than three.

**Durable state.** Lives in memoryjs. Written only via LLM-dispatched transactions. Everything the system considers a fact about the world persists here across sessions. The orchestrator reads and writes freely; nothing else touches it.

**Current UI tree.** A pure derivation produced by the LLM from the durable state. Rendered via JSON-UI. Re-emitted on every intent cycle. Not stored, not persisted, not interpreted as state — its only job is to be drawn.

**Staging buffer.** A `Map<FieldId, unknown>` owned by the NC runtime's renderer wrapper. The orchestrator does not read it except on flush, during an intent event. This is an access constraint, not an ontological claim — the buffer has state-shaped properties (identity, persistence across renders, read and write semantics), but its read boundary is a single well-defined operation. The useful guarantee is that the LLM orchestrator's observation surface is narrow, not that the buffer is somehow "not state."

**In-flight intent flag.** A single boolean owned by the renderer wrapper, true between the moment an intent event is emitted and the moment the orchestrator's response arrives. The renderer uses it to reject duplicate intents. It exists as state; the spec names it explicitly rather than pretending it doesn't.

**Catalog version.** A string the renderer wrapper attaches to every intent event (the `catalog_version` field on `IntentEvent`). If the NC runtime versions its catalogs — and it should, so the LLM's tree emissions can be validated against the catalog in effect at emission time — that version string lives in the renderer wrapper's config, not in durable state. It is constant across a session but is state in the informal sense.

**LLM session state.** The Anthropic SDK holds prompt-cache and tool-use state between calls. This state is durable within a session but invisible to the rest of the system. The NC runtime should treat it as an implementation detail of the orchestrator, not as a first-class runtime concept. Its existence is acknowledged rather than managed.

The real and useful property this design offers is narrow: **the LLM orchestrator's observation surface is exactly (durable state + intent event payloads), and nothing else**. That is the access discipline. That is what the spec guarantees. Claiming more — that "ephemeral UI state does not exist" — would be rhetorical overreach.

## Staging Buffer Rules

### Rule 1: Ownership

The staging buffer is owned by a thin renderer wrapper inside the NC runtime, not inside JSON-UI. It is a React ref holding a Map, managed by an NC-internal hook. JSON-UI remains unchanged — the NC runtime wraps JSON-UI's existing `Renderer` component rather than modifying it.

The orchestrator — the TypeScript code running the main loop — never reads the buffer directly. Its only interaction is receiving a flushed snapshot as part of an `IntentEvent`.

### Rule 2: Keying by stable field ID

Every input component in the NC runtime's catalog must declare a stable string `id` prop. JSON-UI's catalog system (`@json-ui/core`'s `createCatalog`) already supports arbitrary Zod-typed props; NC's catalog definition adds `id: z.string()` to every input component schema (TextField, Checkbox, Select, etc.).

The staging buffer keys entries by this field ID. Field IDs must be unique within a single rendered tree; duplicates are a catalog error caught by NC's catalog validator before the tree reaches JSON-UI.

### Rule 3: Reconciliation on re-render

When the LLM emits a new UI tree, the NC renderer wrapper walks the new tree and collects all field IDs present. Any staging buffer entries whose IDs are no longer in the new tree are dropped. Entries whose IDs are still present are preserved.

**Props are render-only; they do not affect buffer keying.** Reconciliation keys exclusively on the field's `id`. If the LLM re-emits a tree containing the same field with different props — for example, adding an `error: "Invalid email"` prop to display validation feedback — the buffer entry is preserved unchanged and the user's typed value stays visible. This is intentional: props describe how the field is drawn, not how the buffer is keyed. Same ID, any props, preserve. Different ID, drop.

This is React-style keyed reconciliation applied to input state rather than DOM nodes. The consequences:

- **Accepting a submission:** The LLM writes values to memoryjs and emits a new tree that no longer contains those input fields. The buffer drops them via reconciliation. No "clear the form" instruction is needed.
- **Rejecting with validation error:** The LLM emits a new tree that still contains the same fields, now with error-state props. The buffer preserves the user's typed values. No "keep this input" instruction is needed.
- **Replacing an input in place:** Same ID, different component type. This is a catalog error and must be caught by validation — field IDs are expected to be stable for the lifetime of their logical field.

The LLM never imperatively manipulates the buffer. It only emits trees. The buffer reconciles itself mechanically.

### Rule 4: Flush on intent events

An *intent event* is any user interaction that the catalog explicitly marks as an action — a `Button` with an `action` prop, a `Form` submission, a menu item click. Non-intent interactions never trigger a flush.

When an intent event fires:

1. The NC renderer wrapper captures the full staging buffer as a snapshot: `Record<FieldId, unknown>`.
2. It emits an `IntentEvent` to the orchestrator with shape:
   ```typescript
   {
     action_name: string;
     action_params: Record<string, unknown>;
     staging_snapshot: Record<FieldId, unknown>;
     catalog_version?: string;
     timestamp: number;
   }
   ```
3. The orchestrator composes the observation for the LLM from `(current durable state, staging_snapshot, action_name, action_params)` and invokes it.
4. After the flush, the buffer stays live in the renderer wrapper. It will be reconciled against the next emitted tree.

**`action_params` and `staging_snapshot` are separate fields; they are not merged.** `action_params` contains whatever the LLM chose to put in the Button's `action` declaration at tree-emission time. `staging_snapshot` contains whatever the user typed between then and now. If they share keys — say, a Button's action explicitly declares `{email: "some-fixed-value"}` while the staging snapshot also has `email: "user-typed-value"` — both fields reach the orchestrator unchanged and the LLM decides which to use as part of its response. The renderer does not decide; the orchestrator does not merge; the LLM interprets. This pushes the decision to the only layer that can know what the intent was.

**The buffer is not cleared on flush.** Flushing is a read operation, not a consume operation. If the LLM rejects the input and re-emits the same tree, the user's partial input stays visible without any explicit "keep" step.

## Failure Modes and Their Handling

The design has three distinct risks. Each is committed to a concrete handling strategy rather than left implicit.

**Risk 1 — LLM-dependent acceptance semantics.** Form "acceptance" under this design is enforced behaviorally: the LLM is expected to emit a new tree that drops the input fields when it wants to accept, and a tree that keeps them when it wants to reject. This is a contract maintained by prompt engineering, not a mechanical invariant, and a model swap or context-pressured degraded response could violate it.

*Mitigation:* the NC runtime's system prompt to the LLM declares this contract explicitly and repeats it in every intent cycle's context. The catalog prompt (generated by `@json-ui/core`'s `generateCatalogPrompt`) is the correct place to anchor it. Testing must include adversarial cases where the LLM emits malformed or inconsistent trees to verify the runtime degrades predictably rather than silently.

**Risk 2 — Partial or timed-out LLM response.** If the LLM's streaming response times out mid-dispatch or returns a malformed tree, naive reconciliation would silently wipe the user's staging buffer (any field IDs absent from the partial tree would be dropped). A user who typed a 500-word message into a TextField and hit Submit could lose their input to a network hiccup.

*Handling:* reconciliation runs only on *successful tree commits*, not on partial streams. The renderer wrapper stages each incoming tree as pending during streaming. If the stream completes and the new tree validates against the catalog, the renderer commits it and reconciliation runs. If the stream fails, errors, or fails validation, the previous tree remains active and the buffer is untouched. The in-flight flag clears in either outcome. This means the user may see an error state, but they will not lose typed input.

**Risk 3 — NCRenderer unmount.** The staging buffer lives in a React ref tied to the `NCRenderer` component instance. If the component unmounts — route change, error boundary, hot reload — the buffer dies with it.

*Handling:* this is a **deliberate non-goal**. The buffer is ephemeral by design and does not survive unmount. Persistent user drafts are out of scope for this spec. A future enhancement could offer opt-in persistence for specific fields via a catalog flag, routing through memoryjs rather than parallel storage — but that would be a separate spec, not a patch to this one.

## Surfaces and File Layout

This design introduces no changes to JSON-UI or memoryjs. All new code lives inside the future `neural-computer/` repository (to be scaffolded). Proposed layout of the relevant files:

```
neural-computer/
├── src/
│   ├── renderer/
│   │   ├── index.ts                # exports nc-renderer + hooks
│   │   ├── nc-renderer.tsx         # NC wrapper around @json-ui/react Renderer
│   │   └── staging-buffer.ts       # the Map<FieldId, unknown> + rules
│   ├── orchestrator/
│   │   ├── loop.ts                 # main loop (uses intent events)
│   │   └── intent-event.ts         # IntentEvent type definition
│   └── catalog/
│       └── input-fields.ts         # catalog schemas with required id field
└── docs/
    └── 2026-04-11-ephemeral-ui-state-design.md   # this file
```

### NC catalog convention

Every NC catalog component that accepts user input must include `id: z.string()` in its props schema:

```typescript
import { createCatalog } from "@json-ui/core";
import { z } from "zod";

export const ncCatalog = createCatalog({
  components: {
    TextField: {
      props: z.object({
        id: z.string(),          // required for staging buffer key
        label: z.string(),
        placeholder: z.string().optional(),
        error: z.string().optional(),
      }),
    },
    Checkbox: {
      props: z.object({
        id: z.string(),
        label: z.string(),
      }),
    },
  },
  actions: {
    submit_form: { description: "Submit current form" },
    cancel: { description: "Cancel current action" },
  },
});
```

### NC implements every input component

JSON-UI ships zero built-in input components. `@json-ui/react`'s `Renderer` is a pure dispatcher: it takes a `registry` prop mapping component types to React implementations, and the registry's components are entirely caller-provided. The NC runtime must implement `TextField`, `Checkbox`, `Select`, and friends in its own registry. Those NC-authored components call into the staging buffer (via an NC-provided hook or React context) rather than into JSON-UI's `DataProvider`. `DataProvider` remains reserved for durable read-only data displayed in non-input components.

This is not a workaround — it is the expected shape of a catalog-based system. The catalog defines the vocabulary; the consumer provides the implementation. The staging buffer is the consumer's private concern.

### Action param resolution and DynamicValue

`@json-ui/core` supports `DynamicValue` params in actions — param entries shaped `{path: "some/path"}` that are resolved against the data model at execution time by `resolveAction` in `packages/core/src/actions.ts`. By default, this resolution reads from `DataProvider`. Staging buffer values are not in `DataProvider` and therefore will not resolve through that path.

**NC's handling:** the NC runtime's action handler *pre-resolves* any `DynamicValue` params against the staging buffer before the call reaches JSON-UI's `resolveAction`. Concretely, when the renderer wrapper detects an action firing, it walks `action.params` for `DynamicValue` entries that reference staging-buffer field IDs, substitutes their buffer values in place, and only then constructs the `IntentEvent`. Params that reference durable-data paths still resolve via JSON-UI's standard path through `DataProvider`, which is populated from memoryjs. The two namespaces stay separate; JSON-UI does not need to know the staging buffer exists.

### NCRenderer wrapper (sketch)

```typescript
// neural-computer/src/renderer/nc-renderer.tsx
import { Renderer, JSONUIProvider } from "@json-ui/react";
import type { UITree } from "@json-ui/core";
import { StagingBufferProvider, useStagingBuffer } from "./staging-buffer";
import type { IntentEvent } from "../orchestrator/intent-event";

export interface NCRendererProps {
  tree: UITree;
  registry: ComponentRegistry;   // NC's input components + read-only renderers
  onIntent: (event: IntentEvent) => void;
}

export function NCRenderer({ tree, registry, onIntent }: NCRendererProps) {
  // Wraps JSONUIProvider + Renderer.
  // Registers its own actionHandlers that read the staging buffer on fire
  // and emit IntentEvents to onIntent.
  // Tracks the in-flight flag to reject duplicate intents.
  // Reconciles the staging buffer only after a successful tree commit.
}
```

### Orchestrator loop (sketch)

```typescript
// neural-computer/src/orchestrator/loop.ts
async function runOrchestratorLoop(initialTree: UITree) {
  let currentTree = initialTree;

  const onIntent = async (event: IntentEvent) => {
    const observation = await composeObservation(event, getCurrentDurableState());
    const dispatches = await invokeLLM(observation);
    for (const d of dispatches) {
      await execute(d);
    }
    currentTree = await computeNextTree(getCurrentDurableState());
    render(<NCRenderer tree={currentTree} registry={ncRegistry} onIntent={onIntent} />);
  };

  render(<NCRenderer tree={currentTree} registry={ncRegistry} onIntent={onIntent} />);
}
```

The orchestrator sees only `IntentEvent` objects. It never touches the staging buffer directly.

## Testable Invariants

The spec's correctness can be verified by these invariants, each mapping to a unit test in `neural-computer/src/renderer/staging-buffer.test.ts` or an integration test in the renderer package.

1. **Reconciliation drops:** after reconciling against a tree without field `X`, `snapshot()` does not contain a value for `X`.
2. **Reconciliation preserves across presence:** after reconciling against a tree that still contains field `X`, `snapshot()` still contains the previously-set value for `X`.
3. **Reconciliation preserves across prop changes:** after reconciling against a tree containing field `X` with different props than before, `snapshot()` still contains the previously-set value for `X`.
4. **Snapshot is non-destructive:** two `snapshot()` calls back-to-back, with no intervening `set()` or `reconcile()`, return equal data.
5. **Intent events carry full snapshot:** a fired intent event's `staging_snapshot` contains every field ID currently in the buffer, not just the fields referenced by the action's params.
6. **`action_params` and `staging_snapshot` are separate:** when a firing action has explicit params that collide with buffer keys, both fields reach the orchestrator unmerged, with both values preserved.
7. **Buffer isolation:** the orchestrator module does not import from `renderer/staging-buffer.ts`. Enforced by test or lint rule.
8. **Field ID uniqueness:** attempting to render a tree with two fields sharing the same `id` raises a catalog validation error before the tree reaches JSON-UI.
9. **Partial-tree safety:** if a streaming LLM response fails to complete a valid tree, reconciliation does not run and the buffer contents are unchanged.
10. **Backpressure rejection:** while an intent is in flight, new intent events are rejected (and logged), not queued.
11. **DynamicValue pre-resolution:** when an action's `DynamicValue` param references a staging-buffer field ID, the substitution happens before `resolveAction` is called, and the substituted value is what reaches JSON-UI.

## What This Spec Is Not

- **Not the full NC runtime architecture.** Orchestrator loop details, LLM invocation shape, Python subprocess dispatch, memoryjs transaction patterns, and broad catalog design are separate specs.
- **Not a JSON-UI modification.** No files under `C:\Users\danie\Dropbox\Github\JSON-UI` change. JSON-UI is consumed as a published package.
- **Not an implementation plan.** No concrete function bodies, task breakdown, or sequencing. That is the job of a follow-up writing-plans deliverable.
- **Not draft persistence.** Buffer contents die when `NCRenderer` unmounts (see Risk 3).

## Open Questions

1. **Where to enforce field ID uniqueness.** Validation error is committed (see Invariant 8). The exact site — catalog-definition time, tree-emission time, or render time — is unresolved. Leaning toward tree-emission time, because that is the boundary closest to the error's cause (the LLM's output) and catches it before the buffer sees it.

2. **Backpressure UX — load-bearing.** The mechanism is decided: the renderer wrapper tracks an in-flight flag and rejects new intent events while the prior is unresolved (see Invariant 10). What is *not* decided is how the user finds out their second click was rejected. Candidates: disabled button state during flight, subtle toast, no feedback and silent drop, or a queued replay. This is a UX decision that meaningfully affects usability, and I am flagging it as load-bearing rather than peripheral. The first implementation must commit to one of these before shipping; "deferred" is not an acceptable end state.

3. **Buffer persistence across process restart.** No by default. Buffers are ephemeral and do not survive a process crash. Opt-in persistence for specific fields via a `persist: true` catalog flag, routed through memoryjs rather than parallel storage, is a plausible future enhancement — but explicitly out of scope here.

4. **DynamicValue scope.** `DynamicValue` entries may reference durable-state paths (resolved via `DataProvider`) and staging-buffer field IDs (resolved via NC's pre-resolve step). Unresolved: whether `DynamicValue` entries should also be allowed to reference other entries in the same action's params — i.e., nested `DynamicValue`s. Leaning no, because it introduces evaluation-order ambiguity for little payoff.

## Non-Goals

- No multi-user collaborative editing. No CRDTs, no shared buffers across renderer instances.
- No optimistic updates. The LLM decides what "accepting" an input means by emitting the next tree.
- No direct DOM manipulation by the staging buffer. It is a pure data structure.
- No modifications to JSON-UI's internal APIs. If a future need requires such a change, it is a separate upstream contribution, not part of this spec.
- No persistent drafts (see Risk 3 handling and Open Question 3).

## Prior Art

- Zhuge et al., *Neural Computers*. arXiv:2604.04625. Meta AI / KAUST, April 2026. The paper's update-and-render loop framing and its "separation between run and update" language. The NC project takes this as inspiration but replaces the paper's video-model substrate with an LLM orchestrator dispatching to real tools; the naming convention ("Neural Computer") is preserved because it captures the *ambition*, not because this design implements the paper's approach.
- Vercel Labs, `json-render`. The constrained-catalog approach with Zod schemas, rich actions, and a React renderer that JSON-UI (and therefore NC) builds on as a dependency.
- Google, `a2ui`. The flat-tree-with-stable-IDs representation that makes keyed reconciliation viable for LLM-generated trees.
- React's own keyed reconciliation algorithm, which inspired the staging buffer's reconciliation rule directly.
- `react-hook-form`'s ref-based store pattern. Architecturally close to the staging buffer at the data-structure level. The difference is that NC integrates the flush step with the intent event pipeline as a first-class architectural boundary, which would require wrapping `react-hook-form` anyway if it were adopted instead. Acknowledged as a close alternative; this spec does not use it, but a reader who is already fluent in `react-hook-form` will find the mental model similar.
