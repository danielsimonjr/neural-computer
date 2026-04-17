# Neural Computer - Project Overview

**Version**: 0.1.0
**Last Updated**: 2026-04-16

## What Is This?

Neural Computer (NC) is an **LLM-driven application runtime** inspired by Zhuge et al., *Neural Computers* (arXiv:2604.04625, April 2026). The runtime treats the LLM as a background intent engine sitting between a constrained JSON UI layer and a Python REPL, with durable state held in a knowledge graph.

NC does not implement the paper's learned-video-model substrate. It takes the paper's update-and-render loop framing as inspiration and replaces it with an LLM orchestrator dispatching to real tools: JSON-UI for rendering, memoryjs for durable state, and (planned) a Python subprocess for computation.

## Key Capabilities

| Feature | Description |
|---------|-------------|
| **Catalog-Constrained UI** | LLM emits JSON trees validated against a Zod-typed component catalog |
| **Staging Buffer** | In-progress user input accumulates in a shared buffer, flushed only on named intent actions |
| **Intent-Event Architecture** | The LLM observes exactly (durable state + intent payloads) and nothing else |
| **Backpressure Gate** | Rejects concurrent intents while one is in flight (NC Invariant 10) |
| **Knowledge Graph State** | Durable state via memoryjs with projection into the React data model |
| **DynamicValue Resolution** | Action params resolve against staging before reaching the orchestrator |
| **13 Testable Invariants** | Spec-level guarantees verified by 66 tests across 13 files |

## Quick Architecture Overview

```
                         User
                          |
                     [React UI]
                          |
  +-----------------------+-----------------------+
  |                       |                       |
NCApp              NCRenderer              NCButton/
(tree state)    (validate + reconcile)    NCTextField/...
  |                       |                  (staging)
  |               StagingBuffer -----.           |
  |               (Map<FieldId, T>)   \          |
  |                       |            \         |
  |                  onIntent           \   useStagingField
  |                       |              \       |
  +--- setIntentHandler --+               '---> ActionProvider
            |                                    |
      createNCRuntime                     IntentEvent
      (backpressure gate)                        |
            |                              Orchestrator
      NCIntentHandler                    (stub / future LLM)
            |                                    |
      ObservableDataModel <--------- memoryjs transactions
      (durableStore)
```

## Three Components

NC is a consumer that composes three independently-developed libraries:

| Component | Package | Role |
|-----------|---------|------|
| **JSON-UI** | `@json-ui/core`, `@json-ui/react` | Catalog-constrained renderer. The LLM emits JSON; JSON-UI validates and renders it via a pluggable component registry. |
| **memoryjs** | `@danielsimonjr/memoryjs` | Durable state. A TypeScript knowledge graph with transactions, audit, and governance. NC projects entity data into the React data model. |
| **Python REPL** | (planned) | Computation arm via the RLM pattern. Invoked when the LLM decides a dispatch needs real code. Not in v1. |

All three are sibling repos consumed via `file:` deps until they publish to npm.

## Data Model

### IntentEvent (the only thing the orchestrator sees)

```typescript
interface IntentEvent {
  action_name: string;                    // catalog-declared action
  action_params: Record<string, unknown>; // LLM-authored action params
  staging_snapshot: Record<FieldId, unknown>; // full staging buffer at flush
  catalog_version?: string;               // optional in @json-ui/core's type; NC always populates it
  timestamp: number;
}
```

### UITree (the LLM's output)

```typescript
interface UITree {
  root: string;                           // key of root element
  elements: Record<string, UIElement>;    // flat element map
}

interface UIElement {
  key: string;
  type: string;                           // catalog component name
  props: Record<string, unknown>;         // Zod-validated props
  children?: string[];                    // child element keys
}
```

## Directory Structure

