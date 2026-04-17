import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  createObservableDataModel,
  type IntentEvent,
  type UITree,
} from "@json-ui/core";
import { createNCRuntime } from "./runtime";
import { ncStarterCatalog, NC_CATALOG_VERSION } from "./catalog";
import { NCRenderer } from "./renderer";

describe("NC Path C end-to-end integration", () => {
  it("type → submit → intent cycle with staging snapshot", async () => {
    const onIntent = vi.fn();
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    runtime.setIntentHandler(async (e) => onIntent(e));

    const tree: UITree = {
      root: "form",
      elements: {
        form: {
          key: "form",
          type: "Container",
          props: {},
          children: ["email", "agree", "submit"],
        },
        email: {
          key: "email",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
        agree: {
          key: "agree",
          type: "Checkbox",
          props: { id: "agree", label: "I agree" },
        },
        submit: {
          key: "submit",
          type: "Button",
          props: { label: "Submit", action: { name: "submit_form" } },
        },
      },
    };

    render(
      <NCRenderer
        tree={tree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // User types an email.
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "alice@example.com" } });

    // User checks the agreement.
    const checkbox = screen.getByLabelText("I agree") as HTMLInputElement;
    fireEvent.click(checkbox);

    // User clicks Submit.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Exactly one intent fired, with the full staging snapshot and
    // the NC catalog version threaded through.
    expect(onIntent).toHaveBeenCalledTimes(1);
    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    expect(event.action_name).toBe("submit_form");
    expect(event.staging_snapshot).toEqual({
      email: "alice@example.com",
      agree: true,
    });
    expect(event.catalog_version).toBe(NC_CATALOG_VERSION);

    // Buffer is NOT cleared on flush (NC Rule 4B).
    expect(runtime.stagingBuffer.snapshot()).toEqual({
      email: "alice@example.com",
      agree: true,
    });

    runtime.destroy();
  });

  it("reconciliation on tree commit preserves matching IDs and drops orphans", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    runtime.setIntentHandler(async () => {});

    const first: UITree = {
      root: "form",
      elements: {
        form: {
          key: "form",
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
    const { rerender } = render(
      <NCRenderer
        tree={first}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // Pre-populate both fields.
    runtime.stagingBuffer.set("email", "a@b.c");
    runtime.stagingBuffer.set("name", "Alice");

    // Re-render with a tree that only contains "email".
    const second: UITree = {
      root: "form",
      elements: {
        form: {
          key: "form",
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
        tree={second}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // Reconciliation preserved "email" and dropped "name".
    expect(runtime.stagingBuffer.get("email")).toBe("a@b.c");
    expect(runtime.stagingBuffer.has("name")).toBe(false);

    runtime.destroy();
  });

  it("NC Invariant 6: action_params and staging_snapshot stay separate on key collision", async () => {
    // A button whose action declares `email: "fixed@example.com"` as a
    // LITERAL param while the user has typed a different value into a
    // `TextField id="email"` field must produce an IntentEvent where
    // BOTH the literal action param AND the user-typed staging value
    // reach the orchestrator unmerged. The library enforces this
    // structurally (ActionProvider builds IntentEvent with separate
    // fields), but NC's integration test should verify the contract
    // end-to-end so a future refactor that merges them is caught.
    const onIntent = vi.fn();
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    runtime.setIntentHandler(async (e) => onIntent(e));

    const tree: UITree = {
      root: "form",
      elements: {
        form: {
          key: "form",
          type: "Container",
          props: {},
          children: ["email", "submit"],
        },
        email: {
          key: "email",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
        submit: {
          key: "submit",
          type: "Button",
          props: {
            label: "Send",
            action: {
              name: "submit_form",
              // Literal param that COLLIDES with the staging field id.
              params: { email: "literal@example.com" },
            },
          },
        },
      },
    };

    render(
      <NCRenderer
        tree={tree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // User types a DIFFERENT value for email.
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user-typed@example.com" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onIntent).toHaveBeenCalledTimes(1);
    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    // The action's literal email wins action_params.
    expect(event.action_params).toEqual({ email: "literal@example.com" });
    // The user's typed email wins staging_snapshot.
    expect(event.staging_snapshot).toEqual({ email: "user-typed@example.com" });
    // Both are preserved, unmerged. The orchestrator decides which to use.

    runtime.destroy();
  });

  it("NC Invariant 11: DynamicValue {path} params resolve against staging at NC layer", async () => {
    // A button whose action declares `to: { path: "email" }` must
    // resolve the DynamicValue against the staging buffer's "email"
    // field (not the data model) because the path is a single segment
    // with no slashes. @json-ui/core's resolveActionWithStaging owns
    // the rule, but NC's integration test should cover the full React
    // flow end-to-end so the wiring from NCButton → ActionProvider →
    // resolveActionWithStaging → IntentEvent stays intact.
    const onIntent = vi.fn();
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    runtime.setIntentHandler(async (e) => onIntent(e));

    const tree: UITree = {
      root: "form",
      elements: {
        form: {
          key: "form",
          type: "Container",
          props: {},
          children: ["email", "send"],
        },
        email: {
          key: "email",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
        send: {
          key: "send",
          type: "Button",
          props: {
            label: "Send welcome",
            action: {
              name: "submit_form",
              // DynamicValue literal — should resolve against staging.
              params: { to: { path: "email" } },
            },
          },
        },
      },
    };

    render(
      <NCRenderer
        tree={tree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "dan@example.com" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send welcome" }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onIntent).toHaveBeenCalledTimes(1);
    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    // { path: "email" } resolved to the staging value "dan@example.com".
    expect(event.action_params).toEqual({ to: "dan@example.com" });
    // Staging snapshot still carries the full buffer state.
    expect(event.staging_snapshot).toEqual({ email: "dan@example.com" });

    runtime.destroy();
  });

  it("backpressure rejects a second intent while the first is in flight", async () => {
    let releaseFirst: () => void = () => {};
    const firstDone = new Promise<void>((r) => {
      releaseFirst = r;
    });
    let calls = 0;
    const onIntent = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        await firstDone;
      }
    });

    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    runtime.setIntentHandler(onIntent);

    const tree: UITree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Button",
          props: { label: "Fire", action: { name: "submit_form" } },
        },
      },
    };

    render(
      <NCRenderer
        tree={tree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // Two rapid clicks — only the first should reach onIntent.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fire" }));
      fireEvent.click(screen.getByRole("button", { name: "Fire" }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onIntent).toHaveBeenCalledTimes(1);

    releaseFirst();
    runtime.destroy();
  });
});
