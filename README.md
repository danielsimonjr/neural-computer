# Neural Computer

An LLM-driven runtime inspired by Zhuge et al., *Neural Computers* (arXiv:2604.04625, April 2026). The runtime treats the LLM as a background intent engine sitting between a constrained JSON UI layer and a Python REPL, with durable state held in a knowledge graph.

**Status:** Pre-implementation. Design specs in [`docs/`](./docs/). No source code yet.

## Architecture

Three components, each imported as a dependency:

- **JSON-UI** (`@json-ui/core`, `@json-ui/react`) — the renderer. The LLM emits catalog-constrained JSON; JSON-UI renders it via a pluggable component registry. Sibling repo at [`../JSON-UI`](../JSON-UI).
- **memoryjs** (`@danielsimonjr/memoryjs`) — durable state. A TypeScript knowledge graph with transactions, audit, and governance. Sibling repo at [`../memoryjs`](../memoryjs).
- **Python REPL** (via the RLM pattern from MIT CSAIL) — the computation arm. Invoked via `child_process.spawn` with a JSON-over-stdin protocol when the LLM decides a dispatch needs real code.

The TypeScript orchestrator threads these together: LLM call → parse response → dispatch (memoryjs transaction, Python job, or new UI tree) → re-render → wait for the next intent event.

## Planned project layout

```
neural-computer/
├── src/
│   ├── renderer/         # NC wrapper around @json-ui/react
│   ├── orchestrator/     # Main loop, intent event types
│   ├── catalog/          # NC's catalog of input components
│   ├── memory/           # memoryjs adapters
│   └── compute/          # Python subprocess dispatch
├── docs/                 # Design specs — start here
├── package.json
└── tsconfig.json
```

## Design specs

- [`docs/2026-04-11-ephemeral-ui-state-design.md`](./docs/2026-04-11-ephemeral-ui-state-design.md) — the staging buffer pattern for in-progress user input. Resolves the "run vs update separation" question the paper leaves open, but via access discipline rather than ontology. Five named state surfaces with declared read/write boundaries. Read this first.

## Development

```bash
npm install
npm run typecheck
npm test
```

Local development requires the sibling `JSON-UI` repo to be checked out at `../JSON-UI`, because `@json-ui/core` and `@json-ui/react` are not yet published to npm. You can link them with `npm link` from the JSON-UI package directories, or add `file:` dependencies to `package.json` temporarily.

## Status and roadmap

This repo currently contains one design spec and no source code. The next step is to write an implementation plan for the renderer wrapper and the staging buffer, then begin coding `src/renderer/`.

## Prior art

- Zhuge et al., *Neural Computers*. arXiv:2604.04625. Meta AI / KAUST, April 2026. The update-and-render loop framing.
- Vercel Labs, `json-render`. The constrained-catalog approach JSON-UI builds on.
- Google, `a2ui`. The flat-tree-with-stable-IDs representation.
- Zhang, Kraska, Khattab (MIT CSAIL), *Recursive Language Models*. The Python REPL dispatch pattern used for the runtime's computation arm.

## License

Apache-2.0. See [LICENSE](./LICENSE).
