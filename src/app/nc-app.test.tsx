import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { createObservableDataModel, type UITree } from "@json-ui/core";
import { NCApp } from "./nc-app";
import { createNCRuntime } from "../runtime";
import { ncStarterCatalog, NC_CATALOG_VERSION } from "../catalog";
import { createStubIntentHandler } from "../orchestrator";

describe("NCApp", () => {
  it("mounts NCRenderer, wires the intent handler, and drives tree transitions", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });

    const initialTree: UITree = {
      root: "start",
      elements: {
        start: {
          key: "start",
          type: "Container",
          props: {},
          children: ["btn"],
        },
        btn: {
          key: "btn",
          type: "Button",
          props: { label: "Go", action: { name: "submit_form" } },
        },
      },
    };

    const nextTree: UITree = {
      root: "done",
      elements: {
        done: {
          key: "done",
          type: "Text",
          props: { content: "after submit_form" },
        },
      },
    };

    const treeCommits: UITree[] = [];

    render(
      <NCApp
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
        initialTree={initialTree}
        buildIntentHandler={(setTree) =>
          createStubIntentHandler({
            nextTree: () => nextTree,
            onTreeCommit: (tree) => {
              treeCommits.push(tree);
              setTree(tree);
            },
          })
        }
      />,
    );

    // Initial tree renders the Go button.
    expect(screen.getByRole("button", { name: "Go" })).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Go" }));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Intent handler fired exactly once and the tree transitioned.
    expect(treeCommits).toHaveLength(1);
    expect(treeCommits[0]!.root).toBe("done");
    expect(screen.getByText("after submit_form")).toBeDefined();
    runtime.destroy();
  });

  it("swaps the intent handler when buildIntentHandler identity changes", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });

    const tree: UITree = {
      root: "btn",
      elements: {
        btn: {
          key: "btn",
          type: "Button",
          props: { label: "Fire", action: { name: "submit_form" } },
        },
      },
    };

    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});

    const { rerender } = render(
      <NCApp
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
        initialTree={tree}
        buildIntentHandler={() => first}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fire" }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(first).toHaveBeenCalledTimes(1);

    rerender(
      <NCApp
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
        initialTree={tree}
        buildIntentHandler={() => second}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fire" }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(second).toHaveBeenCalledTimes(1);

    runtime.destroy();
  });
});
