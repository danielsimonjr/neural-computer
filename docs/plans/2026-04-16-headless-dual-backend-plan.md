# Path C: Headless Dual-Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a headless LLM observer to the NC runtime so the orchestrator can read a normalized JSON view of the committed UI tree (including staging values) without going through React.

**Architecture:** New `src/observer/` module wraps `@json-ui/headless`'s `createHeadlessRenderer`. Five NC headless components mirror the React input registry; the observer renders in `NCRenderer.useLayoutEffect` right after reconcile. `NCRuntime` gains one new field (`observer`). `createNCRuntime` signature gains two options (`catalog`, optional `catalogVersion`) — minor breaking change.

**Tech Stack:** TypeScript 5.9 strict + noUncheckedIndexedAccess, React 19, Vitest 4, `@json-ui/core`, `@json-ui/headless` (file: dep), `@json-ui/react` (file: dep).

**Spec:** [`docs/specs/2026-04-16-headless-dual-backend-design.md`](../specs/2026-04-16-headless-dual-backend-design.md)

**Test count:** 47 → ~57 (10 new `it()` blocks). Typecheck clean, build clean across ESM + CJS + dts required at every task boundary.

---

## Task 1: Extend `NCRuntime` type with observer field

**Files:**
- Modify: `src/types/nc-types.ts`
- Test: `src/types/nc-types.test.ts` (extend existing)

- [ ] **Step 1: Read the current `NCRuntime` interface**

Run: `cat src/types/nc-types.ts`

Expected: see existing 3 types (`NCIntentHandler`, `NCCatalogVersion`, `NCRuntime`) with 5 fields on `NCRuntime`.

- [ ] **Step 2: Write failing test for `NCObserver` interface existence**

In `src/types/nc-types.test.ts`, add:

```typescript
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
```

Add the import at the top:

```typescript
import type { NCObserver } from "./nc-types";
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run typecheck`

Expected: Error — `NCObserver` is not exported from `./nc-types`.

- [ ] **Step 4: Add `NCObserver` interface to `src/types/nc-types.ts`**

Add imports at the top of the existing import block:

```typescript
import type {
  IntentEvent,
  StagingBuffer,
  ObservableDataModel,
  UITree,
} from "@json-ui/core";
import type { NormalizedNode } from "@json-ui/headless";
```

Add the new interface immediately before `NCRuntime`:

```typescript
/**
 * The NC LLM observer. Shadows every successful React tree commit by
 * running @json-ui/headless on the same tree + shared stores, caching
 * the NormalizedNode output for the orchestrator to read when composing
 * an LLM observation. Owned by NCRuntime; never null.
 */
export interface NCObserver {
  /**
   * Called by NCRenderer after every successful tree commit. Runs the
   * headless renderer synchronously; caches the result on success,
   * leaves the previous cache intact on failure. Catalog is NOT passed
   * per-render — it was bound at observer construction via createNCObserver.
   */
  render: (tree: UITree) => void;

  /**
   * Returns the normalized tree from the most recent successful render,
   * or null if no render has completed yet.
   */
  getLastRender: () => NormalizedNode | null;

  /**
   * Monotonic counter advanced only on successful renders. Zero before
   * the first render. Pairs with getConsecutiveFailures so callers can
   * detect runaway staleness (pass ID stalled + failures increasing).
   */
  getLastRenderPassId: () => number;

  /**
   * Number of consecutive render() calls that have thrown since the
   * last successful render. Resets to 0 on each successful render.
   */
  getConsecutiveFailures: () => number;

  /**
   * Serialize the last render via @json-ui/headless built-in serializers.
   * "json-string" → JSON.stringify(lastRender) for LLM prompts.
   * "html"        → fallback-only diagnostic HTML (debug preview, not UI).
   * Callers wanting the structured NormalizedNode should use getLastRender().
   */
  serialize: (format: "json-string" | "html") => string | null;

  /** Release resources. Idempotent. Called by runtime.destroy(). */
  destroy: () => void;
}
```

Update `NCRuntime` to include the observer field:

```typescript
export interface NCRuntime {
  stagingBuffer: StagingBuffer;
  durableStore: ObservableDataModel;
  /** LLM observer: shadows every React tree commit with a headless render. */
  observer: NCObserver;
  emitIntent: (event: IntentEvent) => Promise<void>;
  setIntentHandler: (handler: NCIntentHandler) => void;
  destroy: () => void;
}
```

- [ ] **Step 5: Run typecheck + test to verify pass**

Run: `npm run typecheck && npx vitest run src/types/nc-types.test.ts`

