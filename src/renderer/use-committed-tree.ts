// SPDX-License-Identifier: Apache-2.0

import { useUIStream, type UseUIStreamOptions } from "@json-ui/react";

/**
 * Thin wrapper around @json-ui/react's useUIStream that pre-selects
 * the atomic commit mode required by NC Invariant 9 (reconcile only
 * on successful tree commits). Consumers can still pass onComplete /
 * onError callbacks but cannot override the commitMode.
 *
 * NCApp does not use this hook: it owns a complete UITree in useState
 * and createStubIntentHandler validates each nextTree. Callers who
 * stream LLM tokens into a tree MUST use this hook (or equivalent
 * atomic buffering) before passing a tree to NCRenderer.
 *
 * The tests in use-committed-tree.test.tsx are contract tests against
 * JSON-UI's stream protocol, not NC business logic.
 */
export type UseCommittedTreeOptions = Omit<UseUIStreamOptions, "commitMode">;

export function useCommittedTree(options: UseCommittedTreeOptions) {
  return useUIStream({ ...options, commitMode: "atomic" });
}
