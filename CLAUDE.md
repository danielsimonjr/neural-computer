# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read these first

- `AGENTS.md` — the authoritative agent instructions.
- `docs/specs/2026-04-11-ephemeral-ui-state-design.md` — staging buffer (shipped).
- `docs/specs/2026-04-16-headless-dual-backend-design.md` — observer (shipped).
- `docs/specs/2026-08-29-compute-rlm-repl-design.md` — Python REPL (shipped).
- `docs/specs/2026-08-29-llm-intent-handler-design.md` — LLM intent handler (shipped).
- `docs/plans/2026-04-15-neural-computer-v2-plan.md` — v1 plan; supersedes April-11.
- `docs/architecture/OVERVIEW.md` — diagram and 13 invariants.
- `CHANGELOG.md` and `docs/audits/` — traps not to re-introduce.

New design work goes in `docs/specs/YYYY-MM-DD-<slug>.md` with a matching `docs/plans/` file before implementation.

## Commands

```bash
bun run typecheck
bun test
bun run test:watch
bun run test:coverage
bun run build
bun run lint
bun run format
bun run docs:deps
```

Single-test patterns:

```bash
npx vitest run src/renderer/nc-renderer.test.tsx
npx vitest run -t "reconcile"
```

## Architecture in one paragraph

NC is a **composer**. Sibling libraries: `@json-ui/core` + `@json-ui/react` + `@json-ui/headless`, `@danielsimonjr/memoryjs`. User input accumulates in a staging buffer; a named action flushes an `IntentEvent` to `NCIntentHandler`. Invalid trees never reach JSON-UI (last-good stays on screen). The observer shadows successful commits. `createPythonRepl` owns a persistent CPython worker. `createLlmIntentHandler` is the production intent handler (injected transport; Anthropic adapter included). Seven named state surfaces, thirteen testable invariants, backpressure that disables buttons.

Module map (`src/index.ts` / `src/core.ts` / `src/react.ts`):

- `types/` — `NCRuntime`, `NCIntentHandler`, `NCCatalogVersion`, `NCObserver`
- `catalog/` — `ncStarterCatalog` + `NC_CATALOG_VERSION` (`nc-starter-0.3`)
- `runtime/` — `createNCRuntime` (sync; backpressure + handler slot + observer)
- `orchestrator/` — `createStubIntentHandler`, `createLlmIntentHandler`, Anthropic transport
- `renderer/` — `NCRenderer`, input components, `useCommittedTree`
- `memory/` — `defaultNCProjection`
- `app/` — `NCApp`
- `observer/` — `createNCObserver`, `ncHeadlessRegistry`
- `compute/` — `createPythonRepl` (Python subprocess, RLM pattern)
- `integration/` — Path C end-to-end

## Local-dev requirements

`file:` deps: `@json-ui/core`, `@json-ui/react`, `@json-ui/headless`, `@danielsimonjr/memoryjs`. React 19 is a peerDependency (also in devDependencies for tests).

### The React dedup alias is load-bearing

See AGENTS.md. If hooks throw `Cannot read properties of null (reading 'useState')`, restore `vitest.config.ts` aliases.

## Conventions that have caused bugs

See AGENTS.md "Critical Conventions". Also: `extraRegistry` cannot override builtins; `cancel` clears staging after the snapshot is on the IntentEvent; `getLastRender()` is frozen.
