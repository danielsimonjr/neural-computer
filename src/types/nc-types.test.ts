import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  IntentEvent,
  StagingBuffer,
  ObservableDataModel,
} from "@json-ui/core";
import type {
  NCIntentHandler,
  NCRuntime,
  NCCatalogVersion,
  NCObserver,
} from "./nc-types";

describe("NC core types", () => {
  it("NCIntentHandler is an async function taking IntentEvent", () => {
    expectTypeOf<NCIntentHandler>().toEqualTypeOf<
      (event: IntentEvent) => Promise<void>
    >();
  });

  it("NCRuntime exposes stagingBuffer, durableStore, emitIntent, setIntentHandler, destroy", () => {
    expectTypeOf<NCRuntime>()
      .toHaveProperty("stagingBuffer")
      .toEqualTypeOf<StagingBuffer>();
    expectTypeOf<NCRuntime>()
      .toHaveProperty("durableStore")
      .toEqualTypeOf<ObservableDataModel>();
    expectTypeOf<NCRuntime>()
      .toHaveProperty("emitIntent")
      .toEqualTypeOf<(event: IntentEvent) => Promise<void>>();
    expectTypeOf<NCRuntime>()
      .toHaveProperty("setIntentHandler")
      .toEqualTypeOf<(handler: NCIntentHandler) => void>();
    expectTypeOf<NCRuntime>()
      .toHaveProperty("destroy")
      .toEqualTypeOf<() => void>();
  });

  it("NCCatalogVersion is a string brand", () => {
    const v: NCCatalogVersion = "nc-starter-0.1" as NCCatalogVersion;
    expect(typeof v).toBe("string");
  });

  it("exports NCObserver type with required methods", () => {
    // This test is structural — it passes at compile time if the type
    // exists with the right methods. A runtime stub verifies method names.
    const stub: NCObserver = {
      render: () => {},
      getLastRender: () => null,
      getLastRenderPassId: () => 0,
      getConsecutiveFailures: () => 0,
      serialize: () => null,
      destroy: () => {},
    };
    expect(stub.render).toBeDefined();
    expect(stub.getLastRender()).toBeNull();
    expect(stub.getLastRenderPassId()).toBe(0);
    expect(stub.getConsecutiveFailures()).toBe(0);
    expect(stub.serialize("json-string")).toBeNull();
  });
});
