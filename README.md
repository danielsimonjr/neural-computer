# Neural Computer

An LLM-driven runtime inspired by Zhuge et al., *Neural Computers* (arXiv:2604.04625, April 2026). The runtime treats the LLM as a background intent engine sitting between a constrained JSON UI layer and a Python REPL, with durable state held in a knowledge graph.

**Status:** v1 implementation shipped (2026-04-15). The React-side Path C integration is live: 44 tests passing across 11 files, typecheck clean, build clean, public barrel exposes 13 runtime symbols. Real Anthropic-backed intent handler, `@json-ui/headless` dual-backend session, and Python REPL subprocess dispatch are deferred to follow-up specs. See [`CHANGELOG.md`](./CHANGELOG.md) for the full v1 breakdown and [`docs/plans/2026-04-15-neural-computer-v2-plan.md`](./docs/plans/2026-04-15-neural-computer-v2-plan.md) for the task-by-task plan.

## Architecture

Three components, each imported as a dependency:

- **JSON-UI** (`@json-ui/core`, `@json-ui/react`) — the renderer. The LLM emits catalog-constrained JSON; JSON-UI renders it via a pluggable component registry. Sibling repo at [`../JSON-UI`](../JSON-UI).
- **memoryjs** (`@danielsimonjr/memoryjs`) — durable state. A TypeScript knowledge graph with transactions, audit, and governance. Sibling repo at [`../memoryjs`](../memoryjs).
- **Python REPL** (via the RLM pattern from MIT CSAIL) — the computation arm. Invoked via `child_process.spawn` with a JSON-over-stdin protocol when the LLM decides a dispatch needs real code.

The TypeScript orchestrator threads these together: LLM call → parse response → dispatch (memoryjs transaction, Python job, or new UI tree) → re-render → wait for the next intent event.

## Project layout (v1)

```
neural-computer/
├── src/
│   ├── index.ts              # public barrel — 13 runtime exports
│   ├── types/                # NCRuntime, NCIntentHandler, NCCatalogVersion
│   ├── catalog/              # ncStarterCatalog + NC_CATALOG_VERSION
│   ├── runtime/              # createNCRuntime (backpressure + handler slot)
│   ├── orchestrator/         # createStubIntentHandler + buffer-isolation test
│   ├── renderer/             # NCRenderer, NC input components, useCommittedTree
│   ├── app/                  # NCApp React mounting component
│   ├── memory/               # defaultNCProjection for memoryjs adapter
│   └── integration.test.tsx  # end-to-end Path C integration test
├── docs/                     # Design specs and plans — start here
├── CHANGELOG.md              # v1 release notes
├── vitest.config.ts          # jsdom env + react dedup alias
├── tsup.config.ts            # ESM + CJS + dts build
├── .eslintrc.cjs             # minimal root config
├── package.json
└── tsconfig.json
```

NOT yet implemented: `compute/` (Python subprocess dispatch via RLM pattern, separate spec).

## Design specs and plans

- [`docs/specs/2026-04-11-ephemeral-ui-state-design.md`](./docs/specs/2026-04-11-ephemeral-ui-state-design.md) — the staging buffer pattern for in-progress user input. Resolves the "run vs update separation" question the paper leaves open, but via access discipline rather than ontology. Five named state surfaces with declared read/write boundaries. Read this first.
- [`docs/plans/2026-04-15-neural-computer-v2-plan.md`](./docs/plans/2026-04-15-neural-computer-v2-plan.md) — the v1 implementation plan, 13 tasks, shipped 2026-04-15. Supersedes the April-11 plan which was written before `@json-ui/core`, `@json-ui/react`, and `@danielsimonjr/memoryjs` shipped the primitives the April-11 plan hand-rolled.

## Development

```bash
npm install
npm run typecheck
npm test
```

Local development requires the sibling `JSON-UI` repo to be checked out at `../JSON-UI`, because `@json-ui/core` and `@json-ui/react` are not yet published to npm. You can link them with `npm link` from the JSON-UI package directories, or add `file:` dependencies to `package.json` temporarily.

## Quickstart

```tsx
import { ManagerContext, createObservableDataModelFromGraph } from "@danielsimonjr/memoryjs";
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
const runtime = await createNCRuntime({ durableStore });

const initialTree: UITree = {
  root: "r",
  elements: {
    r: { key: "r", type: "Text", props: { content: "hello" } },
  },
};

function App() {
  return (
    <NCApp
      runtime={runtime}
      catalog={ncStarterCatalog}
      catalogVersion={NC_CATALOG_VERSION}
      initialTree={initialTree}
      buildIntentHandler={(setTree) =>
        createStubIntentHandler({
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
        })
      }
    />
  );
}

createRoot(document.getElementById("app")!).render(<App />);
```

## Roadmap

v1 shipped 2026-04-15. Deferred items (each is its own follow-up spec):

- Real Anthropic-backed intent handler replacing the stub
- `@json-ui/headless` dual-backend session for the LLM Observer layer
- Python REPL subprocess dispatch (RLM pattern)
- Persistent staging buffer (currently an explicit non-goal)
- Catalog versioning + migration flow

## Prior art

- Zhuge et al., *Neural Computers*. arXiv:2604.04625. Meta AI / KAUST, April 2026. The update-and-render loop framing.
- Vercel Labs, `json-render`. The constrained-catalog approach JSON-UI builds on.
- Google, `a2ui`. The flat-tree-with-stable-IDs representation.
- Zhang, Kraska, Khattab (MIT CSAIL), *Recursive Language Models*. The Python REPL dispatch pattern used for the runtime's computation arm.

## License

Apache-2.0. See [LICENSE](./LICENSE).
