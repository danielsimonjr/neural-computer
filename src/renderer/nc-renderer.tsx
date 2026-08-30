// SPDX-License-Identifier: Apache-2.0

"use client";

import React from "react";
import {
  JSONUIProvider,
  Renderer,
  type ComponentRegistry,
} from "@json-ui/react";
import { collectFieldIds, type IntentEvent, type UITree } from "@json-ui/core";
import {
  NCContainer,
  NCText,
  NCTextField,
  NCCheckbox,
  NCSelect,
  NCButton,
} from "./input-components";
import type { AnyCatalog, NCRuntime, NCCatalogVersion } from "../types";
import { NCErrorBoundary } from "./error-boundary";
import {
  FocusFieldContext,
  IntentFlightContext,
} from "./intent-flight-context";
import {
  collectFieldIdTypes,
  commitFieldIdTypes,
  detectFieldIdTypeChanges,
} from "./field-id-stability";
import { readOnlyDurableStore } from "./read-only-store";

function escapeFieldIdSelector(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/[^A-Za-z0-9_-]/g, (ch) => `\\${ch}`);
}

const BUILTIN_REGISTRY_KEYS = [
  "Container",
  "Text",
  "TextField",
  "Checkbox",
  "Select",
  "Button",
] as const;

function buildDefaultRegistry(): ComponentRegistry {
  return {
    Container: NCContainer,
    Text: NCText,
    TextField: NCTextField,
    Checkbox: NCCheckbox,
    Select: NCSelect,
    Button: NCButton,
  };
}

const lastShadowedByRuntime = new WeakMap<NCRuntime, UITree>();

function mergeRegistry(extraRegistry?: ComponentRegistry): ComponentRegistry {
  if (extraRegistry) {
    for (const key of BUILTIN_REGISTRY_KEYS) {
      if (Object.prototype.hasOwnProperty.call(extraRegistry, key)) {
        console.warn(
          `[NC] extraRegistry attempted to override built-in "${key}"; ignored so action.params cannot be dropped.`,
        );
      }
    }
  }
  return { ...(extraRegistry ?? {}), ...buildDefaultRegistry() };
}

export interface NCRendererProps {
  /**
   * The committed tree to render. Must come from a successful stream
   * commit — NCRenderer does NOT tolerate partial trees. Use the
   * useCommittedTree hook to get a tree from useUIStream in atomic mode.
   * Invalid trees (Zod, duplicate ids, field-id type changes) are not
   * passed to JSON-UI; the last good validated tree stays on screen.
   */
  tree: UITree;
  /** NC runtime handle (staging buffer, durable store, emitIntent). */
  runtime: NCRuntime;
  /**
   * Catalog used to validate the tree before reconciliation. Must be
   * the same reference as `runtime.catalog`.
   */
  catalog: AnyCatalog;
  /**
   * Catalog version threaded through emitted IntentEvents. Must equal
   * `runtime.catalogVersion`.
   */
  catalogVersion: NCCatalogVersion;
  /**
   * Additional component registry entries. Built-in names (Container,
   * Text, TextField, Checkbox, Select, Button) cannot be overridden.
   */
  extraRegistry?: ComponentRegistry;
  /** Called when a tree is rejected (validation or field-id type change). */
  onValidationError?: (error: unknown) => void;
  /** Called when NCErrorBoundary catches a render throw. */
  onRenderError?: (error: Error) => void;
}

/**
 * The NC React wrapper. Validates the tree *during render* so invalid
 * trees never reach JSON-UI's Renderer (Invariant 8). Reconcile +
 * observer.render run in useLayoutEffect against the same Zod-stripped
 * tree the Renderer receives (Invariant 12).
 *
 * Observer render is a second full tree walk and is not free; it is
 * skipped when the incoming `tree` reference was already shadowed
 * (React Strict Mode double-invokes layout effects).
 */