Expected: typecheck clean, test passes.

- [ ] **Step 6: Commit**

```bash
git add src/types/nc-types.ts src/types/nc-types.test.ts
git commit -m "feat(types): add NCObserver interface + observer field on NCRuntime"
```

---

## Task 2: NC headless component registry

**Files:**
- Create: `src/observer/nc-headless-components.ts`
- Create: `src/observer/nc-headless-components.test.ts`

- [ ] **Step 1: Create the test file first (TDD)**

Create `src/observer/nc-headless-components.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createStagingBuffer, createObservableDataModel } from "@json-ui/core";
import { createHeadlessContext } from "@json-ui/headless";
import type { UIElement } from "@json-ui/core";
import { ncHeadlessRegistry } from "./nc-headless-components";

function makeCtx(stagingValues: Record<string, unknown> = {}) {
  const staging = createStagingBuffer();
  for (const [k, v] of Object.entries(stagingValues)) staging.set(k, v as never);
  const data = createObservableDataModel({});
  return createHeadlessContext({ staging, data });
}

describe("ncHeadlessRegistry", () => {
  it("exports the 5 expected component types", () => {
    expect(ncHeadlessRegistry.Container).toBeDefined();
    expect(ncHeadlessRegistry.Text).toBeDefined();
    expect(ncHeadlessRegistry.TextField).toBeDefined();
    expect(ncHeadlessRegistry.Checkbox).toBeDefined();
    expect(ncHeadlessRegistry.Button).toBeDefined();
  });

  it("Container passes children through", () => {
    const element: UIElement = {
      key: "root",
      type: "Container",
      props: {},
      children: ["a", "b"],
    };
    const childNodes = [
      { type: "Text", key: "a", props: { content: "a" }, children: [], meta: { visible: true } },
      { type: "Text", key: "b", props: { content: "b" }, children: [], meta: { visible: true } },
    ];
    const node = ncHeadlessRegistry.Container!(element, makeCtx(), childNodes);
    expect(node.type).toBe("Container");
    expect(node.key).toBe("root");
    expect(node.children).toEqual(childNodes);
  });

  it("Text emits content prop", () => {
    const element: UIElement = {
      key: "t", type: "Text", props: { content: "hello" },
    };
    const node = ncHeadlessRegistry.Text!(element, makeCtx(), []);
    expect(node.type).toBe("Text");
    expect((node.props as { content: string }).content).toBe("hello");
  });

  it("TextField includes currentValue when staging has a value", () => {
    const element: UIElement = {
      key: "f", type: "TextField", props: { id: "email", label: "Email" },
    };
    const node = ncHeadlessRegistry.TextField!(
      element,
      makeCtx({ email: "a@b.c" }),
      [],
    );
    const props = node.props as { id: string; currentValue?: string };
    expect(props.id).toBe("email");
    expect(props.currentValue).toBe("a@b.c");
  });

  it("TextField omits currentValue when staging has no value for the id", () => {
    const element: UIElement = {
      key: "f", type: "TextField", props: { id: "untouched", label: "X" },
    };
    const node = ncHeadlessRegistry.TextField!(element, makeCtx(), []);
    const props = node.props as { currentValue?: unknown };
    expect("currentValue" in props).toBe(false);
  });

  it("Checkbox includes currentValue when staging has a boolean", () => {
    const element: UIElement = {
      key: "c", type: "Checkbox", props: { id: "agree", label: "Agree" },
    };
    const node = ncHeadlessRegistry.Checkbox!(
      element,
      makeCtx({ agree: true }),
      [],
    );
    const props = node.props as { currentValue?: boolean };
    expect(props.currentValue).toBe(true);
  });

  it("Button preserves label + action shape verbatim", () => {
    const element: UIElement = {
      key: "b",
      type: "Button",
      props: { label: "Submit", action: { name: "submit_form" } },
    };
    const node = ncHeadlessRegistry.Button!(element, makeCtx(), []);
    expect(node.type).toBe("Button");
    expect((node.props as { label: string }).label).toBe("Submit");
    expect((node.props as { action: { name: string } }).action.name).toBe(
      "submit_form",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/observer/nc-headless-components.test.ts`

Expected: FAIL — `Cannot find module './nc-headless-components'`.

- [ ] **Step 3: Create `src/observer/nc-headless-components.ts`**

