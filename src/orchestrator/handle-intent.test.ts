import { describe, it, expect, vi } from "vitest";
import type { IntentEvent, UITree } from "@json-ui/core";
import {
  createStubIntentHandler,
  submittedFieldsStillPresent,
} from "./handle-intent";
import { ncStarterCatalog } from "../catalog";

describe("createStubIntentHandler", () => {
  it("calls the onTreeCommit callback with a tree derived from the event", async () => {
    const onTreeCommit = vi.fn();
    const handler = createStubIntentHandler({
      catalog: ncStarterCatalog,
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
      timestamp: 0,
    };

    await handler(event);

    expect(onTreeCommit).toHaveBeenCalledTimes(1);
    const committedTree = onTreeCommit.mock.calls[0]![0] as UITree;
    expect(committedTree.root).toBe("r");
    expect(
      (committedTree.elements.r!.props as { content: string }).content,
    ).toBe("got submit_form");
  });

  it("propagates a throwing nextTree so callers see the rejection", async () => {
    // If the real LLM-backed handler throws (e.g., Anthropic SDK
    // rejects, or the catalog validates the response and finds it
    // invalid), the runtime's emitIntent must observe that rejection.
    // NCRenderer.onIntent and NCButton both attach .catch handlers
    // that depend on this propagation — swallowing it here would
    // defeat those diagnostics.
    const onTreeCommit = vi.fn();
    const handler = createStubIntentHandler({
      catalog: ncStarterCatalog,
      nextTree: () => {
        throw new Error("LLM said no");
      },
      onTreeCommit,
    });

    await expect(
      handler({
        action_name: "submit_form",
        action_params: {},
        staging_snapshot: {},
        timestamp: 0,
      }),
    ).rejects.toThrow("LLM said no");
    expect(onTreeCommit).not.toHaveBeenCalled();
  });

  it("is async — caller can await the full handler cycle", async () => {
    let finished = false;
    const handler = createStubIntentHandler({
      catalog: ncStarterCatalog,
      nextTree: () => ({
        root: "r",
        elements: {
          r: { key: "r", type: "Text", props: { content: "" } },
        },
      }),
      onTreeCommit: async () => {
        await Promise.resolve();
        finished = true;
      },
    });
    await handler({
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: {},
      timestamp: 0,
    });
    expect(finished).toBe(true);
  });

  it("rejects an invalid nextTree and does not call onTreeCommit", async () => {
    const onTreeCommit = vi.fn();
    const handler = createStubIntentHandler({
      catalog: ncStarterCatalog,
      nextTree: () => ({
        root: "r",
        elements: {
          r: { key: "r", type: "TextField", props: { label: "no id" } },
        },
      }),
      onTreeCommit,
    });
    await expect(
      handler({
        action_name: "submit_form",
        action_params: {},
        staging_snapshot: {},
        timestamp: 0,
      }),
    ).rejects.toThrow(/catalog validation/);
    expect(onTreeCommit).not.toHaveBeenCalled();
  });

  it("submittedFieldsStillPresent distinguishes accept vs reject trees (NC-051)", () => {
    const event: IntentEvent = {
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: { email: "a@b.c" },
      timestamp: 0,
    };
    const accepted: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Text", props: { content: "thanks" } },
      },
    };
    const rejected: UITree = {
      root: "r",
      elements: {
        r: {
          key: "r",
          type: "TextField",
          props: { id: "email", label: "Email", error: "bad" },
        },
      },
    };
    expect(submittedFieldsStillPresent(event, accepted)).toEqual([]);
    expect(submittedFieldsStillPresent(event, rejected)).toEqual(["email"]);
  });
});
