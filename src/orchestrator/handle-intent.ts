// SPDX-License-Identifier: Apache-2.0

import { collectFieldIds, type IntentEvent, type UITree } from "@json-ui/core";
import type { AnyCatalog, NCIntentHandler } from "../types";

/**
 * Options for the stub intent handler. The stub is deterministic —
 * it takes a pure function that maps an IntentEvent to the next
 * UITree and calls onTreeCommit with that tree. createLlmIntentHandler
 * shares the same NCIntentHandler signature so the runtime does not
 * need to know which is in use.
 *
 * Isolating the "compute next tree" step as a pure function lets
 * tests drive the loop without a model.
 */
export interface CreateStubIntentHandlerOptions {
  /**
   * Catalog used to validate nextTree output before onTreeCommit.
   * Invalid trees are rejected (the promise rejects) and onTreeCommit
   * is not called — Invariant 9 at the handler boundary.
   */
  catalog: AnyCatalog;
  /**
   * Pure function mapping an IntentEvent to the next UITree. Called
   * once per dispatched intent. The stub does not batch multiple
   * events; each intent produces exactly one tree.
   */
  nextTree: (event: IntentEvent) => UITree;
  /**
   * Callback fired with the committed next tree. The orchestrator
   * loop uses this to drive the React re-render. Returning a promise
   * lets the orchestrator await any downstream effects (e.g., a
   * memoryjs transaction) before the handler resolves.
   */
  onTreeCommit: (tree: UITree) => Promise<void> | void;
}

/**
 * Build a deterministic intent handler suitable for integration
 * testing. createLlmIntentHandler is the production handler and
 * uses the same NCIntentHandler signature.
 */
export function createStubIntentHandler(
  options: CreateStubIntentHandlerOptions,
): NCIntentHandler {
  return async (event: IntentEvent): Promise<void> => {
    const tree = options.nextTree(event);
    const result = options.catalog.validateTree(tree);
    if (!result.success) {
      throw new Error(
        `[NC] Stub handler nextTree failed catalog validation: ${String(
          result.error ?? result.fieldIdError ?? "unknown",
        )}`,
      );
    }
    await options.onTreeCommit(result.data ?? tree);
  };
}

/**
 * Field ids present in both the intent's staging snapshot and the next
 * tree. The LLM acceptance contract (NC_LLM_ACCEPTANCE_CONTRACT) says
 * accepting input means omitting those ids; keeping them is the reject
 * (re-prompt) path. Runtime cannot tell which the model meant — this
 * helper is the enforceable test/orchestrator slice of Risk 1.
 */
export function submittedFieldsStillPresent(
  event: IntentEvent,
  nextTree: UITree,
): string[] {
  const submitted = Object.keys(event.staging_snapshot ?? {});
  if (submitted.length === 0) return [];
  const live = collectFieldIds(nextTree);
  return submitted.filter((id) => live.has(id));
}
