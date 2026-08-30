import { describe, it, expect } from "vitest";
import { isSafeDurablePath } from "./durable-path";

describe("isSafeDurablePath", () => {
  it("accepts simple and slashed paths", () => {
    expect(isSafeDurablePath("note")).toBe(true);
    expect(isSafeDurablePath("/user/name")).toBe(true);
  });

  it("rejects empty, reserved, and oversized paths", () => {
    expect(isSafeDurablePath("")).toBe(false);
    expect(isSafeDurablePath("/")).toBe(false);
    expect(isSafeDurablePath("__proto__/x")).toBe(false);
    expect(isSafeDurablePath("constructor")).toBe(false);
    expect(isSafeDurablePath("a/prototype/b")).toBe(false);
    expect(isSafeDurablePath("x".repeat(257))).toBe(false);
    expect(isSafeDurablePath(Array(17).fill("a").join("/"))).toBe(false);
  });
});
