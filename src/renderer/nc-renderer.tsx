"use client";

import React from "react";
import {
  JSONUIProvider,
  Renderer,
  type ComponentRegistry,
  type ComponentRenderer,
} from "@json-ui/react";
import {
  collectFieldIds,
  type Catalog,
  type IntentEvent,
  type UITree,
} from "@json-ui/core";
import {
  NCContainer,
  NCText,
  NCTextField,
  NCCheckbox,
  NCButton,
} from "./input-components";
import type { NCRuntime, NCCatalogVersion } from "../types";

/**
 * Maps NC-authored React components to the ComponentRegistry shape
 * @json-ui/react expects. NC components already accept `{element,
 * children}` as a subset of ComponentRenderProps, so the assignment is
 * structural and no wrapper function is needed — TypeScript's
 * `ComponentType<P>` is contravariant in P, and UIElement is structurally
 * compatible with the NC components' prop shape.
 */
function buildDefaultRegistry(): ComponentRegistry {
  return {
    Container: NCContainer as ComponentRenderer,
    Text: NCText as ComponentRenderer,
    TextField: NCTextField as ComponentRenderer,
    Checkbox: NCCheckbox as ComponentRenderer,
    Button: NCButton as ComponentRenderer,
  };
}

export interface NCRendererProps {
  /**
   * The committed tree to render. Must come from a successful stream
   * commit — NCRenderer does NOT tolerate partial trees. Use the
   * useCommittedTree hook to get a tree from useUIStream in atomic mode.
   */
  tree: UITree;
  /** NC runtime handle (staging buffer, durable store, emitIntent). */
  runtime: NCRuntime;
  /** Catalog used to validate the tree before reconciliation. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catalog: Catalog<any, any, any>;
  /** Catalog version threaded through emitted IntentEvents. */
  catalogVersion: NCCatalogVersion;
  /** Optional additional component registry entries. */
  extraRegistry?: ComponentRegistry;
}

/**
 * The NC React wrapper. Mounts @json-ui/react's JSONUIProvider with
 * NC's runtime-shared StagingBuffer and memoryjs-backed durable store,
 * wires the onIntent callback to the runtime's backpressure gate, and
 * runs catalog.validateTree + staging.reconcile on every committed tree.
 *
 * Partial-tree safety (NC Invariant 9) is the caller's responsibility
 * — NCRenderer assumes the `tree` prop only changes on successful
 * stream commits. Use useCommittedTree (Task 9) to get this behavior
 * from useUIStream automatically.
 */
export function NCRenderer({
  tree,
  runtime,
  catalog,
  catalogVersion,
  extraRegistry,
}: NCRendererProps) {
  const registry = React.useMemo(
    () => ({ ...buildDefaultRegistry(), ...extraRegistry }),
    [extraRegistry],
  );

  // Reconcile the staging buffer against the committed tree. Guarded
  // by catalog.validateTree — a tree that fails validation (Zod or
  // field-ID uniqueness) is skipped, leaving the buffer untouched.
  // This is the library-side enforcement of NC Invariants 8 and 9.
  React.useEffect(() => {
    const result = catalog.validateTree(tree);
    if (!result.success) {
      console.warn(
        "[NC] Skipping reconcile: catalog.validateTree failed",
        result.error ?? result.fieldIdError,
      );
      return;
    }
    try {
      const liveIds = collectFieldIds(tree);
      runtime.stagingBuffer.reconcile(liveIds);
    } catch (err) {
      console.warn("[NC] Reconcile threw; buffer untouched:", err);
    }
  }, [tree, catalog, runtime.stagingBuffer]);

  const onIntent = React.useCallback(
    (event: IntentEvent) => {
      // Fire-and-forget into the runtime's backpressure gate. Wrapping
      // in a .catch logs any handler exception — without this, a
      // throwing intent handler surfaces as a UI that appears to do
      // nothing, because `void` swallows the rejected promise. The
      // `intentInFlight` flag in createNCRuntime's `finally` clears
      // regardless, so the runtime recovers either way; this just
      // gives a diagnostic trail.
      runtime.emitIntent(event).catch((err) => {
        console.error("[NC] Intent handler threw:", err);
      });
    },
    [runtime],
  );

  return (
    <JSONUIProvider
      registry={registry}
      store={runtime.durableStore}
      stagingStore={runtime.stagingBuffer}
      onIntent={onIntent}
      catalogVersion={catalogVersion}
    >
      {/*
        Renderer requires `registry` as a prop even though JSONUIProvider
        accepts it — JSONUIProvider's registry prop is currently vestigial
        (it doesn't wire it into the render tree). Pass the same registry
        to both so NC stays forward-compatible if JSONUIProvider starts
        consuming its registry prop in the future.
      */}
      <Renderer tree={tree} registry={registry} />
    </JSONUIProvider>
  );
}