```typescript
import type {
  HeadlessComponent,
  HeadlessRegistry,
} from "@json-ui/headless";

/**
 * Five headless components mirroring NC's React input-components surface.
 * JSON-UI's HeadlessComponent is typed as a POSITIONAL function
 * (element, ctx, children) — not destructured. See
 * @json-ui/headless/registry.ts:10-14.
 *
 * Input components read their value from ctx.staging (a ReadonlyStagingView)
 * and bake it into the NormalizedNode as `currentValue` so the LLM observer
 * can see what the user has typed. Omitted entirely when staging has no
 * value for the id — makes the NormalizedNode strictly smaller for untouched
 * fields, which the LLM benefits from when trees are large.
 */

const NCContainerHeadless: HeadlessComponent = (element, _ctx, children) => ({
  type: "Container",
  key: element.key,
  props: {},
  children,
  meta: { visible: true },
});

const NCTextHeadless: HeadlessComponent = (element) => ({
  type: "Text",
  key: element.key,
  props: { content: (element.props as { content: string }).content },
  children: [],
  meta: { visible: true },
});

const NCTextFieldHeadless: HeadlessComponent = (element, ctx) => {
  const props = element.props as {
    id: string;
    label: string;
    placeholder?: string;
    error?: string;
  };
  const value = ctx.staging.has(props.id) ? ctx.staging.get(props.id) : undefined;
  return {
    type: "TextField",
    key: element.key,
    props: value === undefined ? props : { ...props, currentValue: value },
    children: [],
    meta: { visible: true },
  };
};

const NCCheckboxHeadless: HeadlessComponent = (element, ctx) => {
  const props = element.props as { id: string; label: string };
  const value = ctx.staging.has(props.id) ? ctx.staging.get(props.id) : undefined;
  return {
    type: "Checkbox",
    key: element.key,
    props: value === undefined ? props : { ...props, currentValue: value },
    children: [],
    meta: { visible: true },
  };
};

const NCButtonHeadless: HeadlessComponent = (element) => {
  // action.params arrive pre-resolved by headless context's
  // resolveActionWithStaging pass — literal values, not DynamicValue refs.
  const props = element.props as {
    label: string;
    action?: { name: string; params?: Record<string, unknown> };
  };
  return {
    type: "Button",
    key: element.key,
    props,
    children: [],
    meta: { visible: true },
  };
};

export const ncHeadlessRegistry: HeadlessRegistry = {
  Container: NCContainerHeadless,
  Text: NCTextHeadless,
  TextField: NCTextFieldHeadless,
  Checkbox: NCCheckboxHeadless,
  Button: NCButtonHeadless,
};
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run typecheck && npx vitest run src/observer/nc-headless-components.test.ts`

