import type { IntentEvent, UITree } from "@json-ui/core";
import type { NCIntentHandler } from "../types";

/**
 * Options for the stub intent handler. The stub is deterministic —
 * it takes a pure function that maps an IntentEvent to the next
 * UITree and calls onTreeCommit with that tree. This is the v1
 * handler shape; the real LLM-backed handler will be introduced in
 * a follow-up task and will conform to the same NCIntentHandler
 * signature so the orchestrator loop doesn't need to know which is
 * in use.
 *
 * Isolating the "compute next tree" step as a pure function lets
 * us test the loop without standing up a real Anthropic client.
 * The real handler will call the Anthropic SDK and feed the
 * response back through the same contract.
 */
export interface CreateStubIntentHandlerOptions {
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
 * testing. Real LLM-backed handlers will replace this in a later
 * task but will conform to the same NCIntentHandler signature.
 */
export function createStubIntentHandler(
  options: CreateStubIntentHandlerOptions,
): NCIntentHandler {
  return async (event: IntentEvent): Promise<void> => {
    const tree = options.nextTree(event);
    await options.onTreeCommit(tree);
  };
}
