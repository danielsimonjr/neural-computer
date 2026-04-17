import { describe, it, expect, vi } from "vitest";
import {
  createStagingBuffer,
  createObservableDataModel,
  type UITree,
} from "@json-ui/core";
import type { HeadlessRegistry } from "@json-ui/headless";
import { createNCObserver } from "./nc-observer";
import { ncHeadlessRegistry } from "./nc-headless-components";
import { ncStarterCatalog } from "../catalog";

function makeDeps() {
  return {
    catalog: ncStarterCatalog,
    staging: createStagingBuffer(),
    data: createObservableDataModel({}),
  };
}

const singleTextFieldTree: UITree = {
  root: "f",
  elements: {
    f: { key: "f", type: "TextField", props: { id: "email", label: "Email" } },
  },
};

describe("createNCObserver", () => {
  it("returns an observer with all required methods and null initial state", () => {
    const observer = createNCObserver(makeDeps());
    expect(typeof observer.render).toBe("function");
    expect(typeof observer.getLastRender).toBe("function");
    expect(typeof observer.serialize).toBe("function");
    expect(typeof observer.destroy).toBe("function");
    expect(observer.getLastRender()).toBeNull();
    expect(observer.getLastRenderPassId()).toBe(0);
    expect(observer.getConsecutiveFailures()).toBe(0);
    expect(observer.serialize("json-string")).toBeNull();
    observer.destroy();
  });

  it("render() populates the cache and advances the pass ID (Invariant 12)", () => {
    const observer = createNCObserver(makeDeps());
    observer.render(singleTextFieldTree);
    const node = observer.getLastRender();
    expect(node).not.toBeNull();
    expect(node!.key).toBe("f");
    expect(node!.type).toBe("TextField");
    expect(observer.getLastRenderPassId()).toBe(1);
    observer.render(singleTextFieldTree);
    expect(observer.getLastRenderPassId()).toBe(2);
    observer.destroy();
  });

  it("serialize('json-string') returns JSON.stringify(lastRender)", () => {
    const observer = createNCObserver(makeDeps());
    observer.render(singleTextFieldTree);
    const expected = JSON.stringify(observer.getLastRender());
    expect(observer.serialize("json-string")).toBe(expected);
    observer.destroy();
  });

  it("serialize('html') returns a non-empty fallback HTML string", () => {
    const observer = createNCObserver(makeDeps());
    observer.render(singleTextFieldTree);
    const html = observer.serialize("html");
    expect(html).not.toBeNull();
    expect(html!.length).toBeGreaterThan(0);
    expect(html!).toContain('data-type="TextField"');
    observer.destroy();
  });

  it("destroy() is idempotent; render() is a no-op after destroy and preserves last good cache", () => {
    // Seed the cache with a successful render first, so we can distinguish
    // "render was a no-op after destroy" from "render never ran at all".
    // Without this seed, getLastRender() would return null both before any
    // render and after a failed post-destroy render — a tautology.
    const observer = createNCObserver(makeDeps());
    observer.render(singleTextFieldTree);
    const cached = observer.getLastRender();
    expect(cached).not.toBeNull();
    expect(observer.getLastRenderPassId()).toBe(1);

    observer.destroy();
    expect(() => observer.destroy()).not.toThrow();

    // render() after destroy is a no-op: cache and counters do not change.
    observer.render(singleTextFieldTree);
    expect(observer.getLastRender()).toBe(cached);
    expect(observer.getLastRenderPassId()).toBe(1);
    expect(observer.getConsecutiveFailures()).toBe(0);
  });

  it("Invariant 13: throwing registry component logs warning, keeps cache, advances failure count", () => {
    // @json-ui/headless's walker (walker.ts:67-79) does NOT throw on unknown
    // component types — it emits a fallback `{type: "Unknown"}` node. So we
    // CANNOT exercise the Invariant 13 catch path by passing a tree with an
    // unknown element type. Instead, we inject a registry whose component
    // FUNCTION throws — the walker's component-error path (walker.ts:80-89)
    // DOES bubble component-function exceptions, which the observer catches.
    //
    // We use the `registry` override on CreateNCObserverOptions (added to
    // enable exactly this test) to install a throwing Container component
    // alongside the real components from ncHeadlessRegistry.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const throwingRegistry: HeadlessRegistry = {
      ...ncHeadlessRegistry,
      Container: () => {
        throw new Error("deliberate test explosion");
      },
    };

    const deps = makeDeps();
    const observer = createNCObserver({ ...deps, registry: throwingRegistry });

    // Seed the cache with a Text tree (Container component is unused here,
    // so this render succeeds).
    const seedTree: UITree = {
      root: "t",
      elements: { t: { key: "t", type: "Text", props: { content: "seed" } } },
    };
    observer.render(seedTree);
    const good = observer.getLastRender();
    expect(good).not.toBeNull();
    expect(observer.getLastRenderPassId()).toBe(1);

    // Now render a tree that uses Container — which throws from the registry.
    const badTree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Container", props: {}, children: [] },
      },
    };
    observer.render(badTree);
    observer.render(badTree);

    // After two failed renders: passId stalled, failures advanced, cache
    // preserved, warnings emitted.
    expect(observer.getConsecutiveFailures()).toBe(2);
    expect(observer.getLastRenderPassId()).toBe(1);
    expect(observer.getLastRender()).toBe(good);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    // A successful render resets the failure counter and advances passId.
    observer.render(seedTree);
    expect(observer.getConsecutiveFailures()).toBe(0);
    expect(observer.getLastRenderPassId()).toBe(2);

    warnSpy.mockRestore();
    observer.destroy();
  });

  it("serialize('unknown-format') throws", () => {
    const observer = createNCObserver(makeDeps());
    observer.render(singleTextFieldTree);
    // Cast bypasses the string literal union for negative-control testing.
    expect(() =>
      observer.serialize("bogus" as "json-string"),
    ).toThrow(/Unknown serialize format/);
    observer.destroy();
  });
});