Expected: typecheck clean, all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/observer/nc-headless-components.ts src/observer/nc-headless-components.test.ts
git commit -m "feat(observer): add NC headless component registry (5 components)"
```

---

## Task 3: `createNCObserver` factory

**Files:**
- Create: `src/observer/nc-observer.ts`
- Create: `src/observer/nc-observer.test.ts`

- [ ] **Step 1: Create the test file first (TDD)**

Create `src/observer/nc-observer.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  createStagingBuffer,
  createObservableDataModel,
  type UITree,
} from "@json-ui/core";
import type { HeadlessComponent, HeadlessRegistry } from "@json-ui/headless";
import { createNCObserver } from "./nc-observer";
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

  it("destroy() is idempotent; render() is a no-op after destroy", () => {
    const observer = createNCObserver(makeDeps());
    observer.destroy();
    expect(() => observer.destroy()).not.toThrow();
    observer.render(singleTextFieldTree);
    expect(observer.getLastRender()).toBeNull();
    expect(observer.getLastRenderPassId()).toBe(0);
  });

  it("Invariant 13: throwing registry component logs warning, keeps cache, advances failure count", () => {
    // Build a runtime-owned observer that uses a custom registry containing
    // one throwing component. Can't reuse createNCObserver (which uses the
    // built-in registry) — this test constructs its own headless renderer
    // via a modified factory. Simpler approach: monkey-patch by importing
    // the raw createHeadlessRenderer and wrapping it.
    //
    // But per the spec, the observer has to use ncHeadlessRegistry. To test
    // the failure path without modifying the observer, emit a tree whose
    // root element is NOT in ncHeadlessRegistry (e.g. type "Unknown"). The
    // walker throws UnknownComponentError, which createNCObserver catches.
    const observer = createNCObserver(makeDeps());
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // First, do a successful render to seed the cache.
    observer.render(singleTextFieldTree);
    const good = observer.getLastRender();
    expect(good).not.toBeNull();
    expect(observer.getLastRenderPassId()).toBe(1);

    // Now render a tree with an unknown type. catalog.validateTree would
    // reject this at NCRenderer level, but the observer itself doesn't
    // re-validate — it will throw inside walkTree. The observer catches.
    const badTree: UITree = {
      root: "x",
      elements: { x: { key: "x", type: "NotAComponent", props: {} } },
    };
    observer.render(badTree);
    observer.render(badTree);

    expect(observer.getConsecutiveFailures()).toBe(2);
    expect(observer.getLastRenderPassId()).toBe(1); // unchanged
    expect(observer.getLastRender()).toBe(good);    // prior good tree preserved
    expect(warnSpy).toHaveBeenCalledTimes(2);

    // Successful render resets the failure counter.
    observer.render(singleTextFieldTree);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/observer/nc-observer.test.ts`

Expected: FAIL — `Cannot find module './nc-observer'`.

- [ ] **Step 3: Create `src/observer/nc-observer.ts`**

```typescript
import {
  createHeadlessRenderer,
  JsonStringSerializer,
  createHtmlSerializer,
  type NormalizedNode,
} from "@json-ui/headless";
import type {
  Catalog,
  ObservableDataModel,
  StagingBuffer,
} from "@json-ui/core";
import { ncHeadlessRegistry } from "./nc-headless-components";
import type { NCObserver } from "../types";

export interface CreateNCObserverOptions {
  // Catalog is required per HeadlessRendererOptions (renderer.ts:27 in
  // @json-ui/headless). Bound once at construction — HeadlessRenderer.render
  // takes only the tree.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catalog: Catalog<any, any, any>;
  staging: StagingBuffer;
  data: ObservableDataModel;
  catalogVersion?: string;
}

// Fallback-only HTML serializer for diagnostic output. `emitters: {}` means
// every node falls through to the default <div data-type="..."> wrapper
// (see html.ts:41-42 in @json-ui/headless). Production HTML rendering
// (with per-type emitters) belongs to a separate spec if ever needed.
const ncHtmlSerializer = createHtmlSerializer({ emitters: {} });

export function createNCObserver(
  options: CreateNCObserverOptions,
): NCObserver {
  const renderer = createHeadlessRenderer({
    catalog: options.catalog,
    registry: ncHeadlessRegistry,
    staging: options.staging,
    data: options.data,
    catalogVersion: options.catalogVersion,
  });

  let lastRender: NormalizedNode | null = null;
  let lastPassId = 0;
  let consecutiveFailures = 0;
  let destroyed = false;

  return {
    render(tree) {
      if (destroyed) return;
      try {
        lastRender = renderer.render(tree);
        lastPassId += 1;
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures += 1;
        console.warn(
          `[NC] Observer render threw (failure #${consecutiveFailures}); ` +
            `keeping last good cache:`,
          err,
        );
      }
    },
    getLastRender() {
      return lastRender;
    },
    getLastRenderPassId() {
      return lastPassId;
    },
    getConsecutiveFailures() {
      return consecutiveFailures;
    },
    serialize(format) {
      if (lastRender === null) return null;
      if (format === "json-string")
        return JsonStringSerializer.serialize(lastRender);
      if (format === "html") return ncHtmlSerializer.serialize(lastRender);
      throw new Error(`[NC] Unknown serialize format: ${format as string}`);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      renderer.destroy();
    },
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run typecheck && npx vitest run src/observer/nc-observer.test.ts`

Expected: typecheck clean, all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/observer/nc-observer.ts src/observer/nc-observer.test.ts
git commit -m "feat(observer): add createNCObserver factory with failure-counter API"
```

---

## Task 4: Observer barrel export

**Files:**
- Create: `src/observer/index.ts`

- [ ] **Step 1: Create the barrel**

```typescript
export {
  createNCObserver,
  type CreateNCObserverOptions,
} from "./nc-observer";

export { ncHeadlessRegistry } from "./nc-headless-components";
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/observer/index.ts
git commit -m "feat(observer): add barrel export"
```

---

## Task 5: Wire observer into `createNCRuntime`

**Files:**
- Modify: `src/runtime/context.ts`
- Modify: `src/runtime/context.test.ts` (update all 7 existing tests)

- [ ] **Step 1: Read the current runtime source**

Run: `cat src/runtime/context.ts`

Note the existing `CreateNCRuntimeOptions` interface and the `createNCRuntime` function body.

- [ ] **Step 2: Write failing test for the new observer field**

Add to `src/runtime/context.test.ts` (new test at the end of the describe block):

```typescript
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
```

Add the import at the top:

```typescript
import { ncStarterCatalog, NC_CATALOG_VERSION } from "../catalog";
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/runtime/context.test.ts`

Expected: FAIL — `createNCRuntime` does not accept `catalog` (or typecheck error on the options object).

- [ ] **Step 4: Update `src/runtime/context.ts`**

Update the imports at the top:

```typescript
import {
  createStagingBuffer,
  type IntentEvent,
  type ObservableDataModel,
  type Catalog,
} from "@json-ui/core";
import { createNCObserver } from "../observer";
import type { NCCatalogVersion, NCIntentHandler, NCRuntime } from "../types";
```

Update the options interface:

```typescript
export interface CreateNCRuntimeOptions {
  /** Caller-owned ObservableDataModel (from memoryjs or core). */
  durableStore: ObservableDataModel;
  /**
   * Catalog used by the LLM observer's headless renderer. Must be the SAME
   * catalog NCRenderer uses to validate trees, so the observer renders the
   * same post-Zod-strip tree that reconcile walks. @json-ui/headless binds
   * the catalog at factory construction (renderer.ts:27), not per-render.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catalog: Catalog<any, any, any>;
  /** Optional version string threaded through every emitted IntentEvent. */
  catalogVersion?: NCCatalogVersion;
}
```

Update the function body to create and wire the observer. After the existing `const stagingBuffer = createStagingBuffer();` line, add:

```typescript
  const observer = createNCObserver({
    catalog: options.catalog,
    staging: stagingBuffer,
    data: options.durableStore,
    catalogVersion: options.catalogVersion,
  });
```

Update the `destroy` function to dispose the observer:

```typescript
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    intentHandler = null;
    observer.destroy();
    // The durableStore is caller-owned; we don't dispose it here.
  };
```

Update the returned runtime object to include the observer:

```typescript
  return {
    stagingBuffer,
    durableStore: options.durableStore,
    observer,
    emitIntent,
    setIntentHandler,
    destroy,
  };
```

- [ ] **Step 5: Update the 7 existing tests to pass the new required options**

In `src/runtime/context.test.ts`, every `createNCRuntime({ durableStore })` call must become `createNCRuntime({ durableStore, catalog: ncStarterCatalog, catalogVersion: NC_CATALOG_VERSION })`. Count of call sites: 7 (one per existing test block).

Example before:
```typescript
const runtime = await createNCRuntime({ durableStore });
```

After:
```typescript
const runtime = await createNCRuntime({
  durableStore,
  catalog: ncStarterCatalog,
  catalogVersion: NC_CATALOG_VERSION,
});
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm run typecheck && npx vitest run src/runtime/context.test.ts`

Expected: typecheck clean, all 8 tests pass (7 updated + 1 new).

- [ ] **Step 7: Commit**

```bash
git add src/runtime/context.ts src/runtime/context.test.ts
git commit -m "feat(runtime): wire observer into createNCRuntime"
```

---

## Task 6: Call `observer.render` from NCRenderer

**Files:**
- Modify: `src/renderer/nc-renderer.tsx`
- Modify: `src/renderer/nc-renderer.test.tsx`

- [ ] **Step 1: Write failing test — observer populated after React render**

Add to `src/renderer/nc-renderer.test.tsx` (new test inside the existing describe block):

```typescript
it("populates runtime.observer.getLastRender() after a React commit (Invariant 12)", async () => {
  const runtime = await makeRuntime(() => {});
  render(
    <NCRenderer
      tree={{
        root: "r",
        elements: {
          r: { key: "r", type: "Text", props: { content: "hello" } },
        },
      }}
      runtime={runtime}
      catalog={ncStarterCatalog}
      catalogVersion={NC_CATALOG_VERSION}
    />,
  );
  const normalized = runtime.observer.getLastRender();
  expect(normalized).not.toBeNull();
  expect(normalized!.key).toBe("r");
  expect(normalized!.type).toBe("Text");
  expect(runtime.observer.getLastRenderPassId()).toBe(1);
  runtime.destroy();
});
```

- [ ] **Step 2: Write second failing test — observer NOT updated when validation fails**

Add:

```typescript
it("does NOT update observer when tree fails catalog validation (Invariant 9 extended)", async () => {
  const runtime = await makeRuntime(() => {});

  // Seed the observer with a valid tree.
  const goodTree: UITree = {
    root: "r",
    elements: {
      r: { key: "r", type: "Text", props: { content: "hello" } },
    },
  };
  const { rerender } = render(
    <NCRenderer
      tree={goodTree}
      runtime={runtime}
      catalog={ncStarterCatalog}
      catalogVersion={NC_CATALOG_VERSION}
    />,
  );
  const goodCache = runtime.observer.getLastRender();
  const goodPassId = runtime.observer.getLastRenderPassId();
  expect(goodCache).not.toBeNull();

  // Render a tree with duplicate field IDs — validateTree fails.
  const badTree: UITree = {
    root: "root",
    elements: {
      root: {
        key: "root",
        type: "Container",
        props: {},
        children: ["a", "b"],
      },
      a: { key: "a", type: "TextField", props: { id: "dup", label: "A" } },
      b: { key: "b", type: "TextField", props: { id: "dup", label: "B" } },
    },
  };
  rerender(
    <NCRenderer
      tree={badTree}
      runtime={runtime}
      catalog={ncStarterCatalog}
      catalogVersion={NC_CATALOG_VERSION}
    />,
  );

  // Cache and passId unchanged.
  expect(runtime.observer.getLastRender()).toBe(goodCache);
  expect(runtime.observer.getLastRenderPassId()).toBe(goodPassId);
  runtime.destroy();
});
```

Also update `makeRuntime` helper (top of the file) to pass the new required options:

```typescript
async function makeRuntime(onIntent: (event: IntentEvent) => void) {
  const durableStore = createObservableDataModel({});
  const runtime = await createNCRuntime({
    durableStore,
    catalog: ncStarterCatalog,
    catalogVersion: NC_CATALOG_VERSION,
  });
  runtime.setIntentHandler(async (event) => onIntent(event));
  return runtime;
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/renderer/nc-renderer.test.tsx`

Expected: 2 new tests FAIL — observer.getLastRender() returns null because no wiring exists yet. (Other existing tests also fail because `makeRuntime` signature changed — that's fine, they'll pass after the fix below.)

- [ ] **Step 4: Add the `observer.render()` call to NCRenderer**

In `src/renderer/nc-renderer.tsx`, find the `React.useLayoutEffect` block (currently at ~line 103). After the existing `runtime.stagingBuffer.reconcile(liveIds)` call, add:

```typescript
      // Path C: shadow every successful React tree commit with a headless
      // render so the LLM orchestrator can observe the committed tree
      // (including resolved staging values) without importing React.
      // Observer catches its own exceptions — React is unaffected if
      // the headless render fails. See specs/2026-04-16-headless-dual-backend-design.md.
      runtime.observer.render(result.data!);
```

The updated try block:

```typescript
    try {
      const liveIds = collectFieldIds(result.data!);
      runtime.stagingBuffer.reconcile(liveIds);
      runtime.observer.render(result.data!);
    } catch (err) {
      console.warn("[NC] Reconcile threw; buffer untouched:", err);
    }
```

Note: the observer's own `try/catch` inside `createNCObserver` handles its internal errors. The outer `try/catch` here only catches errors from reconcile. If observer.render ever throws synchronously (it shouldn't — the factory catches everything), it would be caught here and logged once, but the observer's own counters would not advance.

Actually — re-examining: `observer.render` already swallows errors internally and logs via `console.warn`. It will never throw out of `createNCObserver`'s returned object. So the outer `try/catch` is not responsible for observer errors. This is the correct isolation boundary.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/renderer/nc-renderer.test.tsx`

Expected: all tests pass, including the 2 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/nc-renderer.tsx src/renderer/nc-renderer.test.tsx
git commit -m "feat(renderer): call runtime.observer.render after every tree commit"
```

---

## Task 7: End-to-end integration test

**Files:**
- Modify: `src/integration.test.tsx`

- [ ] **Step 1: Update existing `createNCRuntime` calls in integration.test.tsx**

Find every call to `createNCRuntime({ durableStore })` (expect 5 total) and add the new options:

```typescript
const runtime = await createNCRuntime({
  durableStore,
  catalog: ncStarterCatalog,
  catalogVersion: NC_CATALOG_VERSION,
});
```

- [ ] **Step 2: Add the end-to-end observer test**

Add at the end of the describe block:

```typescript
it("LLM observer: type → observer reflects staging → handler reads serialized tree", async () => {
  const capturedObservations: string[] = [];
  const durableStore = createObservableDataModel({});
  const runtime = await createNCRuntime({
    durableStore,
    catalog: ncStarterCatalog,
    catalogVersion: NC_CATALOG_VERSION,
  });

  runtime.setIntentHandler(async () => {
    // The handler reads the observer when composing an observation.
    const json = runtime.observer.serialize("json-string");
    if (json !== null) capturedObservations.push(json);
  });

  const tree: UITree = {
    root: "form",
    elements: {
      form: {
        key: "form",
        type: "Container",
        props: {},
        children: ["email", "submit"],
      },
      email: {
        key: "email",
        type: "TextField",
        props: { id: "email", label: "Email" },
      },
      submit: {
        key: "submit",
        type: "Button",
        props: { label: "Submit", action: { name: "submit_form" } },
      },
    },
  };

  render(
    <NCRenderer
      tree={tree}
      runtime={runtime}
      catalog={ncStarterCatalog}
      catalogVersion={NC_CATALOG_VERSION}
    />,
  );

  // Type a value.
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "alice@example.com" },
  });

  // Fire the intent. The handler reads the observer.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await new Promise((r) => setTimeout(r, 0));
  });

  expect(capturedObservations).toHaveLength(1);
  // The serialized JSON contains the form tree with the TextField that has
  // the current staging value resolved by the headless registry.
  const obs = capturedObservations[0]!;
  expect(obs).toContain('"type":"Container"');
  expect(obs).toContain('"type":"TextField"');
  expect(obs).toContain('"currentValue":"alice@example.com"');
  expect(obs).toContain('"type":"Button"');

  runtime.destroy();
});
```

- [ ] **Step 3: Run integration tests**

Run: `npx vitest run src/integration.test.tsx`

Expected: all tests pass (5 existing updated + 1 new = 6).

- [ ] **Step 4: Commit**

```bash
git add src/integration.test.tsx
git commit -m "test(integration): add Path C observer end-to-end test"
```

---

## Task 8: Public barrel + README + AGENTS.md

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `src/index.ts`**

Add at the end of the existing exports:

```typescript
// Observer (LLM observer for Path C)
export {
  createNCObserver,
  ncHeadlessRegistry,
  type CreateNCObserverOptions,
} from "./observer";
```

The `NCObserver` type is already reachable via the existing `./types` re-export — verify by reading `src/types/index.ts`. If not already re-exported there, add:

```typescript
export type { NCObserver } from "./nc-types";
```

- [ ] **Step 2: Update README.md quickstart**

In the quickstart section, find the `createNCRuntime` call and update it:

Before:
```typescript
const runtime = await createNCRuntime({ durableStore });
```

After:
```typescript
const runtime = await createNCRuntime({
  durableStore,
  catalog: ncStarterCatalog,
  catalogVersion: NC_CATALOG_VERSION,
});
```

Update the "Status" line to reflect the new test count (will be ~57 after this plan ships; leave as-is until final test count is verified).

- [ ] **Step 3: Update AGENTS.md**

Under "Critical Conventions (that have caused bugs)", add a new bullet:

```markdown
- **`createNCRuntime` requires `catalog` and optionally `catalogVersion`.** Since Path C (Plan `2026-04-16-headless-dual-backend`), the runtime owns an LLM observer whose headless renderer binds the catalog at construction. The same `ncStarterCatalog` + `NC_CATALOG_VERSION` that `NCRenderer` and `NCApp` use must be threaded into `createNCRuntime`. Callers using `NCApp` can pass them directly; callers using `NCRenderer` manually must do this wiring themselves.
```

- [ ] **Step 4: Run full typecheck + test suite**

Run: `npm run typecheck && npm test`

Expected: typecheck clean, all ~57 tests pass.

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: ESM + CJS + dts output clean.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts README.md AGENTS.md src/types/index.ts
git commit -m "docs: export observer surface + update createNCRuntime callers"
```

