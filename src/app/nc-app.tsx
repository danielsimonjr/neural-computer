"use client";

import React from "react";
import type { Catalog, UITree } from "@json-ui/core";
import { NCRenderer } from "../renderer";
import type {
  NCRuntime,
  NCCatalogVersion,
  NCIntentHandler,
} from "../types";

export interface NCAppProps {
  runtime: NCRuntime;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catalog: Catalog<any, any, any>;
  catalogVersion: NCCatalogVersion;
  initialTree: UITree;
  /**
   * Factory that takes the NCApp's internal `setTree` reference and
   * returns the NCIntentHandler the runtime should use. The handler
   * is responsible for calling `setTree(nextTree)` on every committed
   * tree transition — typically by passing setTree as the
   * `onTreeCommit` callback to `createStubIntentHandler` (or the real
   * LLM-backed handler once that exists).
   *
   * NCApp calls this factory in a useEffect with the current setTree,
   * then installs the result via `runtime.setIntentHandler`. When
   * `buildIntentHandler`'s identity changes across renders, NCApp
   * re-installs the new handler so the runtime always dispatches to
   * the latest one.
   *
   * STABILITY REQUIREMENT: callers SHOULD memoize this with useCallback
   * (or hoist it to module scope). An inline arrow `buildIntentHandler={
   * (setTree) => createStubIntentHandler({...})}` has a new identity on
   * every parent render, which causes NCApp to re-run the install
   * useEffect and rebuild the handler every commit. Not a correctness
   * bug (the old handler is cleanly replaced), but wasteful — and
   * react-strict-mode's double-invocation amplifies the churn during
   * development. The integration tests pin the factory at module scope
   * so they don't hit this path.
   */
  buildIntentHandler: (setTree: (tree: UITree) => void) => NCIntentHandler;
}

/**
 * The top-level React mounting point for an NC app. Owns the current
 * UITree in a React state hook, installs the intent handler against
 * the runtime on mount, and renders NCRenderer.
 *
 * NCApp is intentionally small — it exists so the caller does not
 * have to repeat the useState + useEffect + setIntentHandler dance
 * in every integration. For callers that need to own the tree state
 * themselves (e.g., because the tree comes from a useUIStream hook
 * running elsewhere), mount NCRenderer directly and call
 * runtime.setIntentHandler manually.
 */
export function NCApp({
  runtime,
  catalog,
  catalogVersion,
  initialTree,
  buildIntentHandler,
}: NCAppProps) {
  const [tree, setTree] = React.useState<UITree>(initialTree);

  React.useEffect(() => {
    const handler = buildIntentHandler(setTree);
    runtime.setIntentHandler(handler);
  }, [runtime, buildIntentHandler]);

  return (
    <NCRenderer
      tree={tree}
      runtime={runtime}
      catalog={catalog}
      catalogVersion={catalogVersion}
    />
  );
}
