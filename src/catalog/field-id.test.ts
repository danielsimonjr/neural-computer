// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { isSafeFieldId } from "./field-id";
import { asNCCatalogVersion, isNCCatalogVersion } from "../types";

describe("isSafeFieldId", () => {
  it("accepts ordinary ids", () => {
    expect(isSafeFieldId("email")).toBe(true);
    expect(isSafeFieldId("user_name")).toBe(true);
  });

  it("rejects empty, reserved, and path-like ids", () => {
    expect(isSafeFieldId("")).toBe(false);
    expect(isSafeFieldId(" email")).toBe(false);
    expect(isSafeFieldId("__proto__")).toBe(false);
    expect(isSafeFieldId("constructor")).toBe(false);
    expect(isSafeFieldId("a/b")).toBe(false);
  });
});

describe("asNCCatalogVersion", () => {
  it("accepts a non-empty version string", () => {
    expect(isNCCatalogVersion("nc-starter-0.3")).toBe(true);
    expect(asNCCatalogVersion("nc-starter-0.3")).toBe("nc-starter-0.3");
  });

  it("rejects empty strings", () => {
    expect(() => asNCCatalogVersion("")).toThrow(/Invalid catalog version/);
  });
});
