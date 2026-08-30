import { describe, it, expect } from "vitest";
import { createObservableDataModel } from "@json-ui/core";
import { readOnlyDurableStore } from "./read-only-store";

describe("readOnlyDurableStore", () => {
  it("forwards reads and throws on writes", () => {
    const inner = createObservableDataModel({ n: 1 });
    const store = readOnlyDurableStore(inner);
    expect(store.get("n")).toBe(1);
    expect(store.snapshot()).toEqual({ n: 1 });
    expect(() => store.set("n", 2)).toThrow(/intent handler/);
    expect(() => store.delete("n")).toThrow(/intent handler/);
    expect(() => store.write?.("n", 3)).toThrow(/intent handler/);
    expect(inner.get("n")).toBe(1);
  });
});
