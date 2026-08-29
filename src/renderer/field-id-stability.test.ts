// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import type { UITree } from "@json-ui/core";
import {
  collectFieldIdTypes,
  detectFieldIdTypeChanges,
  commitFieldIdTypes,
} from "./field-id-stability";

const textField = (id: string): UITree => ({
  root: "r",
  elements: {
    r: { key: "r", type: "TextField", props: { id, label: "E" } },
  },
});

const checkbox = (id: string): UITree => ({
  root: "r",
  elements: {
    r: { key: "r", type: "Checkbox", props: { id, label: "E" } },
  },
});

describe("field id type stability", () => {
  it("detects a type change for a reused id", () => {
    const history = new Map<string, string>();
    commitFieldIdTypes(history, collectFieldIdTypes(textField("email")));
    const err = detectFieldIdTypeChanges(
      history,
      collectFieldIdTypes(checkbox("email")),
    );
    expect(err).not.toBeNull();
    expect(err?.fieldId).toBe("email");
    expect(err?.previousType).toBe("TextField");
    expect(err?.nextType).toBe("Checkbox");
  });

  it("allows the same id to keep the same type", () => {
    const history = new Map<string, string>();
    commitFieldIdTypes(history, collectFieldIdTypes(textField("email")));
    expect(
      detectFieldIdTypeChanges(
        history,
        collectFieldIdTypes(textField("email")),
      ),
    ).toBeNull();
  });
});