---

## Task 9: Update CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add an Added entry for the observer**

Insert under `## [Unreleased]` > `### Added`:

```markdown
- **Path C: LLM observer (`src/observer/`)** — new module wrapping `@json-ui/headless` to produce a normalized JSON view of every committed UI tree. `NCRuntime` gains a `runtime.observer` field exposing `getLastRender()`, `getLastRenderPassId()`, `getConsecutiveFailures()`, and `serialize("json-string" | "html")`. The observer is created by `createNCRuntime`, driven by `NCRenderer.useLayoutEffect` (one added line after reconcile), and destroyed by `runtime.destroy()`. Orchestrator reads the observer when composing observations for the LLM.

  New invariants:
  - **Invariant 12** — Observer shadows React renders: after a successful tree commit, `getLastRender()` returns the normalized version of that same tree.
  - **Invariant 13** — Observer failure is best-effort but detectable: registry throws log via `console.warn`, cache stays at last good, `getConsecutiveFailures()` advances, `getLastRenderPassId()` does not.

  Five headless components mirror the React input registry; input components emit their `currentValue` from the shared staging buffer so the LLM sees what the user has typed.
```

- [ ] **Step 2: Add a Breaking Changes section (if not already present under Unreleased)**

```markdown
### Changed

- **`createNCRuntime` signature (minor breaking).** Now requires `catalog` and accepts an optional `catalogVersion`. Required because the runtime-owned LLM observer's headless renderer binds the catalog at construction (see `@json-ui/headless`'s `HeadlessRendererOptions.catalog` requirement). Migration:

  Before:
  ```typescript
  await createNCRuntime({ durableStore });
  ```

  After:
  ```typescript
  await createNCRuntime({
    durableStore,
    catalog: ncStarterCatalog,
    catalogVersion: NC_CATALOG_VERSION,
  });
  ```

  `NCApp` users are unaffected if `NCApp` handles the wiring internally. Direct `createNCRuntime` callers (e.g., custom integrations that construct the runtime before mounting `NCApp` or `NCRenderer`) must update.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): Path C observer implementation notes"
```

