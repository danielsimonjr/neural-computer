# LLM Intent Handler Implementation Plan

**Goal:** Add `createLlmIntentHandler` / `createAnthropicIntentHandler` so an intent can compose an observation, call a model (injected transport), optionally use the Python REPL and durable writes, and commit one catalog-valid tree.

**Architecture:** Pure `composeNcObservation` plus a tool loop in `src/orchestrator/`. Anthropic is one `NCLlmTransport`. Fake transports in tests. Same `NCIntentHandler` signature as the stub. No React imports (Invariant 7).

**Spec:** [`docs/specs/2026-08-29-llm-intent-handler-design.md`](../specs/2026-08-29-llm-intent-handler-design.md)

**Tech:** TypeScript 5.9, Vitest 4, `@json-ui/core` `generateCatalogPrompt`, optional `@anthropic-ai/sdk` for the Anthropic adapter.

---

## Task 1: Observation composer + limits

- `src/orchestrator/limits.ts`, `src/orchestrator/observation.ts`
- Tests: payload includes intent, durable, observer, contract; truncation sets `truncated`; intent never dropped

## Task 2: Transport types + tool loop

- `src/orchestrator/llm-transport.ts`, `src/orchestrator/llm-handler.ts`
- Fake transport tests: valid commit; invalid tree retry then commit; maxRounds; python_exec; durable_write; transport throw

## Task 3: Anthropic adapter

- `src/orchestrator/anthropic-transport.ts` with injectible `send`
- `createAnthropicIntentHandler` convenience
- Map NC tools ↔ Anthropic tool_use / tool_result

## Task 4: Export, docs, example wiring

- Export from `src/orchestrator/index.ts`, `src/core.ts`, `src/index.ts` (not `src/react.ts`)
- CHANGELOG, README, architecture, examples/README
- Fix stale `skipLibCheck` / Select claims while touching those files
- `bun add @anthropic-ai/sdk`

## Done criteria

- `bun run typecheck`, `bun test`, `bun run lint`, `bun run format:check`, `bun run build`
- No network in unit tests
- Orchestrator isolation test still passes
