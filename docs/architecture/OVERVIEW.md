# Neural Computer - Project Overview

**Version**: 0.1.0 (docs refreshed 2026-08-29)
**Last Updated**: 2026-08-29

## What Is This?

Neural Computer (NC) is a **catalog-constrained React form runtime**. It owns a staging buffer for in-progress input, a one-at-a-time intent gate, a deterministic stub intent handler, a headless observer cache that shadows successful tree commits, and an optional Python REPL (`createPythonRepl`) for the RLM compute arm. It is inspired by Zhuge et al., _Neural Computers_ (arXiv:2604.04625). **This package does not call an LLM.** The REPL is a subprocess a future handler can drive; it is not attached to `NCRuntime`.

The runtime validates every UI tree against `ncStarterCatalog` (version `nc-starter-0.3`) before JSON-UI renders it. Invalid trees never reach `<Renderer>`; the last good validated tree stays on screen. A named catalog action (`submit_form` or `cancel`) flushes an `IntentEvent` to `NCIntentHandler`. The stub handler maps that event to the next tree. The observer (`@json-ui/headless`) produces a frozen `NormalizedNode` of the same Zod-stripped tree React just committed.

## Key Capabilities

NC ships a Zod-typed starter catalog, a shared staging buffer flushed only on named actions, a public in-flight flag (`isIntentInFlight` / `subscribeIntentFlight`) that disables buttons, a memoryjs projection into the React data model, and DynamicValue resolution of action params against staging before the orchestrator sees them. Thirteen spec invariants are covered by tests under `src/**/*.test.*`.

What it does **not** ship: an Anthropic (or any) LLM handler, persistent staging across process restart, or catalog migration from `nc-starter-0.1` / `0.2`.

## Quick Architecture Overview

```
                         User
                          |
                     [React UI]
                          |
  +-----------------------+-----------------------+
  |                       |                       |
NCApp              NCRenderer              NCButton/
(tree state)    (validate in useMemo;     NCTextField/...
  |              last-good to Renderer;      (staging)
  |              reconcile + observer        |
  |              after commit)               |
  |               StagingBuffer -----.           |
  |               (Map<FieldId, T>)   \          |
  |                       |            \         |
  |                  onIntent           \   useStagingField
  |                       |              \       |
  +--- setIntentHandler --+               '---> ActionProvider
            |                                    |
      createNCRuntime                     IntentEvent
      (sync; isIntentInFlight)                   |
            |                              Orchestrator
      NCIntentHandler                    (stub only)
            |                                    |
      ObservableDataModel <--------- memoryjs transactions
      (durableStore)
            |
      runtime.observer (headless cache)
```

## Three sibling libraries

NC is a composer, not a primary library.

JSON-UI (`@json-ui/core`, `@json-ui/react`, `@json-ui/headless`) validates and renders catalog-constrained trees. memoryjs (`@danielsimonjr/memoryjs`) holds durable knowledge-graph state; NC projects entities and relations into the React data model. `createPythonRepl` owns a persistent CPython worker for computation. The RLM loop (model writes code until a final answer) is still a future handler concern.

All three JSON-UI packages and memoryjs are sibling repos consumed via `file:` deps until they publish to npm. React 19 is a **peer dependency**. Consumers must dedupe React themselves (`npm overrides` in this repo do not protect a host app that also depends on React). See NC-086.

## Named state surfaces (seven)

1. Durable state (memoryjs)
2. Current UI tree
3. Staging buffer
4. In-flight intent flag (`runtime.isIntentInFlight`)
5. Catalog version (`nc-starter-0.3`)
6. LLM session state (future handler; not managed here)
7. Observer cache (`runtime.observer`)

## Data Model

### IntentEvent (the only thing the orchestrator sees)

```typescript
interface IntentEvent {
  action_name: string; // catalog-declared action
  action_params: Record<string, unknown>; // LLM-authored action params
  staging_snapshot: Record<FieldId, unknown>; // full staging buffer at flush
  catalog_version?: string; // NC always populates this
  timestamp: number;
}
```

`cancel` snapshots staging onto the event, then clears the buffer. `submit_form` leaves the buffer for the next reconcile.

### UITree (committed UI)

```typescript
interface UITree {
  root: string;
  elements: Record<string, UIElement>;
}

interface UIElement {
  key: string;
  type: string;
  props: Record<string, unknown>;
  children?: string[];
}
```

## Directory Structure