---

## Task 10: Project memory + final push

**Files:**
- Modify: `C:\Users\danie\.claude\projects\C--Users-danie-Dropbox-Github-neural-computer\memory\project_state.md`
- Modify: `C:\Users\danie\.claude\projects\C--Users-danie-Dropbox-Github-neural-computer\memory\MEMORY.md`
- Create: `C:\Users\danie\.claude\projects\C--Users-danie-Dropbox-Github-neural-computer\memory\feedback_headless_component_signature.md`

- [ ] **Step 1: Update project_state.md**

Update the line counts, test counts (47 → ~57), and mention Path C as shipped. Add invariants 12, 13 to the invariant coverage table.

- [ ] **Step 2: Create a feedback memory for the headless API gotcha**

The HeadlessComponent signature being positional (not destructured) caught the Opus + Sonnet review. Future agents implementing headless extensions should know.

```markdown
---
name: @json-ui/headless HeadlessComponent is positional, not destructured
description: HeadlessComponent signature is (element, ctx, children), not ({element, children, context}). Easy to get wrong; caught in every new implementation.
type: feedback
---

`@json-ui/headless`'s `HeadlessComponent` type is:

```typescript
type HeadlessComponent<P> = (
  element: UIElement<string, P>,
  ctx: HeadlessContext,
  children: NormalizedNode[],
) => NormalizedNode;
```

Positional arguments, `ctx` in the middle. NOT destructured object as `({element, ctx, children})`.

**Why:** Intuition from React's `(props) => JSX` pattern makes authors reach for destructured object syntax, but headless components are lower-level — they receive three positional args so the caller (the walker) can use cheap array-index dispatch.

**How to apply:** When writing new headless components, always destructure inside the body, not in the parameter list:

```typescript
const C: HeadlessComponent = (element, ctx, children) => { ... };  // correct
const C: HeadlessComponent = ({ element, ctx, children }) => { ... };  // WRONG
```

Caught by the Opus + Sonnet review of the Path C spec (2026-04-16). All 5 component sketches had to be rewritten.
```