export function NCRenderer({
  tree,
  runtime,
  catalog,
  catalogVersion,
  extraRegistry,
  onValidationError,
  onRenderError,
}: NCRendererProps) {
  if (catalog !== runtime.catalog) {
    throw new Error(
      "[NC] NCRenderer `catalog` must be the same reference as runtime.catalog",
    );
  }
  if (catalogVersion !== runtime.catalogVersion) {
    throw new Error(
      "[NC] NCRenderer `catalogVersion` must equal runtime.catalogVersion",
    );
  }
  const activeCatalog = runtime.catalog;
  const activeVersion = runtime.catalogVersion;

  const registry = React.useMemo(
    () => mergeRegistry(extraRegistry),
    [extraRegistry],
  );
  const reactStore = React.useMemo(
    () => readOnlyDurableStore(runtime.durableStore),
    [runtime],
  );

  const lastGoodRef = React.useRef<UITree | null>(null);
  const typeHistoryRef = React.useRef<Map<string, string>>(new Map());
  const focusedIdRef = React.useRef<string | null>(null);
  const pendingValidationError = React.useRef<unknown>(null);

  const renderTree = React.useMemo((): UITree | null => {
    const result = activeCatalog.validateTree(tree);
    if (!result.success) {
      pendingValidationError.current = result.error ?? result.fieldIdError;
      return lastGoodRef.current;
    }
    const data = result.data ?? tree;
    const nextTypes = collectFieldIdTypes(data);
    const typeErr = detectFieldIdTypeChanges(typeHistoryRef.current, nextTypes);
    if (typeErr) {
      pendingValidationError.current = typeErr;
      return lastGoodRef.current;
    }
    pendingValidationError.current = null;
    lastGoodRef.current = data;
    commitFieldIdTypes(typeHistoryRef.current, nextTypes);
    return data;
  }, [tree, activeCatalog]);

  const inFlight = React.useSyncExternalStore(
    runtime.subscribeIntentFlight,
    runtime.isIntentInFlight,
    runtime.isIntentInFlight,
  );

  const focusApi = React.useMemo(
    () => ({
      setFocusedId: (id: string | null) => {
        focusedIdRef.current = id;
      },
    }),
    [],
  );

  React.useLayoutEffect(() => {
    if (pendingValidationError.current != null) {
      console.warn(
        "[NC] Skipping reconcile: tree rejected",
        pendingValidationError.current,
      );
      onValidationError?.(pendingValidationError.current);
      return;
    }
    if (renderTree === null) return;
    if (lastShadowedByRuntime.get(runtime) === tree) return;
    lastShadowedByRuntime.set(runtime, tree);
    const liveIds = collectFieldIds(renderTree);
    try {
      runtime.stagingBuffer.reconcile(liveIds);
    } catch (err) {
      console.warn("[NC] Reconcile threw:", err);
      return;
    }
    runtime.observer.render(renderTree);
    const focusId = focusedIdRef.current;
    if (focusId && liveIds.has(focusId)) {
      const escaped = escapeFieldIdSelector(focusId);
      const node = document.querySelector(`[data-field-id="${escaped}"]`);
      if (node instanceof HTMLElement) node.focus();
    }
  }, [tree, renderTree, runtime, onValidationError]);

  const onIntent = React.useCallback(
    (event: IntentEvent) => {
      runtime.emitIntent(event).catch((err) => {
        console.error("[NC] Intent handler threw:", err);
      });
    },
    [runtime],
  );

  return (
    <NCErrorBoundary onError={onRenderError}>
      <IntentFlightContext.Provider value={inFlight}>
        <FocusFieldContext.Provider value={focusApi}>
          <JSONUIProvider
            registry={registry}
            store={reactStore}
            stagingStore={runtime.stagingBuffer}
            onIntent={onIntent}
            catalogVersion={activeVersion}
          >
            <form
              data-nc-form=""
              aria-busy={inFlight || undefined}
              onSubmit={(e) => {
                e.preventDefault();
              }}
              noValidate
            >
              {renderTree ? <Renderer tree={renderTree} /> : null}
            </form>
          </JSONUIProvider>
        </FocusFieldContext.Provider>
      </IntentFlightContext.Provider>
    </NCErrorBoundary>
  );
}
