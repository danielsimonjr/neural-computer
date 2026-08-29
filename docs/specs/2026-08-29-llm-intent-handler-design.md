# LLM Intent Handler

**Status:** Active (implementation 2026-08-29).
**Date:** 2026-08-29
**Scope:** Replace the stub as the production `NCIntentHandler`: compose an observation, call a model, optionally drive the Python REPL and durable writes, commit one catalog-valid `UITree`.
**Supersedes:** Deferred item "Real Anthropic-backed intent handler" on the README roadmap and in `docs/plans/2026-04-15-neural-computer-v2-plan.md`.
**Depends on:** staging-buffer spec (shipped), Path C observer (shipped), compute REPL (shipped).

## Context

April-11 named three roles. The renderer and durable-store adapter shipped. The **state update function** did not: there is no model call, no observation composer, and nothing that drives `createPythonRepl` or writes durable state from an intent.

This spec is that missing piece. It is not a new named UI state surface. LLM session state (surface 6) remains an implementation detail of the transport (prompt-cache, tool-use turns). NC still does not own an SDK client as a runtime field.

## Decision

Ship `createLlmIntentHandler({ runtime, catalog, onTreeCommit, transport, ... })` that returns the same `NCIntentHandler` the stub returns. An Anthropic adapter (`createAnthropicTransport` / `createAnthropicIntentHandler`) is one transport. Tests inject a fake transport and never hit the network.

Four options were considered:

- **H1 — Tool loop, commit is a tool (selected).** The model may call `python_exec`, `durable_write`, then must call `commit_ui_tree` with a full `UITree`. NC validates that tree; invalid trees come back as tool errors so the model can retry within `maxRounds`. Matches the RLM pattern (code, observe stdout, then produce UI) without making Python mandatory.
- **H2 — Single JSON tree in the assistant text.** Simpler, but then Python and durable writes have no protocol. Rejected.
- **H3 — Stream JSON-patch lines into `useCommittedTree`.** `useUIStream` POSTs to an HTTP `api` and applies patches. The intent handler is in-process. Pretending they are the same channel would invent an HTTP server inside NC. Rejected for this spec. Hosts that already have a patch HTTP endpoint keep using `useCommittedTree`. This handler commits **one complete tree** via `onTreeCommit`, the same as the stub (Invariant 9 at the handler boundary).
- **H4 — Handler owned by `createNCRuntime`.** Would spawn model I/O for every test runtime. Rejected; same reason compute is not on `NCRuntime`.

H1 selected. `NCApp` continues to own a complete `UITree` in `useState`. Callers who stream patches use `useCommittedTree` in a custom owner and do not use this handler's `onTreeCommit` until the stream completes.

## Observation

On each intent the handler builds one user payload and a stable system prompt.

**System prompt** (stable across turns of one intent, suitable for prompt cache):

1. `generateCatalogPrompt(catalog)` from `@json-ui/core`
2. `NC_LLM_ACCEPTANCE_CONTRACT`
3. Catalog version string
4. Tool instructions: finish by calling `commit_ui_tree`; accepting input means omitting those field ids; never reuse an id with a different component type; typing does not invoke you

**User payload** (one JSON object, size-capped):

- `intent`: `action_name`, `action_params`, `staging_snapshot`, `catalog_version`, `timestamp`
- `durable`: `runtime.durableStore.snapshot()`
- `observer`: `runtime.observer.serialize("json-string")` (null if no successful shadow yet)
- `observer_stale`: true when `getConsecutiveFailures() > 0`
- `submitted_field_ids`: keys of `staging_snapshot`

The orchestrator still does not import `../observer` or `@json-ui/headless`. It reads `runtime.observer` on the handle it was given (Invariant 7).

If the serialized payload exceeds `NC_OBSERVATION_MAX_BYTES`, truncate `observer` first, then `durable`, and set `truncated: true`. Never drop `intent`.

## Tools

| Tool                  | When advertised           | Behavior                                                                                                                                                                                                     |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `commit_ui_tree`      | Always                    | `{ tree }`. `catalog.validateTree`. Success: `onTreeCommit(result.data)`, end loop. Failure: tool error, model may retry.                                                                                    |
| `python_exec`         | `repl` option provided    | `{ code }`. `repl.exec`. Returns `{ ok, stdout, stderr, truncated, error? }`.                                                                                                                                |
| `python_load_context` | `repl` provided           | `{ text }`. `repl.loadContext`.                                                                                                                                                                              |
| `python_reset`        | `repl` provided           | `repl.reset`.                                                                                                                                                                                                |
| `durable_write`       | `onDurableWrite` provided | `{ path, value }`. Host callback. memoryjs adapters throw on `store.set`; the host maps writes onto `entityManager` / transactions. This spec does **not** invent a graph mutation DSL (separate follow-up). |

`llm_query` inside the REPL is **not** auto-wired. If the host wants nested model calls from Python, they pass `llmQuery` into `createPythonRepl` themselves (typically a tool-free `transport.complete`). The handler will not recurse into a second REPL from `llm_query`.

## Transport

```typescript
interface NCLlmMessage {
  role: "user" | "assistant";
  content: NCLlmContent[];
}

type NCLlmContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

interface NCLlmTransport {
  complete(request: {
    system: string;
    messages: NCLlmMessage[];
    tools: NCLlmTool[];
  }): Promise<{ content: NCLlmContent[] }>;
}
```

`createAnthropicTransport({ apiKey?, model?, maxTokens?, send? })` maps this onto Anthropic Messages. `send` is injectible for tests. Default model is an exported constant the host can override. No API call happens in unit tests.

## Failure modes

| Failure                        | Handling                                                               |
| ------------------------------ | ---------------------------------------------------------------------- |
| Transport throws               | Handler rejects; `emitIntent` rejects; in-flight flag clears           |
| Invalid `commit_ui_tree`       | Tool error; retry until `maxRounds`                                    |
| `maxRounds` with no valid tree | Handler rejects; `onTreeCommit` not called                             |
| Python tool without `repl`     | Tool not advertised                                                    |
| `repl` busy / timeout          | Tool result carries the error; model may retry or commit a tree anyway |
| `onDurableWrite` throws        | Tool error                                                             |
| Observation over budget        | Truncate as above; still call the model                                |

`submittedFieldsStillPresent` remains a **diagnostic**. The handler does not auto-retry when the model keeps field ids (reject path) or drop them (accept path). Risk 1 stays a prompt contract; the helper is for hosts and tests.

`cancel` still invokes the model. The runtime has already snapshotted and cleared staging. The model must still `commit_ui_tree`.

## What this is not

Not a memoryjs transaction spec. Path-shaped `durable_write` plus a host callback is the v1 seam.

Not HTTP streaming into `useCommittedTree`. That hook stays for hosts with a patch endpoint.

Not attaching the handler or a REPL to `createNCRuntime`.

Not calling the model on keystrokes.

Not a catalog-migration spec.

## Open non-goals

Provider-agnostic retries/backoff beyond `maxRounds`.

Multi-model routing.

Persisting LLM transcripts.

Auto-creating a Python worker inside the handler.