- [ ] **Step 3: Update MEMORY.md to link the new feedback file**

Add to the Feedback / conventions section:

```markdown
- [Headless component signature is positional](feedback_headless_component_signature.md) — (element, ctx, children), not destructured
```

- [ ] **Step 4: Push all commits to origin/main**

Run: `git push origin main`

Expected: push succeeds (direct-to-main model per AGENTS.md git conventions).

---

## Done Criteria

- [ ] All 9 tasks committed
- [ ] `npm run typecheck` clean
- [ ] `npm test` passes (~57 tests, 11+ files)
- [ ] `npm run build` clean (ESM + CJS + dts)
- [ ] `runtime.observer` field present on `NCRuntime` interface
- [ ] `runtime.observer.getLastRender()` returns a NormalizedNode after any React render
- [ ] Invariant 12 test verifies observer shadows React tree commits
- [ ] Invariant 13 test verifies observer failure is detectable via counters
- [ ] `createNCRuntime` breaking change documented in CHANGELOG
- [ ] Public barrel re-exports `createNCObserver`, `ncHeadlessRegistry`, `CreateNCObserverOptions`, `NCObserver`
- [ ] README quickstart updated
- [ ] AGENTS.md convention added
- [ ] Project memory updated
- [ ] All commits pushed to `origin/main`
