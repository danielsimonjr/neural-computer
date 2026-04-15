import { describe, it, expect, vi } from "vitest";
import { createObservableDataModel, type IntentEvent } from "@json-ui/core";
import { createNCRuntime } from "./context";

// Uses core's in-memory createObservableDataModel rather than the memoryjs
// adapter because this test verifies the NC runtime wrapper, not memoryjs
// integration. A separate integration test (Task 11) exercises the memoryjs
// adapter end-to-end.

describe("createNCRuntime", () => {
  it("returns a runtime with all required handles", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });

    expect(runtime.stagingBuffer).toBeDefined();
    expect(runtime.durableStore).toBe(durableStore);
    expect(typeof runtime.emitIntent).toBe("function");
    expect(typeof runtime.setIntentHandler).toBe("function");
    expect(typeof runtime.destroy).toBe("function");

    runtime.destroy();
  });

  it("emitIntent forwards events to the currently-bound handler", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });
    const handler = vi.fn(async () => {});
    runtime.setIntentHandler(handler);

    const event: IntentEvent = {
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: { email: "a@b.c" },
      timestamp: Date.now(),
    };

    await runtime.emitIntent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);

    runtime.destroy();
  });

  it("warns (does not throw) when emitIntent is called before setIntentHandler", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const event: IntentEvent = {
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: {},
      timestamp: Date.now(),
    };

    // No handler set yet — should warn and return, not throw.
    await expect(runtime.emitIntent(event)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("setIntentHandler"),
    );

    warnSpy.mockRestore();
    runtime.destroy();
  });

  it("rejects new intents while one is in flight (NC Invariant 10)", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });

    // Hold the handler on a deferred promise so we can interleave calls.
    let resolveFirst: () => void = () => {};
    const firstDone = new Promise<void>((r) => {
      resolveFirst = r;
    });
    let firstCallCount = 0;
    const handler = vi.fn(async () => {
      firstCallCount++;
      if (firstCallCount === 1) {
        await firstDone;
      }
    });
    runtime.setIntentHandler(handler);

    const event: IntentEvent = {
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: {},
      timestamp: Date.now(),
    };

    // Fire the first intent — it parks on the deferred.
    const firstPromise = runtime.emitIntent(event);

    // Fire the second intent — should be rejected synchronously
    // (returns without calling the handler again).
    await runtime.emitIntent(event);

    expect(handler).toHaveBeenCalledTimes(1);

    // Release the first.
    resolveFirst();
    await firstPromise;

    runtime.destroy();
  });

  it("setIntentHandler replaces the previously-bound handler", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    runtime.setIntentHandler(first);
    runtime.setIntentHandler(second);

    const event: IntentEvent = {
      action_name: "x",
      action_params: {},
      staging_snapshot: {},
      timestamp: Date.now(),
    };
    await runtime.emitIntent(event);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    runtime.destroy();
  });

  it("destroy is idempotent", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });
    runtime.destroy();
    expect(() => runtime.destroy()).not.toThrow();
  });
});
