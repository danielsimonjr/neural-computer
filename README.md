# Neural Computer

A catalog-constrained React UI runtime: staging buffer, one-at-a-time intent gate, stub or LLM intent handler, headless observer cache, and a Python REPL compute arm (RLM pattern). Inspired by Zhuge et al., _Neural Computers_ (arXiv:2604.04625). The LLM handler is transport-injected; unit tests never hit the network. The REPL is a subprocess the orchestrator can drive; it is not attached to `NCRuntime`.

**Status:** v1 + Path C shipped. Private unpublished package (`file:` siblings). React 19 is a **peer dependency**. Use Bun (`bun install`) to match CI. See [`CHANGELOG.md`](./CHANGELOG.md) and [`examples/README.md`](./examples/README.md).

## Architecture

Shipped dependencies:

- **JSON-UI** (`@json-ui/core`, `@json-ui/react`, `@json-ui/headless`) — catalog-constrained renderer plus headless observer. Sibling at [`../JSON-UI`](../JSON-UI).
- **MemoryJS** (`@danielsimonjr/memoryjs`) — durable knowledge-graph state. Sibling at [`../memoryjs`](../memoryjs).

Not shipped: catalog migration from `nc-starter-0.1` / `0.2`; persistent staging across process restart.

## Named state surfaces (seven)

1. Durable state (memoryjs)
2. Current UI tree
3. Staging buffer
4. In-flight intent flag (`runtime.isIntentInFlight`)
5. Catalog version
6. LLM session state (transport-owned; not a field on `NCRuntime`)
7. Observer cache (`runtime.observer`)

## Project layout (v1)

```
neural-computer/
├── src/
│   ├── index.ts              # public barrel (React + core)
│   ├── core.ts               # neural-computer/core — no React
│   ├── react.ts              # neural-computer/react — "use client"
│   ├── types/                # NCRuntime, NCIntentHandler, NCCatalogVersion, NCObserver
│   ├── catalog/              # ncStarterCatalog (nc-starter-0.3), field-id, limits
│   ├── runtime/              # createNCRuntime (sync; backpressure + observer)
│   ├── orchestrator/         # stub + createLlmIntentHandler + Anthropic transport
│   ├── renderer/             # NCRenderer, inputs, error-boundary, field-id-stability
│   ├── app/                  # NCApp React mounting component
│   ├── memory/               # defaultNCProjection for memoryjs adapter
│   ├── observer/             # createNCObserver + ncHeadlessRegistry (Path C)
│   ├── compute/              # createPythonRepl (Python subprocess, RLM pattern)
│   └── integration/          # Path C end-to-end tests
├── docs/                     # Design specs, plans, architecture, audits
├── examples/
├── CHANGELOG.md
├── SECURITY.md
├── vitest.config.ts          # jsdom env + react dedup alias
├── tsup.config.ts            # ESM + CJS + dts; exports map for ., /core, /react
├── package.json
└── tsconfig.json             # skipLibCheck is false
```

Shipped: `src/compute/` — Python subprocess dispatch via the RLM pattern (`createPythonRepl`). Not attached to `NCRuntime`. See [`docs/specs/2026-08-29-compute-rlm-repl-design.md`](./docs/specs/2026-08-29-compute-rlm-repl-design.md).

## Design specs and plans

- [`docs/specs/2026-04-11-ephemeral-ui-state-design.md`](./docs/specs/2026-04-11-ephemeral-ui-state-design.md) — the staging buffer pattern for in-progress user input. The spec originally named five surfaces; the runtime now names seven (in-flight flag and observer cache). Read this first.
- [`docs/specs/2026-04-16-headless-dual-backend-design.md`](./docs/specs/2026-04-16-headless-dual-backend-design.md) — LLM observer (Path C).
- [`docs/specs/2026-08-29-compute-rlm-repl-design.md`](./docs/specs/2026-08-29-compute-rlm-repl-design.md) — Python REPL compute arm. Independent of `NCRuntime`; exported from `neural-computer/core`.
- [`docs/specs/2026-08-29-llm-intent-handler-design.md`](./docs/specs/2026-08-29-llm-intent-handler-design.md) — tool-loop intent handler; Anthropic is one transport.
- [`docs/specs/2026-08-29-sibling-api-surface.md`](./docs/specs/2026-08-29-sibling-api-surface.md) — JSON-UI / memoryjs seams and patches.
- [`docs/plans/2026-04-15-neural-computer-v2-plan.md`](./docs/plans/2026-04-15-neural-computer-v2-plan.md) — the v1 implementation plan, 13 tasks, shipped 2026-04-15.

