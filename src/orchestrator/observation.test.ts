import { describe, it, expect } from "vitest";
import { generateCatalogPrompt, type IntentEvent } from "@json-ui/core";
import {
  NC_CATALOG_VERSION,
  NC_LLM_ACCEPTANCE_CONTRACT,
  ncStarterCatalog,
} from "../catalog";
import { composeNcObservation } from "./observation";

function event(partial: Partial<IntentEvent> = {}): IntentEvent {
  return {
    action_name: "submit_form",
    action_params: {},
    staging_snapshot: { email: "a@b.c" },
    catalog_version: NC_CATALOG_VERSION,
    timestamp: 1,
    ...partial,
  };
}

describe("composeNcObservation", () => {
  it("includes catalog prompt, acceptance contract, intent, durable, and observer", () => {
    const { system, userJson, truncated } = composeNcObservation({
      event: event(),
      catalogPrompt: generateCatalogPrompt(ncStarterCatalog),
      acceptanceContract: NC_LLM_ACCEPTANCE_CONTRACT,
      catalogVersion: NC_CATALOG_VERSION,
      durableSnapshot: { n: 1 },
      observerJson: '{"type":"Text"}',
      observerStale: false,
    });
    expect(truncated).toBe(false);
    expect(system).toContain("nc-starter");
    expect(system).toContain(NC_LLM_ACCEPTANCE_CONTRACT.slice(0, 40));
    expect(system).toContain(NC_CATALOG_VERSION);
    const user = JSON.parse(userJson) as Record<string, unknown>;
    expect(user.intent).toMatchObject({
      action_name: "submit_form",
      staging_snapshot: { email: "a@b.c" },
    });
    expect(user.durable).toEqual({ n: 1 });
    expect(user.observer).toBe('{"type":"Text"}');
    expect(user.submitted_field_ids).toEqual(["email"]);
    expect(user.observer_stale).toBe(false);
  });

  it("drops observer first when over budget, then durable", () => {
    const huge = "x".repeat(8000);
    const { userJson, truncated } = composeNcObservation({
      event: event(),
      catalogPrompt: "p",
      acceptanceContract: "c",
      catalogVersion: "v",
      durableSnapshot: { blob: huge },
      observerJson: huge,
      observerStale: true,
      maxBytes: 2000,
    });
    expect(truncated).toBe(true);
    const user = JSON.parse(userJson) as Record<string, unknown>;
    expect(user.observer).toBeNull();
    expect(user.intent).toBeDefined();
    expect(
      (user.intent as { staging_snapshot: unknown }).staging_snapshot,
    ).toEqual({ email: "a@b.c" });
    expect(user.durable).toEqual({ truncated: true });
  });

  it("throws when even the truncated payload exceeds the budget", () => {
    expect(() =>
      composeNcObservation({
        event: event({
          staging_snapshot: { blob: "y".repeat(500) },
        }),
        catalogPrompt: "p",
        acceptanceContract: "c",
        catalogVersion: "v",
        durableSnapshot: {},
        observerJson: null,
        observerStale: false,
        maxBytes: 80,
      }),
    ).toThrow(/exceeds 80 bytes/);
  });
});
