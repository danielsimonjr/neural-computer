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
});
