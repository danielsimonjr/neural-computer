import { describe, it, expect, vi } from "vitest";
import type { IntentEvent, UITree } from "@json-ui/core";
import { createStubIntentHandler } from "./handle-intent";

describe("createStubIntentHandler", () => {
  it("calls the onTreeCommit callback with a tree derived from the event", async () => {
    const onTreeCommit = vi.fn();
    const handler = createStubIntentHandler({
      nextTree: (event: IntentEvent): UITree => ({
        root: "r",
        elements: {
          r: {
            key: "r",
            type: "Text",
            props: { content: `got ${event.action_name}` },
          },
        },
      }),
      onTreeCommit,
    });

    const event: IntentEvent = {
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: { email: "a@b.c" },
      timestamp: Date.now(),
    };

    await handler(event);

    expect(onTreeCommit).toHaveBeenCalledTimes(1);
    const committedTree = onTreeCommit.mock.calls[0]![0] as UITree;
    expect(committedTree.root).toBe("r");
    expect(
      (committedTree.elements.r!.props as { content: string }).content,
    ).toBe("got submit_form");
  });

  it("is async — caller can await the full handler cycle", async () => {
    const handler = createStubIntentHandler({
      nextTree: () => ({
        root: "r",
        elements: {
          r: { key: "r", type: "Text", props: { content: "" } },
        },
      }),
      onTreeCommit: async () => {
        await new Promise((r) => setTimeout(r, 5));
      },
    });
    const before = Date.now();
    await handler({
      action_name: "x",
      action_params: {},
      staging_snapshot: {},
      timestamp: before,
    });
    const elapsed = Date.now() - before;
    expect(elapsed).toBeGreaterThanOrEqual(5);
  });
});
