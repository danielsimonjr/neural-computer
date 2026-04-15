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
    const runtime = await createNCRuntime({ durableStore });
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
    const runtime = await createNCRuntime({ durableStore });
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
    const runtime = await createNCRuntime({ durableStore });
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
