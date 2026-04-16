# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read these first

- `AGENTS.md` — the authoritative agent instructions (code style, workflow, critical conventions that have caused bugs, what-not-to-do). Everything in AGENTS.md applies here; this file only adds what AGENTS.md does not cover.
- `docs/specs/2026-04-11-ephemeral-ui-state-design.md` — the staging buffer design and the five named state surfaces. Required reading before touching `src/renderer/`.
- `docs/plans/2026-04-15-neural-computer-v2-plan.md` — the v1 implementation plan (shipped); supersedes the April-11 plan.
- `docs/architecture/OVERVIEW.md` — high-level diagram and the 11 invariants.
- `CHANGELOG.md` — the Fixed section enumerates review-caught bugs; treat it as a list of traps to not re-introduce.

New design work goes in `docs/specs/YYYY-MM-DD-<slug>.md` with a matching `docs/plans/` file before implementation.

## Commands

```bash
npm run typecheck          # tsc --noEmit; run after every change
npm test                   # vitest run (jsdom env); currently 47 tests / 11 files
npm run test:watch         # vitest in watch mode
npm run test:coverage      # coverage report
npm run build              # tsup -> dist/{index.js,index.cjs,index.d.ts}
npm run format             # prettier on ts/tsx/json/md
npm run docs:deps          # regenerate docs/architecture/dependency-graph.* via the tool in tools/
```

Single-test patterns:

```bash
npx vitest run src/renderer/nc-renderer.test.tsx        # one file
npx vitest run -t "reconcile"                           # one test name (regex)
```

No lint script exists yet; `.eslintrc.cjs` is minimal scaffolding.

## Architecture in one paragraph

NC is a **composer**, not a primary library. Three sibling libraries do the real work: `@json-ui/core` + `@json-ui/react` (catalog-constrained renderer), `@danielsimonjr/memoryjs` (knowledge-graph durable state), and — planned — a Python REPL subprocess (RLM pattern). NC's TypeScript runtime threads them together via an intent-event loop: user input accumulates in a **staging buffer**, a named action flushes an intent to `NCIntentHandler`, the handler mutates `durableStore` and/or returns a new `UITree`, the renderer reconciles the committed tree. The LLM sees exactly `(durable state + intent payloads)` and nothing else. Five named state surfaces, eleven testable invariants, backpressure gate that rejects concurrent intents.

Module map (public surface in `src/index.ts`):

- `types/` — `NCRuntime`, `NCIntentHandler`, `NCCatalogVersion`
- `catalog/` — `ncStarterCatalog`, `NC_CATALOG_VERSION`
- `runtime/` — `createNCRuntime` (owns backpressure gate + deferred handler slot via `setIntentHandler`)
- `orchestrator/` — `createStubIntentHandler` (no React)
- `renderer/` — `NCRenderer`, `NCContainer`/`NCText`/`NCTextField`/`NCCheckbox`/`NCButton`, `useCommittedTree`
- `memory/` — `defaultNCProjection` (memoryjs → React data model)
- `app/` — `NCApp` top-level mounting component
- `integration.test.tsx` — end-to-end Path C integration test

## Local-dev requirements (non-obvious)

Three dependencies are installed as `file:` symlinks to sibling repos:

- `@json-ui/core` → `../JSON-UI/packages/core`
- `@json-ui/react` → `../JSON-UI/packages/react`
- `@danielsimonjr/memoryjs` → `../memoryjs`

Those sibling checkouts must exist at the paths above — the README's "Development" section and AGENTS.md "Dependency Notes" spell out why, but in short: nothing is published to npm yet.

### The React dedup alias is load-bearing

`vitest.config.ts` pins `react`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `react-dom`, `react-dom/client` to NC's own `node_modules/react{,-dom}`. Without this, Node's module resolution walks up from the symlinked JSON-UI source and finds `../JSON-UI/node_modules/react`, producing two React instances and every hook call throwing `Cannot read properties of null (reading 'useState')`. If you see that error, the alias has been weakened — restore it before debugging anything else. The same rationale applies to any future Vite/webpack config; `package.json` also uses `overrides` to pin React for install-time dedup.

## Conventions that have caused bugs

AGENTS.md "Critical Conventions" is the canonical list. Don't re-derive them from scratch; re-read that section before editing `NCButton`, `NCRenderer.onIntent`, `createNCRuntime`, `NCApp.buildIntentHandler`, or anything that reads `useUIStream` directly. The user's auto-memory also indexes the same traps — consult both.
