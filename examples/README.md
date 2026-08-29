# Example (not a runnable app)

This package is `private` and unpublished. Sibling checkouts are required:

- `../JSON-UI`
- `../memoryjs`

Use Bun (`bun install`) to match CI. React 19 is a peer dependency.

```tsx
import { createNCRuntime, NCApp, ncStarterCatalog, NC_CATALOG_VERSION, createStubIntentHandler } from "neural-computer";
import { createObservableDataModel } from "@json-ui/core";
import type { UITree } from "@json-ui/core";

const runtime = createNCRuntime({
  durableStore: createObservableDataModel({}),
  catalog: ncStarterCatalog,
  catalogVersion: NC_CATALOG_VERSION,
});

const initialTree: UITree = {
  root: "r",
  elements: { r: { key: "r", type: "Text", props: { content: "hello" } } },
};

function buildIntentHandler(setTree: (tree: UITree) => void) {
  return createStubIntentHandler({
    catalog: ncStarterCatalog,
    nextTree: (event) => ({
      root: "r",
      elements: {
        r: { key: "r", type: "Text", props: { content: event.action_name } },
      },
    }),
    onTreeCommit: setTree,
  });
}

export function App() {
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
```

Orchestrator-only (no React): `import { createNCRuntime } from "neural-computer/core"`.
