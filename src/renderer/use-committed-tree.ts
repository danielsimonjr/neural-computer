import { useUIStream, type UseUIStreamOptions } from "@json-ui/react";

/**
 * Thin wrapper around @json-ui/react's useUIStream that pre-selects
 * the atomic commit mode required by NC Invariant 9 (reconcile only
 * on successful tree commits). Consumers can still pass onComplete /
 * onError callbacks but cannot override the commitMode — NC's
 * reconciliation policy is non-negotiable at this layer.
 *
 * The returned `tree` is `null` before any stream completes and then
 * transitions directly from `null` to the fully committed tree when
 * the stream finishes. No partial trees are ever published, so a
 * consumer that reconciles on `useEffect(() => reconcile(tree), [tree])`
 * will only see the validated, complete tree.
 */
export type UseCommittedTreeOptions = Omit<UseUIStreamOptions, "commitMode">;

export function useCommittedTree(options: UseCommittedTreeOptions) {
  return useUIStream({ ...options, commitMode: "atomic" });
}
