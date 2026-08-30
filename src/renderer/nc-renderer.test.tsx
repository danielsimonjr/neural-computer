import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  createObservableDataModel,
  type UITree,
  type IntentEvent,
} from "@json-ui/core";
import { NCRenderer } from "./nc-renderer";
import { createNCRuntime } from "../runtime";
import { ncStarterCatalog, NC_CATALOG_VERSION } from "../catalog";

// Build an NC runtime with the given intent observer already wired via
// setIntentHandler, so tests can assert onIntent reception without
// repeating the two-step construction pattern in every test body.
async function makeRuntime(onIntent: (event: IntentEvent) => void) {
  const durableStore = createObservableDataModel({});
  const runtime = await createNCRuntime({
    durableStore,
    catalog: ncStarterCatalog,
    catalogVersion: NC_CATALOG_VERSION,
  });
  runtime.setIntentHandler(async (event) => onIntent(event));
  return runtime;
}

describe("NCRenderer", () => {
  it("renders a simple Text tree from the NC starter catalog", async () => {
    const runtime = await makeRuntime(() => {});
    render(
      <NCRenderer
        tree={{
          root: "r",
          elements: {
            r: { key: "r", type: "Text", props: { content: "hello" } },
          },
        }}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );
    expect(screen.getByText("hello")).toBeDefined();
    runtime.destroy();
  });

  it("reconciles the staging buffer on tree commit — drops orphaned fields", async () => {
    const initialTree: UITree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Container",
          props: {},
          children: ["a", "b"],
        },
        a: {
          key: "a",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
        b: {
          key: "b",
          type: "TextField",
          props: { id: "name", label: "Name" },
        },
      },
    };
    const runtime = await makeRuntime(() => {});
    runtime.stagingBuffer.set("email", "a@b.c");
    runtime.stagingBuffer.set("name", "Alice");
    runtime.stagingBuffer.set("orphan", "drop me");

    const { rerender } = render(
      <NCRenderer
        tree={initialTree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // orphan not in tree → dropped after reconcile runs on commit.
    expect(runtime.stagingBuffer.has("email")).toBe(true);
    expect(runtime.stagingBuffer.has("name")).toBe(true);
    expect(runtime.stagingBuffer.has("orphan")).toBe(false);

    // Now commit a new tree that drops "name" — reconcile should drop
    // it from staging, preserving "email".
    const nextTree: UITree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Container",
          props: {},
          children: ["a"],
        },
        a: {
          key: "a",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
      },
    };
    rerender(
      <NCRenderer
        tree={nextTree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    expect(runtime.stagingBuffer.has("email")).toBe(true);
    expect(runtime.stagingBuffer.has("name")).toBe(false);
    runtime.destroy();
  });

  it("fires onIntent when a Button action is clicked with the full staging snapshot", async () => {
    const tree: UITree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Container",
          props: {},
          children: ["input", "btn"],
        },
        input: {
          key: "input",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
        btn: {
          key: "btn",
          type: "Button",
          props: { label: "Submit", action: { name: "submit_form" } },
        },
      },
    };
    const onIntent = vi.fn();
    const runtime = await makeRuntime(onIntent);
    runtime.stagingBuffer.set("email", "alice@example.com");

    render(
      <NCRenderer
        tree={tree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onIntent).toHaveBeenCalledTimes(1);
    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    expect(event.action_name).toBe("submit_form");
    expect(event.staging_snapshot).toEqual({ email: "alice@example.com" });
    expect(event.catalog_version).toBe(NC_CATALOG_VERSION);
    runtime.destroy();
  });

  it("NC Invariant 3: reconcile preserves a field across prop changes on the same id", async () => {
    // Rule 3 in the NC spec: the buffer is keyed on the element's
    // `id` prop. If the LLM re-emits the SAME field id with different
    // OTHER props (e.g. adding an `error` prop to display validation
    // feedback), the user's typed value must stay in the buffer. This
    // is the reject-with-validation-error path the spec calls out as
    // the most important preservation case.
    const initialTree: UITree = {
      root: "r",
      elements: {
        r: {
          key: "r",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
      },
    };
    const runtime = await makeRuntime(() => {});
    const { rerender } = render(
      <NCRenderer
        tree={initialTree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // User types a value.
    runtime.stagingBuffer.set("email", "dan@example.com");

    // LLM re-emits the SAME field with an error prop added.
    const treeWithError: UITree = {
      root: "r",
      elements: {
        r: {
          key: "r",
          type: "TextField",
          props: {
            id: "email",
            label: "Email",
            error: "Please enter a valid email",
          },
        },
      },
    };
    rerender(
      <NCRenderer
        tree={treeWithError}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // The user's typed value survived the reconcile pass because the
    // `id` is unchanged — only props around it changed.
    expect(runtime.stagingBuffer.get("email")).toBe("dan@example.com");
    runtime.destroy();
  });

  it("reconciles over the Zod-validated tree, not the raw one (strip regression)", async () => {
    // Zod v4 object schemas strip unknown keys by default. If NCRenderer
    // walked `tree.props` instead of the validated `result.data.props`,
    // a Container element carrying a stray `id: "phantom"` prop would
    // pass validateTree (the key is stripped from result.data) while
    // collectFieldIds(rawTree) would still pick it up and mark "phantom"
    // as a live staging field — keeping an orphan entry alive forever.
    //
    // This test sets a staging entry under "phantom", renders a tree
    // whose Container carries that stray id, and asserts the reconcile
    // pass DROPS "phantom" (because result.data has no such id after
    // Zod strip). If NCRenderer regresses to reconciling over the raw
    // tree, this test fails — the phantom entry would survive.
    const runtime = await makeRuntime(() => {});
    runtime.stagingBuffer.set("email", "a@b.c");
    runtime.stagingBuffer.set("phantom", "should be dropped");

    // Container's catalog schema has no `id` field. Zod strips it.
    // Cast through unknown so the stray prop compiles under the strict
    // element-props types.
    const treeWithStrayId = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Container",
          props: { id: "phantom" },
          children: ["a"],
        },
        a: {
          key: "a",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
      },
    } as unknown as UITree;

    render(
      <NCRenderer
        tree={treeWithStrayId}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    expect(runtime.stagingBuffer.has("email")).toBe(true);
    expect(runtime.stagingBuffer.has("phantom")).toBe(false);
    runtime.destroy();
  });

  it("populates runtime.observer.getLastRender() after a React commit (Invariant 12)", async () => {
    const runtime = await makeRuntime(() => {});
    render(
      <NCRenderer
        tree={{
          root: "r",
          elements: {
            r: { key: "r", type: "Text", props: { content: "hello" } },
          },
        }}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );
    const normalized = runtime.observer.getLastRender();
    expect(normalized).not.toBeNull();
    expect(normalized!.key).toBe("r");
    expect(normalized!.type).toBe("Text");
    expect(runtime.observer.getLastRenderPassId()).toBe(1);
    runtime.destroy();
  });

  it("does NOT update observer when tree fails catalog validation (Invariant 9 extended)", async () => {
    const runtime = await makeRuntime(() => {});

    // Seed the observer with a valid tree.
    const goodTree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Text", props: { content: "hello" } },
      },
    };
    const { rerender } = render(
      <NCRenderer
        tree={goodTree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );
    const goodCache = runtime.observer.getLastRender();
    const goodPassId = runtime.observer.getLastRenderPassId();
    expect(goodCache).not.toBeNull();

    // Render a tree with duplicate field IDs — validateTree fails.
    const badTree: UITree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Container",
          props: {},
          children: ["a", "b"],
        },
        a: { key: "a", type: "TextField", props: { id: "dup", label: "A" } },
        b: { key: "b", type: "TextField", props: { id: "dup", label: "B" } },
      },
    };
    rerender(
      <NCRenderer
        tree={badTree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // Cache and passId unchanged.
    expect(runtime.observer.getLastRender()).toBe(goodCache);
    expect(runtime.observer.getLastRenderPassId()).toBe(goodPassId);
    runtime.destroy();
  });

  it("skips reconcile when the tree fails catalog validation (NC Invariant 9 + 8)", async () => {
    const initialTree: UITree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Container",
          props: {},
          children: ["a"],
        },
        a: { key: "a", type: "TextField", props: { id: "email", label: "E" } },
      },
    };
    const runtime = await makeRuntime(() => {});
    runtime.stagingBuffer.set("email", "keep-me");

    const { rerender } = render(
      <NCRenderer
        tree={initialTree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // Now pass a tree with a duplicate field id — validateTree should
    // return success: false, NCRenderer should NOT reconcile.
    const badTree: UITree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Container",
          props: {},
          children: ["a", "b"],
        },
        a: {
          key: "a",
          type: "TextField",
          props: { id: "shared", label: "A" },
        },
        b: {
          key: "b",
          type: "TextField",
          props: { id: "shared", label: "B" },
        },
      },
    };
    rerender(
      <NCRenderer
        tree={badTree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // The original "email" staging value is preserved because reconcile
    // was skipped on the invalid tree.
    expect(runtime.stagingBuffer.get("email")).toBe("keep-me");
    expect(screen.getByLabelText("E")).toBeDefined();
    expect(screen.queryByLabelText("A")).toBeNull();
    expect(screen.queryByLabelText("B")).toBeNull();
    runtime.destroy();
  });

  it("does not paint an invalid tree (Invariant 8 at the React boundary)", async () => {
    const runtime = await makeRuntime(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <NCRenderer
        tree={{
          root: "root",
          elements: {
            root: {
              key: "root",
              type: "Container",
              props: {},
              children: ["a", "b"],
            },
            a: {
              key: "a",
              type: "TextField",
              props: { id: "dup", label: "A" },
            },
            b: {
              key: "b",
              type: "TextField",
              props: { id: "dup", label: "B" },
            },
          },
        }}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );
    expect(screen.queryByLabelText("A")).toBeNull();
    expect(screen.queryByLabelText("B")).toBeNull();
    warn.mockRestore();
    runtime.destroy();
  });

  it("rejects same field id with a different component type (NC-003)", async () => {
    const runtime = await makeRuntime(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(
      <NCRenderer
        tree={{
          root: "r",
          elements: {
            r: {
              key: "r",
              type: "TextField",
              props: { id: "email", label: "Email" },
            },
          },
        }}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );
    runtime.stagingBuffer.set("email", "keep");
    rerender(
      <NCRenderer
        tree={{
          root: "r",
          elements: {
            r: {
              key: "r",
              type: "Checkbox",
              props: { id: "email", label: "Email" },
            },
          },
        }}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );
    expect(runtime.stagingBuffer.get("email")).toBe("keep");
    expect(screen.getByLabelText("Email")).toBeDefined();
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.type).toBe("text");
    warn.mockRestore();
    runtime.destroy();
  });

  it("observer currentValue appears after a tree re-commit with staging (NC-028)", async () => {
    const runtime = await makeRuntime(() => {});
    const tree: UITree = {
      root: "f",
      elements: {
        f: {
          key: "f",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
      },
    };
    const { rerender } = render(
      <NCRenderer
        tree={tree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );
    runtime.stagingBuffer.set("email", "a@b.c");
    const next: UITree = {
      root: "f",
      elements: {
        f: {
          key: "f",
          type: "TextField",
          props: { id: "email", label: "Email", error: "ok" },
        },
      },
    };
    rerender(
      <NCRenderer
        tree={next}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );
    const json = runtime.observer.serialize("json-string");
    expect(json).toContain("a@b.c");
    expect(json).toContain("currentValue");
    runtime.destroy();
  });

  it("throws when catalog is not the runtime catalog (NC-009)", async () => {
    const runtime = await makeRuntime(() => {});
    const { createCatalog } = await import("@json-ui/core");
    const other = createCatalog({
      name: "other",
      components: {},
      actions: {},
    });
    expect(() =>
      render(
        <NCRenderer
          tree={{
            root: "r",
            elements: {
              r: { key: "r", type: "Text", props: { content: "x" } },
            },
          }}
          runtime={runtime}
          catalog={other}
          catalogVersion={NC_CATALOG_VERSION}
        />,
      ),
    ).toThrow(/same reference/);
    runtime.destroy();
  });

  it("StrictMode does not double-advance observer passId (NC-022)", async () => {
    const runtime = await makeRuntime(() => {});
    render(
      <React.StrictMode>
        <NCRenderer
          tree={{
            root: "r",
            elements: {
              r: { key: "r", type: "Text", props: { content: "hello" } },
            },
          }}
          runtime={runtime}
          catalog={ncStarterCatalog}
          catalogVersion={NC_CATALOG_VERSION}
        />
      </React.StrictMode>,
    );
    expect(runtime.observer.getLastRenderPassId()).toBe(1);
    runtime.destroy();
  });

  it("restores focus to the same field id after a re-commit (NC-053)", async () => {
    const runtime = await makeRuntime(() => {});
    const tree: UITree = {
      root: "f",
      elements: {
        f: {
          key: "f",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
      },
    };
    const { rerender } = render(
      <NCRenderer
        tree={tree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    act(() => {
      input.focus();
    });
    expect(document.activeElement).toBe(input);
    const next: UITree = {
      root: "f",
      elements: {
        f: {
          key: "f",
          type: "TextField",
          props: { id: "email", label: "Email", error: "required" },
        },
      },
    };
    rerender(
      <NCRenderer
        tree={next}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );
    const after = screen.getByLabelText("Email") as HTMLInputElement;
    expect(document.activeElement).toBe(after);
    runtime.destroy();
  });

  it("ignores extraRegistry overrides of built-in Button", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runtime = await makeRuntime(() => {});
    const FakeButton = () => <button type="button">hijacked</button>;
    render(
      <NCRenderer
        tree={{
          root: "r",
          elements: {
            r: {
              key: "r",
              type: "Button",
              props: { label: "Go", action: { name: "submit_form" } },
            },
          },
        }}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
        extraRegistry={{ Button: FakeButton }}
      />,
    );
    expect(screen.getByRole("button").textContent).toBe("Go");
    expect(warn.mock.calls.some((c) => String(c[0]).includes("Button"))).toBe(
      true,
    );
    warn.mockRestore();
    runtime.destroy();
  });
});