```
neural-computer/
├── src/ (28 TypeScript source files, ~1799 lines, plus 15 test files)
│   ├── index.ts              # public barrel (React + core)
│   ├── core.ts               # neural-computer/core — no React
│   ├── react.ts              # neural-computer/react — "use client"
│   ├── types/                # NCRuntime, NCIntentHandler, NCCatalogVersion, NCObserver
│   ├── catalog/              # ncStarterCatalog, field-id.ts, limits.ts
│   ├── runtime/              # createNCRuntime (sync), freeze.ts
│   ├── orchestrator/         # createStubIntentHandler + buffer-isolation test
│   ├── renderer/             # NCRenderer, inputs, error-boundary, field-id-stability, intent-flight-context
│   ├── app/                  # NCApp
│   ├── memory/               # defaultNCProjection
│   ├── observer/             # createNCObserver + ncHeadlessRegistry
│   ├── compute/              # createPythonRepl + worker.py
│   └── integration/path-c.test.tsx  # Path C end-to-end
│
├── docs/
│   ├── specs/
│   ├── plans/
│   ├── audits/               # 2026-08-29 review (remediated on this branch)
│   └── architecture/
│
├── examples/
├── tools/create-dependency-graph/
├── vitest.config.ts
├── tsup.config.ts
├── tsconfig.json             # skipLibCheck is still true
└── package.json
```

`createPythonRepl` lives under `src/compute/`. It is a tool, not an eighth named UI state surface. `NCApp` / `NCRenderer` do not spawn it.

## Key Design Principles

Access discipline: the future LLM orchestrator sees exactly durable state plus intent payloads. Staging reads happen only at intent flush. Mechanical reconciliation: same field id preserves the value; a missing id drops it. Validation happens **during render** (`useMemo`), so invalid trees never reach JSON-UI's `Renderer`. The last good Zod-stripped tree is what both React and the observer walk. The runtime is created synchronously; the intent handler is installed later via `setIntentHandler`. Buffer isolation (Invariant 7) forbids the orchestrator from importing the renderer, React, headless, or `../observer`. Backpressure is a public flag, not a silent drop: buttons disable while `isIntentInFlight()` is true.

## Key Statistics (after 2026-08-29 remediation)

| Metric                | Value                                                                |
| --------------------- | -------------------------------------------------------------------- |
| Source files          | TypeScript files under `src/` excluding tests (see DEPENDENCY_GRAPH) |
| Test files            | 17 under `src/**/*.test.*`                                           |
| Catalog version       | `nc-starter-0.3`                                                     |
| Named state surfaces  | 7 (compute is a tool, not a surface)                                 |
| Spec invariants       | 13 UI-runtime + compute rules                                        |
| Circular dependencies | 0                                                                    |

`tsconfig.json` still sets `"skipLibCheck": true`. That hides some sibling-type drift (NC-042 / NC-066); it has not been flipped.

Install with Bun (`bun install`) to match CI. Node 20+.

## Starter catalog (honest v1)

Five components, two actions. There is no Select (out of the v1 catalog).

Container is a minimal flex wrapper (`direction` column or row, optional `visible`). TextField is a staging-bound input; `multiline` renders a textarea. Checkbox is a boolean. Button forwards `action.name` and `action.params` to `execute()` and disables while an intent is in flight. Actions are `submit_form` and `cancel` only.

## Getting Started

```bash
# Requires sibling repos: ../JSON-UI and ../memoryjs
bun install
bun run typecheck
bun test
```

```tsx
import {
  NCApp,
  createNCRuntime,
  createStubIntentHandler,
  defaultNCProjection,
  ncStarterCatalog,
  NC_CATALOG_VERSION,
} from "neural-computer";

// See README.md for the full quickstart. Host apps must dedupe React 19.
```

Node / orchestrator processes should import `neural-computer/core` so they do not pull the React graph. Client Components should import `neural-computer/react` (or the root barrel from a Client Component).

## Related Documentation

- **[Architecture Details](./ARCHITECTURE.md)** — layers, seven surfaces, backpressure public API
- **[Component Reference](./COMPONENTS.md)** — per-file documentation
- **[Data Flow](./DATAFLOW.md)** — type-click-intent-commit-render loop
- **[API Reference](./API.md)** — public exports including `neural-computer/core` and `/react`
- **[Invariants Reference](./INVARIANTS.md)** — all 13 NC spec invariants
- **[Dependency Graph](./DEPENDENCY_GRAPH.md)** — file-level map (regenerate after install)
- **[Test Coverage](./TEST_COVERAGE.md)** — test file inventory

---

**Maintained by**: Daniel Simon Jr.
