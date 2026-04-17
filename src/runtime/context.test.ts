import { describe, it, expect, vi } from "vitest";
import { createObservableDataModel, type IntentEvent } from "@json-ui/core";
import { createNCRuntime } from "./context";
import { ncStarterCatalog, NC_CATALOG_VERSION } from "../catalog";

// Uses core's in-memory createObservableDataModel rather than the memoryjs
// adapter because this test verifies the NC runtime wrapper, not memoryjs
// integration. A separate integration test (Task 11) exercises the memoryjs
// adapter end-to-end.

describe("createNCRuntime", () => {
  it("returns a runtime with all required handles", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });

    expect(runtime.stagingBuffer).toBeDefined();
    expect(runtime.durableStore).toBe(durableStore);
    expect(typeof runtime.emitIntent).toBe("function");
    expect(typeof runtime.setIntentHandler).toBe("function");
    expect(typeof runtime.destroy).toBe("function");

    runtime.destroy();
  });

  it("emitIntent forwards events to the currently-bound handler", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
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
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
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
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });

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
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
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

  it("reading the staging snapshot is non-destructive (NC Invariant 4)", async () => {
    // NC Invariant 4: the act of reading a staging snapshot (which the
    // React layer does every render via useStagingField, and which
    // ActionProvider does when building an IntentEvent) MUST NOT mutate
    // or clear the buffer. The only paths that drop staging entries are
    // reconcile (Invariant 9) and explicit delete. Test this by writing
    // a value, reading it through runtime.stagingBuffer.snapshot multiple
    // times plus routing an intent, and verifying the value is still
    // present afterwards.
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    runtime.stagingBuffer.set("email", "a@b.c");
    runtime.stagingBuffer.set("agree", true);

    const before = runtime.stagingBuffer.snapshot();
    expect(before).toEqual({ email: "a@b.c", agree: true });

    // Route an intent — ActionProvider normally reads the snapshot
    // when building the event. We simulate the same by reading it
    // again and handing it to the handler.
    runtime.setIntentHandler(async (event) => {
      expect(event.staging_snapshot).toEqual({ email: "a@b.c", agree: true });
    });
    await runtime.emitIntent({
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: runtime.stagingBuffer.snapshot(),
      timestamp: Date.now(),
    });

    // Read a few more times.
    runtime.stagingBuffer.snapshot();
    runtime.stagingBuffer.snapshot();

    // Buffer still holds the original values.
    expect(runtime.stagingBuffer.snapshot()).toEqual({
      email: "a@b.c",
      agree: true,
    });

    runtime.destroy();
  });

  it("destroy is idempotent", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    runtime.destroy();
    expect(() => runtime.destroy()).not.toThrow();
  });

  it("constructs runtime.observer from the catalog option (Path C wiring)", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({
      durableStore,
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });

    expect(runtime.observer).toBeDefined();
    expect(typeof runtime.observer.render).toBe("function");
    expect(typeof runtime.observer.getLastRender).toBe("function");
    expect(runtime.observer.getLastRender()).toBeNull();

    runtime.destroy();

    // After destroy, observer.render should be a no-op (tested in
    // observer unit tests; here we just verify destroy didn't throw).
  });
});
