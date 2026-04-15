import { describe, it, expect } from "vitest";
import { ncStarterCatalog, NC_CATALOG_VERSION } from "./nc-catalog";

describe("ncStarterCatalog", () => {
  it("has a non-empty version string", () => {
    expect(typeof NC_CATALOG_VERSION).toBe("string");
    expect(NC_CATALOG_VERSION.length).toBeGreaterThan(0);
  });

  it("declares the standard NC input + display components", () => {
    expect(ncStarterCatalog.hasComponent("Container")).toBe(true);
    expect(ncStarterCatalog.hasComponent("Text")).toBe(true);
    expect(ncStarterCatalog.hasComponent("TextField")).toBe(true);
    expect(ncStarterCatalog.hasComponent("Checkbox")).toBe(true);
    expect(ncStarterCatalog.hasComponent("Button")).toBe(true);
  });

  it("declares submit_form and cancel actions", () => {
    expect(ncStarterCatalog.hasAction("submit_form")).toBe(true);
    expect(ncStarterCatalog.hasAction("cancel")).toBe(true);
  });

  it("validates a clean tree with an input component carrying an id prop", () => {
    const tree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Container",
          props: {},
          children: ["email-field"],
        },
        "email-field": {
          key: "email-field",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
      },
    };
    const result = ncStarterCatalog.validateTree(tree);
    expect(result.success).toBe(true);
  });

  it("rejects a TextField tree with a missing id prop (Zod failure)", () => {
    const tree = {
      root: "r",
      elements: {
        r: {
          key: "r",
          type: "TextField",
          // missing id
          props: { label: "Email" },
        },
      },
    };
    const result = ncStarterCatalog.validateTree(tree);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects a tree with two input components sharing the same id (NC Invariant 8)", () => {
    const tree = {
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
          props: { id: "shared", label: "First" },
        },
        b: {
          key: "b",
          type: "TextField",
          props: { id: "shared", label: "Second" },
        },
      },
    };
    const result = ncStarterCatalog.validateTree(tree);
    expect(result.success).toBe(false);
    expect(result.fieldIdError).toBeDefined();
    expect(result.fieldIdError?.fieldId).toBe("shared");
  });
});