## Development

```bash
bun install
bun run typecheck
bun test
```

Local development requires sibling checkouts at `../JSON-UI` and `../memoryjs` (`file:` dependencies in `package.json`). Node 20+. Python 3.10+ (`python3`) for `createPythonRepl`. React 19 is a **peer dependency**. This package's npm `overrides` do not protect a host application: consumers must dedupe `react` and `react-dom` so NC and `@json-ui/react` share one dispatcher (NC-086). Import `neural-computer/react` from Client Components; import `neural-computer/core` from Node.

`tsconfig.json` sets `"skipLibCheck": false`. Zod is pinned to `4.4.3` to match JSON-UI.

Starter catalog: Container is minimal flex (`direction` column or row), not a layout system. TextField supports `multiline` (textarea). Select is a native `<select>` of string options.

## Quickstart

```tsx
import {
  ManagerContext,
  createObservableDataModelFromGraph,
} from "@danielsimonjr/memoryjs";
import { createRoot } from "react-dom/client";
import React from "react";
import {
  NCApp,
  createNCRuntime,
  createStubIntentHandler,
  defaultNCProjection,
  ncStarterCatalog,
  NC_CATALOG_VERSION,
} from "neural-computer";
import type { UITree } from "@json-ui/core";

const ctx = new ManagerContext("./nc.jsonl");
const durableStore = await createObservableDataModelFromGraph(ctx.storage, {
  projection: defaultNCProjection,
});
const runtime = createNCRuntime({
  durableStore,
  catalog: ncStarterCatalog,
  catalogVersion: NC_CATALOG_VERSION,
});

const initialTree: UITree = {
  root: "r",
  elements: {
    r: { key: "r", type: "Text", props: { content: "hello" } },
  },
};

function buildIntentHandler(setTree: (tree: UITree) => void) {
  return createStubIntentHandler({
    catalog: ncStarterCatalog,
    nextTree: (event) => ({
      root: "r",
      elements: {
        r: {
          key: "r",
          type: "Text",
          props: { content: `got ${event.action_name}` },
        },
      },
    }),
    onTreeCommit: setTree,
  });
}

function App() {
  return (
    <NCApp
      runtime={runtime}
      catalog={ncStarterCatalog}
      catalogVersion={NC_CATALOG_VERSION}
      initialTree={initialTree}
      buildIntentHandler={buildIntentHandler}
    />
  );
}

createRoot(document.getElementById("app")!).render(<App />);
```

## Roadmap

v1 shipped 2026-04-15. Path C shipped 2026-04-16. Compute (`createPythonRepl`) and the LLM intent handler shipped 2026-08-29. Deferred items (each is its own follow-up spec):

- Catalog versioning + migration flow
- Persistent staging buffer (currently an explicit non-goal)
- Rich memoryjs transaction/graph DSL (v1 uses a host `onDurableWrite` callback)

## Prior art

- Zhuge et al., _Neural Computers_. arXiv:2604.04625. Meta AI / KAUST, April 2026. The update-and-render loop framing.
- Vercel Labs, `json-render`. The constrained-catalog approach JSON-UI builds on.
- Google, `a2ui`. The flat-tree-with-stable-IDs representation.
- Zhang, Kraska, Khattab (MIT CSAIL), _Recursive Language Models_. The Python REPL dispatch pattern used for the runtime's computation arm.

## License

Apache-2.0. See [LICENSE](./LICENSE).
