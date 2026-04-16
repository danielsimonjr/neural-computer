import { describe, it, expect } from "vitest";
import { createStagingBuffer, createObservableDataModel } from "@json-ui/core";
import { createHeadlessContext } from "@json-ui/headless";
import type { UIElement } from "@json-ui/core";
import { ncHeadlessRegistry } from "./nc-headless-components";

function makeCtx(stagingValues: Record<string, unknown> = {}) {
  const staging = createStagingBuffer();
  for (const [k, v] of Object.entries(stagingValues)) staging.set(k, v as never);
  const data = createObservableDataModel({});
  return createHeadlessContext({ staging, data });
}

describe("ncHeadlessRegistry", () => {
  it("exports the 5 expected component types", () => {
    expect(ncHeadlessRegistry.Container).toBeDefined();
    expect(ncHeadlessRegistry.Text).toBeDefined();
    expect(ncHeadlessRegistry.TextField).toBeDefined();
    expect(ncHeadlessRegistry.Checkbox).toBeDefined();
    expect(ncHeadlessRegistry.Button).toBeDefined();
  });

  it("Container passes children through", () => {
    const element: UIElement = {
      key: "root",
      type: "Container",
      props: {},
      children: ["a", "b"],
    };
    const childNodes = [
      { type: "Text", key: "a", props: { content: "a" }, children: [], meta: { visible: true } },
      { type: "Text", key: "b", props: { content: "b" }, children: [], meta: { visible: true } },
    ];
    const node = ncHeadlessRegistry.Container!(element, makeCtx(), childNodes);
    expect(node.type).toBe("Container");
    expect(node.key).toBe("root");
    expect(node.children).toEqual(childNodes);
  });

  it("Text emits content prop", () => {
    const element: UIElement = {
      key: "t", type: "Text", props: { content: "hello" },
    };
    const node = ncHeadlessRegistry.Text!(element, makeCtx(), []);
    expect(node.type).toBe("Text");
    expect((node.props as { content: string }).content).toBe("hello");
  });

  it("TextField includes currentValue when staging has a value", () => {
    const element: UIElement = {
      key: "f", type: "TextField", props: { id: "email", label: "Email" },
    };
    const node = ncHeadlessRegistry.TextField!(
      element,
      makeCtx({ email: "a@b.c" }),
      [],
    );
    const props = node.props as { id: string; currentValue?: string };
    expect(props.id).toBe("email");
    expect(props.currentValue).toBe("a@b.c");
  });

  it("TextField omits currentValue when staging has no value for the id", () => {
    const element: UIElement = {
      key: "f", type: "TextField", props: { id: "untouched", label: "X" },
    };
    const node = ncHeadlessRegistry.TextField!(element, makeCtx(), []);
    const props = node.props as { currentValue?: unknown };
    expect("currentValue" in props).toBe(false);
  });

  it("Checkbox includes currentValue when staging has a boolean", () => {
    const element: UIElement = {
      key: "c", type: "Checkbox", props: { id: "agree", label: "Agree" },
    };
    const node = ncHeadlessRegistry.Checkbox!(
      element,
      makeCtx({ agree: true }),
      [],
    );
    const props = node.props as { currentValue?: boolean };
    expect(props.currentValue).toBe(true);
  });

  it("Button preserves label + action shape verbatim", () => {
    const element: UIElement = {
      key: "b",
      type: "Button",
      props: { label: "Submit", action: { name: "submit_form" } },
    };
    const node = ncHeadlessRegistry.Button!(element, makeCtx(), []);
    expect(node.type).toBe("Button");
    expect((node.props as { label: string }).label).toBe("Submit");
    expect((node.props as { action: { name: string } }).action.name).toBe(
      "submit_form",
    );
  });
});