```
neural-computer/
├── src/ (20 TypeScript files, ~1090 lines, 28 public exports)
│   ├── index.ts              # public barrel — 15 runtime exports
│   │
│   ├── types/ (2 files)      # Core type definitions
│   │   ├── nc-types.ts               # NCRuntime, NCIntentHandler, NCCatalogVersion, NCObserver
│   │   └── index.ts                  # Barrel export
│   │
│   ├── catalog/ (2 files)    # Component + action catalog
│   │   ├── nc-catalog.ts             # ncStarterCatalog + NC_CATALOG_VERSION
│   │   └── index.ts                  # Barrel export
│   │
│   ├── runtime/ (2 files)    # Runtime factory
│   │   ├── context.ts                # createNCRuntime (backpressure + handler slot + observer)
│   │   └── index.ts                  # Barrel export
│   │
│   ├── orchestrator/ (2 files) # Intent handling — no React
│   │   ├── handle-intent.ts          # createStubIntentHandler
│   │   └── index.ts                  # Barrel export
│   │
│   ├── renderer/ (4 files)   # React surface
│   │   ├── nc-renderer.tsx           # NCRenderer (validate + reconcile + onIntent + observer.render)
│   │   ├── input-components.tsx      # NCContainer, NCText, NCTextField, NCCheckbox, NCButton
│   │   ├── use-committed-tree.ts     # useCommittedTree (atomic commit mode)
│   │   └── index.ts                  # Barrel export
│   │
│   ├── app/ (2 files)        # Top-level mounting
│   │   ├── nc-app.tsx                # NCApp (tree state + handler wiring)
│   │   └── index.ts                  # Barrel export
│   │
│   ├── memory/ (2 files)     # memoryjs projection
│   │   ├── projection.ts            # defaultNCProjection
│   │   └── index.ts                  # Barrel export
│   │
│   ├── observer/ (3 files)   # LLM observer (Path C)
│   │   ├── nc-observer.ts            # createNCObserver (headless shadow renderer)
│   │   ├── nc-headless-components.ts # ncHeadlessRegistry (Path C headless components)
│   │   └── index.ts                  # Barrel export
│   │
│   └── integration.test.tsx  # End-to-end Path C test
│
├── docs/
│   ├── specs/                # Design specs (read before touching code)
│   ├── plans/                # Implementation plans
│   └── architecture/         # Generated + hand-authored architecture docs
│
├── tools/
│   └── create-dependency-graph/  # Codebase inventory tool
│
├── vitest.config.ts          # jsdom + React dedup aliases
├── tsup.config.ts            # ESM + CJS + dts build
├── tsconfig.json
└── package.json
```

## Key Design Principles

1. **Access Discipline**: The LLM orchestrator's observation surface is exactly (durable state + intent event payloads). Staging buffer reads are constrained to a single well-defined boundary: intent events.
2. **Mechanical Reconciliation**: The staging buffer reconciles itself against each committed tree. No imperative "clear form" or "keep input" instructions exist. Same ID = preserve. Missing ID = drop.
3. **Mutable Handler Slot**: The runtime is created synchronously; the intent handler is installed later via `setIntentHandler` to bridge React's `useEffect` lifecycle.
4. **Buffer Isolation (Invariant 7)**: The orchestrator module never imports from the renderer or React. Enforced structurally by a meta-test.
5. **Atomic Commits (Invariant 9)**: Reconciliation runs only on successful tree commits, never on partial streams.
6. **Backpressure (Invariant 10)**: One intent at a time. New intents are rejected (and logged) while one is in flight.

## Key Statistics (v1)

| Metric | Value |
|--------|-------|
| Source Files | 20 TypeScript files (.ts + .tsx) |
| Lines of Code | ~1091 |
| Public Exports | 15 value + 13 type = 28 from `src/index.ts` |
| Tests | 66 across 13 test files |
| Interfaces | 9 |
| Functions | 11 |
| Circular Dependencies | 0 |

## Getting Started

```bash
# Requires sibling repos: ../JSON-UI and ../memoryjs
npm install
npm run typecheck
npm test
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

// See README.md for full quickstart example
```

## Related Documentation

- **[Architecture Details](./ARCHITECTURE.md)** — system layers, design decisions, the 13 invariants
- **[Component Reference](./COMPONENTS.md)** — per-file documentation
- **[Data Flow](./DATAFLOW.md)** — type-click-intent-commit-render loop
- **[API Reference](./API.md)** — public barrel surface with signatures
- **[Invariants Reference](./INVARIANTS.md)** — all 13 NC spec invariants
- **[Dependency Graph](./DEPENDENCY_GRAPH.md)** — auto-generated file-level dependency map
- **[Test Coverage](./TEST_COVERAGE.md)** — auto-generated test coverage analysis

---

**Maintained by**: Daniel Simon Jr.
