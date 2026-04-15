import { describe, it, expect } from "vitest";
import type { Entity, Relation } from "@danielsimonjr/memoryjs";
import { defaultNCProjection } from "./projection";

function makeEntity(
  name: string,
  entityType: string,
  observations: string[] = [],
): Entity {
  return {
    name,
    entityType,
    observations,
    createdAt: "2026-04-15T00:00:00Z",
    lastModified: "2026-04-15T00:00:00Z",
  };
}

describe("defaultNCProjection", () => {
  it("returns an empty shape for an empty graph", () => {
    expect(defaultNCProjection([], [])).toEqual({
      entitiesByType: {},
      entities: {},
      relationCount: 0,
    });
  });

  it("groups entities by entityType", () => {
    const result = defaultNCProjection(
      [
        makeEntity("Alice", "user"),
        makeEntity("Bob", "user"),
        makeEntity("msg1", "message", ["Hello"]),
      ],
      [],
    );
    expect(Object.keys(result.entitiesByType as object).sort()).toEqual([
      "message",
      "user",
    ]);
    const byType = result.entitiesByType as Record<string, unknown[]>;
    expect(Array.isArray(byType.user)).toBe(true);
    expect(byType.user).toHaveLength(2);
    expect(byType.message).toHaveLength(1);
  });

  it("exposes entities by name for O(1) lookup", () => {
    const result = defaultNCProjection(
      [makeEntity("Alice", "user", ["likes coffee"])],
      [],
    );
    const byName = result.entities as Record<string, Record<string, unknown>>;
    expect(byName.Alice).toBeDefined();
    expect(byName.Alice?.entityType).toBe("user");
    expect(byName.Alice?.observations).toEqual(["likes coffee"]);
  });

  it("counts relations", () => {
    const rel: Relation = {
      from: "Alice",
      to: "Bob",
      relationType: "knows",
    };
    const result = defaultNCProjection(
      [makeEntity("Alice", "user"), makeEntity("Bob", "user")],
      [rel, rel],
    );
    expect(result.relationCount).toBe(2);
  });

  it("round-trips as a JSON value", () => {
    const result = defaultNCProjection(
      [makeEntity("Alice", "user", ["fact"])],
      [{ from: "Alice", to: "Bob", relationType: "knows" }],
    );
    const round = JSON.parse(JSON.stringify(result));
    expect(round).toEqual(result);
  });
});
