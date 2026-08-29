// SPDX-License-Identifier: Apache-2.0

"use client";

import React from "react";
import type { Catalog, UITree } from "@json-ui/core";
import type { ComponentRegistry } from "@json-ui/react";
import { NCRenderer } from "../renderer/nc-renderer";
import type { NCRuntime, NCCatalogVersion, NCIntentHandler } from "../types";

export interface NCAppProps {
  runtime: NCRuntime;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catalog: Catalog<any, any, any>;
  catalogVersion: NCCatalogVersion;
  /**
   * Tree shown before any intent commits a replacement. Changing this
   * *reference* resets the current tree (same as remounting with a
   * new `key`). Prefer `key={...}` on NCApp when the host navigates.
   */
  initialTree: UITree;
  extraRegistry?: ComponentRegistry;
  onValidationError?: (error: unknown) => void;
  onRenderError?: (error: Error) => void;
  /**
   * Factory that takes the NCApp's internal `setTree` reference and
   * returns the NCIntentHandler the runtime should use.
   *
   * STABILITY REQUIREMENT: memoize with useCallback or hoist to module
   * scope. Inline arrows re-run the install effect every parent render.
   */
  buildIntentHandler: (setTree: (tree: UITree) => void) => NCIntentHandler;
}

/**
 * Top-level React mounting point. Owns UITree state, installs the
 * intent handler, and renders NCRenderer. Unmount installs a no-op
 * handler so a late intent cannot call setTree.
 *
 * Streaming LLM responses: pass trees through useCommittedTree (atomic
 * mode) into a custom owner, or have buildIntentHandler only call
 * setTree with complete catalog-valid trees. createStubIntentHandler
 * validates nextTree against the catalog before onTreeCommit.
 */
export function NCApp({
  runtime,
  catalog,
  catalogVersion,
  initialTree,
  extraRegistry,
  onValidationError,
  onRenderError,
  buildIntentHandler,
}: NCAppProps) {
  const [tree, setTree] = React.useState<UITree>(initialTree);
  const prevInitial = React.useRef(initialTree);
  if (initialTree !== prevInitial.current) {
    prevInitial.current = initialTree;
    setTree(initialTree);
  }

  const setTreeIfMounted = React.useRef(setTree);
  setTreeIfMounted.current = setTree;

  React.useEffect(() => {
    let mounted = true;
    const handler = buildIntentHandler((next) => {
      if (mounted) setTreeIfMounted.current(next);
    });
    runtime.setIntentHandler(handler);
    return () => {
      mounted = false;
      runtime.setIntentHandler(async () => {});
    };
  }, [runtime, buildIntentHandler]);

  return (
    <NCRenderer
      tree={tree}
      runtime={runtime}
      catalog={catalog}
      catalogVersion={catalogVersion}
      extraRegistry={extraRegistry}
      onValidationError={onValidationError}
      onRenderError={onRenderError}
    />
  );
}
