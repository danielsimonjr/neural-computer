# Ephemeral UI State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the staging-buffer-based renderer wrapper described in `docs/specs/2026-04-11-ephemeral-ui-state-design.md`. Produces an `NCRenderer` React component that wraps `@json-ui/react`'s `Renderer`, accumulates in-progress user input in an access-disciplined buffer, flushes it as `IntentEvent`s on named catalog actions, and resolves `DynamicValue` action params against the buffer before they reach JSON-UI.

**Architecture:** TypeScript + React 19. A pure staging-buffer module (Map-backed, no framework) is tested in isolation, then wrapped in a React context provider, consumed by NC-authored input components, and composed by `NCRenderer` which also walks emitted trees to drive reconciliation. JSON-UI is a sibling dependency installed via `file:` paths. Tests use vitest + jsdom + @testing-library/react.

**Tech Stack:** TypeScript 5.9, React 19, `@json-ui/core` 0.1, `@json-ui/react` 0.1, Zod 4, vitest 4, @testing-library/react 16, jsdom

**Spec:** `docs/specs/2026-04-11-ephemeral-ui-state-design.md`

**Dependencies on sibling repo:** Local development requires JSON-UI built at `../JSON-UI`. Task 1 handles this.

**Honesty notes about the plan:**

- Several tests in Task 3 are **invariant-lock tests** rather than strict red-green TDD cycles. Task 3's initial implementation is the full buffer (set/get/snapshot/reconcile) because splitting it creates more friction than clarity, and the subsequent tests pin down behaviors that the implementation commits to. Each step is honestly labeled.
- **Invariant 10 (backpressure rejection) is deferred** to a follow-up plan that integrates with the orchestrator. The staging-buffer layer alone cannot provide real backpressure: "intent completed" is an orchestrator-owned event, not a renderer-owned event. A synchronous in-flight flag in React's event loop is vacuous (cleared before any second click could observe it), so this plan does not implement one and does not pretend to satisfy Invariant 10.
- **Risk 2's streaming sub-case is also deferred** (JSON-UI does not yet expose a streaming API). This plan handles only the invalid-tree sub-case of Risk 2.

---

### Task 1: Project setup and toolchain

**Goal:** Build the sibling JSON-UI packages, install NC dependencies via `file:` paths, configure vitest with jsdom for React component tests, verify the `file:` resolution actually took effect, verify strict typecheck passes on the placeholder `src/index.ts`.

**Files:**
- Modify: `package.json` (switch `@json-ui/*` deps to `file:` paths)
- Create: `vitest.config.ts`

- [ ] **Step 1: Verify sibling JSON-UI repo is present**

```bash
test -d ../JSON-UI/packages/core && test -d ../JSON-UI/packages/react && echo "ok"
```

Expected: `ok`. If not printed, stop and fix the working-copy layout before continuing — this plan assumes `neural-computer` and `JSON-UI` are sibling directories.

- [ ] **Step 2: Build JSON-UI sibling packages**

```bash
cd ../JSON-UI && npm install && npm run build && cd ../neural-computer
```

Expected: `../JSON-UI/packages/core/dist/` and `../JSON-UI/packages/react/dist/` populated with `index.js`, `index.mjs`, `index.d.ts`.

- [ ] **Step 3: Rewrite the `@json-ui/*` dependency lines in `package.json`**

Open `package.json` and replace these two lines:

```json
    "@json-ui/core": "^0.1.0",
    "@json-ui/react": "^0.1.0",
```

with:

```json
    "@json-ui/core": "file:../JSON-UI/packages/core",
    "@json-ui/react": "file:../JSON-UI/packages/react",
```

- [ ] **Step 4: Install NC dependencies**

```bash
npm install
```

Expected: `node_modules/` populated, no resolution errors.

- [ ] **Step 5: Verify the local `file:` resolution actually landed**

```bash
npm ls @json-ui/core @json-ui/react
```

Expected output contains `file:../JSON-UI/packages/core` and `file:../JSON-UI/packages/react`. If you instead see a registry version, your `package.json` edit from Step 3 did not save correctly — go back and redo Step 3. Silently running against a registry version would defeat the local-dev setup.

- [ ] **Step 6: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: [],
  },
});
```

- [ ] **Step 7: Verify typecheck passes on the placeholder `src/index.ts`**

```bash
npm run typecheck
```

Expected: no errors, clean exit.

- [ ] **Step 8: Verify vitest runs (empty pass)**

```bash
npm test
```

Expected: "No test files found" or equivalent — vitest infrastructure works, just nothing to run yet.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: install deps, configure vitest with jsdom"
```

---

### Task 2: Core type definitions

**Goal:** Define `FieldId`, `StagingSnapshot`, and `IntentEvent` — the pure types shared across the renderer/orchestrator boundary. Type-only module, no runtime code, no tests.

**Files:**
- Create: `src/orchestrator/intent-event.ts`

- [ ] **Step 1: Create `src/orchestrator/intent-event.ts`**

```typescript
// Pure type definitions for intent events crossing the renderer -> orchestrator boundary.
// See docs/specs/2026-04-11-ephemeral-ui-state-design.md § Rule 4 for semantics.

/** Stable identifier for an input field within a rendered UI tree. */
export type FieldId = string;

/** A snapshot of the staging buffer at a single point in time. */
export type StagingSnapshot = Record<FieldId, unknown>;

/**
 * Event emitted by the NC renderer wrapper when a named catalog action fires.
 * The orchestrator composes the next LLM observation from an IntentEvent plus
 * the current durable state.
 */
export interface IntentEvent {
  /** Name of the action from the NC catalog, e.g. "submit_form". */
  action_name: string;
  /** Parameters the LLM placed in the action declaration at tree-emission time. */
  action_params: Record<string, unknown>;
  /** Full snapshot of the staging buffer at flush time. Never merged with action_params. */
  staging_snapshot: StagingSnapshot;
  /** Optional version string for the catalog in effect at emission time. */
  catalog_version?: string;
  /** Unix epoch milliseconds when the intent fired. */
  timestamp: number;
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/orchestrator/intent-event.ts
git commit -m "feat: add FieldId, StagingSnapshot, IntentEvent types"
```

---

### Task 3: Staging buffer core (pure)

**Goal:** Implement the pure staging buffer module — `set`, `get`, `snapshot`, `reconcile`. The first step creates the file and a test that drives the minimal implementation; subsequent steps add **invariant-lock tests** that pin down behaviors already satisfied by the minimal implementation. This is an explicit deviation from strict red-green TDD: the tests after Step 4 are coverage locks, not driver tests. They ensure the implementation commits to the specified behavior across future edits.

**Files:**
- Create: `src/renderer/staging-buffer.ts`
- Create: `src/renderer/staging-buffer.test.ts`

- [ ] **Step 1: Write failing test — set and snapshot basic operation (drives file creation)**

Create `src/renderer/staging-buffer.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { createStagingBuffer } from "./staging-buffer";

describe("StagingBuffer", () => {
  test("set and snapshot return the value", () => {
    const buf = createStagingBuffer();
    buf.set("email", "dan@example.com");
    expect(buf.snapshot()).toEqual({ email: "dan@example.com" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/staging-buffer.test.ts
```

Expected: FAIL with "Cannot find module './staging-buffer'" — this is a true red state, no file exists yet.

- [ ] **Step 3: Create full `src/renderer/staging-buffer.ts`**

```typescript
import type { FieldId, StagingSnapshot } from "../orchestrator/intent-event";

/**
 * Mechanical accumulator for in-progress user input. Access-disciplined:
 * the orchestrator never reads this except on flush via makeActionHandlers.
 * See docs/specs/2026-04-11-ephemeral-ui-state-design.md § Rules 1-4.
 */
export interface StagingBuffer {
  set(fieldId: FieldId, value: unknown): void;
  get(fieldId: FieldId): unknown;
  snapshot(): StagingSnapshot;
  reconcile(activeFieldIds: Set<FieldId>): void;
}

export function createStagingBuffer(): StagingBuffer {
  const store = new Map<FieldId, unknown>();

  return {
    set(fieldId, value) {
      store.set(fieldId, value);
    },
    get(fieldId) {
      return store.get(fieldId);
    },
    snapshot() {
      return Object.fromEntries(store);
    },
    reconcile(activeFieldIds) {
      for (const key of Array.from(store.keys())) {
        if (!activeFieldIds.has(key)) {
          store.delete(key);
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes (red → green cycle complete)**

```bash
npx vitest run src/renderer/staging-buffer.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Add invariant-lock test for `get()` — NOT a red-green cycle**

Step 3's minimal implementation already provides `get`. This test pins the behavior in place for future edits. Append to `src/renderer/staging-buffer.test.ts`:

```typescript
  test("get returns the value previously set (invariant lock)", () => {
    const buf = createStagingBuffer();
    buf.set("name", "Alice");
    expect(buf.get("name")).toBe("Alice");
  });

  test("get returns undefined for unknown field (invariant lock)", () => {
    const buf = createStagingBuffer();
    expect(buf.get("missing")).toBeUndefined();
  });
```

- [ ] **Step 6: Run and confirm pass on first run (invariant lock, not red-green)**

```bash
npx vitest run src/renderer/staging-buffer.test.ts
```

Expected: PASS (3 tests). These pass immediately because the minimal implementation in step 3 already satisfies them.

- [ ] **Step 7: Add invariant-lock test — Invariant 4 (snapshot is non-destructive)**

Append:

```typescript
  test("snapshot is non-destructive (Invariant 4, invariant lock)", () => {
    const buf = createStagingBuffer();
    buf.set("a", 1);
    buf.set("b", 2);
    const first = buf.snapshot();
    const second = buf.snapshot();
    expect(second).toEqual(first);
    expect(buf.get("a")).toBe(1);
    expect(buf.get("b")).toBe(2);
  });
```

- [ ] **Step 8: Run and confirm pass**

Expected: PASS (4 tests).

- [ ] **Step 9: Add invariant-lock test — Invariant 1 (reconcile drops)**

Append:

```typescript
  test("reconcile drops entries whose IDs are absent from activeFieldIds (Invariant 1)", () => {
    const buf = createStagingBuffer();
    buf.set("kept", "v1");
    buf.set("dropped", "v2");
    buf.reconcile(new Set(["kept"]));
    expect(buf.snapshot()).toEqual({ kept: "v1" });
    expect(buf.get("dropped")).toBeUndefined();
  });
```

- [ ] **Step 10: Run and confirm pass**

Expected: PASS (5 tests).

- [ ] **Step 11: Add invariant-lock test — Invariant 2 (reconcile preserves presence)**

Append:

```typescript
  test("reconcile preserves entries whose IDs are still active (Invariant 2)", () => {
    const buf = createStagingBuffer();
    buf.set("x", 42);
    buf.reconcile(new Set(["x", "y"]));
    expect(buf.get("x")).toBe(42);
  });
```

- [ ] **Step 12: Run and confirm pass**

Expected: PASS (6 tests).

- [ ] **Step 13: Add invariant-lock test — buffer-level version of Invariant 3 (props-agnostic keying)**

The buffer only sees the ID set; it cannot observe props. The renderer-level version of Invariant 3 (same ID with different props preserving value) lives in Task 11. This buffer-level test verifies repeated reconciliation with the same ID set preserves contents, which is the isolation the renderer layer depends on.

Append:

```typescript
  test("reconcile preserves across repeated calls with same ID set (Invariant 3, buffer-level)", () => {
    const buf = createStagingBuffer();
    buf.set("email", "user@example.com");
    buf.reconcile(new Set(["email"]));
    buf.reconcile(new Set(["email"]));
    buf.reconcile(new Set(["email"]));
    expect(buf.get("email")).toBe("user@example.com");
  });
```

- [ ] **Step 14: Run and confirm pass**

Expected: PASS (7 tests).

- [ ] **Step 15: Commit**

```bash
git add src/renderer/staging-buffer.ts src/renderer/staging-buffer.test.ts
git commit -m "feat: staging buffer with set/get/snapshot/reconcile + invariant-lock tests"
```

---

### Task 4: Tree walker — collect field IDs from a UITree

**Goal:** Pure function that walks a JSON-UI `UITree` and returns the set of field IDs present. `NCRenderer` will call this on every committed tree to drive reconciliation. Throws on duplicate field IDs (Invariant 8). No React dependency.

**Files:**
- Create: `src/renderer/tree-walker.ts`
- Create: `src/renderer/tree-walker.test.ts`

**Background:** JSON-UI's `UITree` is `{ root: string; elements: Record<string, UIElement> }`. Each element has `type`, `key`, `props`, and optional `children: string[]`. The field ID is `props.id` on input components. The walker returns every string `props.id` across all elements that have one. Field IDs must be unique; duplicates throw.

- [ ] **Step 1: Write failing test — empty tree returns empty set**

Create `src/renderer/tree-walker.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import type { UITree } from "@json-ui/core";
import { collectFieldIds } from "./tree-walker";

describe("collectFieldIds", () => {
  test("returns empty set for a tree with no inputs", () => {
    const tree: UITree = {
      root: "r",
      elements: { r: { key: "r", type: "Root", props: {} } },
    };
    expect(collectFieldIds(tree)).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/tree-walker.test.ts
```

Expected: FAIL with "Cannot find module './tree-walker'".

- [ ] **Step 3: Create `src/renderer/tree-walker.ts` with full uniqueness enforcement**

```typescript
import type { UITree } from "@json-ui/core";
import type { FieldId } from "../orchestrator/intent-event";

export class DuplicateFieldIdError extends Error {
  constructor(public readonly fieldId: FieldId) {
    super(`duplicate field id "${fieldId}" in tree`);
    this.name = "DuplicateFieldIdError";
  }
}

/**
 * Walk a UITree and collect the `id` prop from every element that declares one.
 * Throws DuplicateFieldIdError if two elements share the same id (Invariant 8).
 * NCRenderer catches this error and refuses to reconcile the tree (Risk 2).
 */
export function collectFieldIds(tree: UITree): Set<FieldId> {
  const ids = new Set<FieldId>();
  for (const element of Object.values(tree.elements)) {
    const id = (element.props as { id?: unknown }).id;
    if (typeof id === "string") {
      if (ids.has(id)) {
        throw new DuplicateFieldIdError(id);
      }
      ids.add(id);
    }
  }
  return ids;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/renderer/tree-walker.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Add test — single input with id**

Append:

```typescript
  test("returns a single id when one input element has one", () => {
    const tree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Root", props: {}, children: ["f1"] },
        f1: { key: "f1", type: "TextField", props: { id: "email", label: "Email" } },
      },
    };
    expect(collectFieldIds(tree)).toEqual(new Set(["email"]));
  });
```

- [ ] **Step 6: Run and confirm pass**

Expected: PASS (2 tests).

- [ ] **Step 7: Add test — multiple ids across a tree**

Append:

```typescript
  test("collects all ids from a multi-input tree", () => {
    const tree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Root", props: {}, children: ["f1", "f2", "f3"] },
        f1: { key: "f1", type: "TextField", props: { id: "name", label: "Name" } },
        f2: { key: "f2", type: "TextField", props: { id: "email", label: "Email" } },
        f3: { key: "f3", type: "Checkbox", props: { id: "subscribe", label: "Subscribe" } },
      },
    };
    expect(collectFieldIds(tree)).toEqual(new Set(["name", "email", "subscribe"]));
  });
```

- [ ] **Step 8: Run and confirm pass**

Expected: PASS (3 tests).

- [ ] **Step 9: Add test — elements without id are ignored**

Append:

```typescript
  test("ignores elements that do not declare an id prop", () => {
    const tree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Card", props: { title: "Hello" }, children: ["l1", "f1"] },
        l1: { key: "l1", type: "Label", props: { text: "Just a label" } },
        f1: { key: "f1", type: "TextField", props: { id: "q", label: "Question" } },
      },
    };
    expect(collectFieldIds(tree)).toEqual(new Set(["q"]));
  });
```

- [ ] **Step 10: Run and confirm pass**

Expected: PASS (4 tests).

- [ ] **Step 11: Add test — non-string id props are ignored defensively**

Append:

```typescript
  test("ignores non-string id props defensively", () => {
    const tree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Root", props: {}, children: ["b1"] },
        b1: { key: "b1", type: "TextField", props: { id: 42, label: "Bad" } as never },
      },
    };
    expect(collectFieldIds(tree)).toEqual(new Set());
  });
```

- [ ] **Step 12: Run and confirm pass**

Expected: PASS (5 tests).

- [ ] **Step 13: Add test — Invariant 8 (duplicate field IDs throw)**

Append:

```typescript
  test("throws DuplicateFieldIdError on colliding ids (Invariant 8)", () => {
    const tree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Container", props: {}, children: ["f1", "f2"] },
        f1: { key: "f1", type: "TextField", props: { id: "email", label: "Email" } },
        f2: { key: "f2", type: "TextField", props: { id: "email", label: "Email Again" } },
      },
    };
    expect(() => collectFieldIds(tree)).toThrow(/duplicate field id "email"/);
  });
```

- [ ] **Step 14: Run and confirm pass**

Expected: PASS (6 tests). The duplicate-id enforcement was built into Step 3's implementation, so this is an invariant lock.

- [ ] **Step 15: Commit**

```bash
git add src/renderer/tree-walker.ts src/renderer/tree-walker.test.ts
git commit -m "feat: collectFieldIds tree walker with duplicate-id enforcement (Invariant 8)"
```

---

### Task 5: React context provider for the staging buffer

**Goal:** Wrap the pure staging buffer in a React context so NC input components can read and write it via a hook. The context holds the buffer in a `useRef` so instance identity is stable across renders.

**Files:**
- Create: `src/renderer/staging-buffer-context.tsx`
- Create: `src/renderer/staging-buffer-context.test.tsx`

- [ ] **Step 1: Write failing test — hook exposes a stable buffer across renders**

Create `src/renderer/staging-buffer-context.test.tsx`:

```typescript
import React from "react";
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { StagingBufferProvider, useStagingBuffer } from "./staging-buffer-context";

describe("StagingBufferProvider + useStagingBuffer", () => {
  test("hook exposes a stable buffer across renders", () => {
    const captured: Array<ReturnType<typeof useStagingBuffer>> = [];
    function Capture() {
      captured.push(useStagingBuffer());
      return null;
    }
    const { rerender } = render(
      <StagingBufferProvider>
        <Capture />
      </StagingBufferProvider>,
    );
    rerender(
      <StagingBufferProvider>
        <Capture />
      </StagingBufferProvider>,
    );
    expect(captured.length).toBe(2);
    expect(captured[0]).toBe(captured[1]);
    captured[0]!.set("k", "v");
    expect(captured[1]!.get("k")).toBe("v");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/staging-buffer-context.test.tsx
```

Expected: FAIL with "Cannot find module './staging-buffer-context'".

- [ ] **Step 3: Create `src/renderer/staging-buffer-context.tsx`**

```typescript
import React, { createContext, useContext, useRef } from "react";
import { createStagingBuffer, type StagingBuffer } from "./staging-buffer";

const StagingBufferContext = createContext<StagingBuffer | null>(null);

export interface StagingBufferProviderProps {
  children: React.ReactNode;
}

/**
 * Provides a stable StagingBuffer instance to descendants via React context.
 * The buffer is held in a useRef so its identity does not change across renders.
 */
export function StagingBufferProvider({ children }: StagingBufferProviderProps) {
  const ref = useRef<StagingBuffer | null>(null);
  if (ref.current === null) {
    ref.current = createStagingBuffer();
  }
  return (
    <StagingBufferContext.Provider value={ref.current}>
      {children}
    </StagingBufferContext.Provider>
  );
}

/** Access the staging buffer provided by the nearest StagingBufferProvider ancestor. */
export function useStagingBuffer(): StagingBuffer {
  const buf = useContext(StagingBufferContext);
  if (buf === null) {
    throw new Error("useStagingBuffer must be called inside a StagingBufferProvider");
  }
  return buf;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/renderer/staging-buffer-context.test.tsx
```

Expected: PASS (1 test).

- [ ] **Step 5: Add failing test — hook outside provider throws**

Append:

```typescript
  test("useStagingBuffer throws when called outside a provider", () => {
    function Bare() {
      useStagingBuffer();
      return null;
    }
    const err = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Bare />)).toThrow(/StagingBufferProvider/);
    } finally {
      console.error = err;
    }
  });
```

- [ ] **Step 6: Run and confirm pass**

Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/staging-buffer-context.tsx src/renderer/staging-buffer-context.test.tsx
git commit -m "feat: StagingBufferProvider + useStagingBuffer hook"
```

---

### Task 6: NC input components + toRegistered adapter

**Goal:** Implement `NCTextField` and `NCCheckbox` with direct-props signatures (for easy standalone testing), plus a `toRegistered<P>(Component)` adapter that turns them into JSON-UI-compatible `ComponentRenderer`s. The adapter is critical: JSON-UI's `Renderer` invokes registered components via `ComponentRenderProps` (`{ element, onAction, children, loading }`), passing `element.props` inside, not as the component's direct props. Without the adapter, a direct-props component registered in JSON-UI's registry would receive `undefined` for every one of its declared props.

**Files:**
- Create: `src/renderer/input-fields.tsx`
- Create: `src/renderer/input-fields.test.tsx`

- [ ] **Step 1: Install user-event testing helper**

```bash
npm install --save-dev @testing-library/user-event
```

Expected: `@testing-library/user-event` added to devDependencies.

- [ ] **Step 2: Write failing test — NCTextField writes typed value to the buffer**

Create `src/renderer/input-fields.test.tsx`:

```typescript
import React from "react";
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StagingBufferProvider, useStagingBuffer } from "./staging-buffer-context";
import { NCTextField, NCCheckbox, toRegistered } from "./input-fields";

describe("NCTextField", () => {
  test("writes typed value to the staging buffer under its id", async () => {
    const user = userEvent.setup();
    let capturedBuf: ReturnType<typeof useStagingBuffer> | undefined;
    function Capture() {
      capturedBuf = useStagingBuffer();
      return null;
    }
    render(
      <StagingBufferProvider>
        <Capture />
        <NCTextField id="email" label="Email" />
      </StagingBufferProvider>,
    );
    await user.type(screen.getByLabelText("Email"), "dan@example.com");
    expect(capturedBuf!.get("email")).toBe("dan@example.com");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run src/renderer/input-fields.test.tsx
```

Expected: FAIL with "Cannot find module './input-fields'".

- [ ] **Step 4: Create `src/renderer/input-fields.tsx`**

```typescript
import React, { useState, type ComponentType } from "react";
import type { ComponentRenderProps, ComponentRenderer } from "@json-ui/react";
import { useStagingBuffer } from "./staging-buffer-context";
import type { FieldId } from "../orchestrator/intent-event";

export interface NCTextFieldProps {
  id: FieldId;
  label: string;
  placeholder?: string;
  error?: string;
}

/**
 * Text input that writes to and reads from the staging buffer. Direct-props
 * signature for easy standalone testing. Use toRegistered(NCTextField) to
 * plug into a JSON-UI registry.
 *
 * Reconciliation + component remount handles out-of-band buffer changes: if
 * a later tree drops this field's id, this component unmounts; when a
 * subsequent tree brings it back, a fresh instance mounts and reads from
 * the (now-reconciled) buffer slot. No sync useEffect needed.
 */
export function NCTextField({ id, label, placeholder, error }: NCTextFieldProps) {
  const buf = useStagingBuffer();
  const initial = typeof buf.get(id) === "string" ? (buf.get(id) as string) : "";
  const [value, setValue] = useState(initial);

  return (
    <label>
      {label}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          buf.set(id, e.target.value);
        }}
      />
      {error ? <span role="alert">{error}</span> : null}
    </label>
  );
}

export interface NCCheckboxProps {
  id: FieldId;
  label: string;
}

export function NCCheckbox({ id, label }: NCCheckboxProps) {
  const buf = useStagingBuffer();
  const initial = buf.get(id) === true;
  const [checked, setChecked] = useState(initial);

  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          buf.set(id, e.target.checked);
        }}
      />
      {label}
    </label>
  );
}

/**
 * Adapter: turn a directly-propped component into a JSON-UI-compatible
 * component renderer. The adapter unpacks element.props and forwards them
 * as ordinary props to the wrapped component. Use this when building an
 * NC catalog registry:
 *
 *   const registry = {
 *     TextField: toRegistered(NCTextField),
 *     Checkbox: toRegistered(NCCheckbox),
 *   };
 *
 * Without this adapter, registering NCTextField directly would result in
 * every prop (`id`, `label`, ...) being `undefined`, because JSON-UI's
 * Renderer invokes registered components with `ComponentRenderProps`
 * (`{ element, onAction, children, loading }`), not the direct props.
 */
export function toRegistered<P>(Component: ComponentType<P>): ComponentRenderer<P> {
  return function Registered({ element }: ComponentRenderProps<P>) {
    return <Component {...(element.props as P)} />;
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/renderer/input-fields.test.tsx
```

Expected: PASS (1 test).

- [ ] **Step 6: Add failing test — NCCheckbox writes toggled boolean**

Append:

```typescript
describe("NCCheckbox", () => {
  test("writes toggled boolean to the staging buffer under its id", async () => {
    const user = userEvent.setup();
    let capturedBuf: ReturnType<typeof useStagingBuffer> | undefined;
    function Capture() {
      capturedBuf = useStagingBuffer();
      return null;
    }
    render(
      <StagingBufferProvider>
        <Capture />
        <NCCheckbox id="subscribe" label="Subscribe" />
      </StagingBufferProvider>,
    );
    await user.click(screen.getByLabelText("Subscribe"));
    expect(capturedBuf!.get("subscribe")).toBe(true);
    await user.click(screen.getByLabelText("Subscribe"));
    expect(capturedBuf!.get("subscribe")).toBe(false);
  });
});
```

- [ ] **Step 7: Run and confirm pass**

Expected: PASS (2 tests).

- [ ] **Step 8: Add failing test — toRegistered adapter unpacks element.props**

This test simulates how JSON-UI's `Renderer` will invoke the adapted component: with an `element` prop whose `props` field contains the direct props.

Append:

```typescript
describe("toRegistered", () => {
  test("adapts a direct-props component to a JSON-UI registered component", async () => {
    const user = userEvent.setup();
    let capturedBuf: ReturnType<typeof useStagingBuffer> | undefined;
    function Capture() {
      capturedBuf = useStagingBuffer();
      return null;
    }
    const RegisteredText = toRegistered(NCTextField);
    const element = {
      key: "f1",
      type: "TextField",
      props: { id: "name", label: "Name" },
    };
    render(
      <StagingBufferProvider>
        <Capture />
        <RegisteredText element={element as never} />
      </StagingBufferProvider>,
    );
    await user.type(screen.getByLabelText("Name"), "Daniel");
    expect(capturedBuf!.get("name")).toBe("Daniel");
  });
});
```

- [ ] **Step 9: Run and confirm pass**

Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add src/renderer/input-fields.tsx src/renderer/input-fields.test.tsx package.json package-lock.json
git commit -m "feat: NCTextField, NCCheckbox, and toRegistered adapter for JSON-UI registries"
```

---

### Task 7: NC catalog with id-required input schemas

**Goal:** Define the minimal NC catalog using `@json-ui/core`'s `createCatalog`. Every input component schema includes `id: z.string()`.

**Files:**
- Create: `src/catalog/input-fields.ts`

- [ ] **Step 1: Create `src/catalog/input-fields.ts`**

```typescript
import { createCatalog } from "@json-ui/core";
import { z } from "zod";

/**
 * Minimal NC catalog demonstrating the "every input has a stable id" convention.
 */
export const ncStarterCatalog = createCatalog({
  components: {
    TextField: {
      props: z.object({
        id: z.string(),
        label: z.string(),
        placeholder: z.string().optional(),
        error: z.string().optional(),
      }),
      description: "Single-line text input. Writes to the staging buffer under `id`.",
    },
    Checkbox: {
      props: z.object({
        id: z.string(),
        label: z.string(),
      }),
      description: "Boolean toggle. Writes to the staging buffer under `id`.",
    },
    Button: {
      props: z.object({
        label: z.string(),
        action: z.any(),
      }),
      description: "Clickable button. If `action` is present, clicking fires an intent event.",
    },
  },
  actions: {
    submit_form: { description: "Submit the current form contents to the orchestrator." },
    cancel: { description: "Cancel the current action." },
  },
});
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/catalog/input-fields.ts
git commit -m "feat: NC starter catalog with id-required input schemas"
```

---

### Task 8: DynamicValue pre-resolver

**Goal:** Pure function that takes `action.params` and a staging snapshot, walks the params for `DynamicValue` entries (shaped `{path: "..."}`) that reference staging field IDs, and substitutes their values. Called by `makeActionHandlers` before firing an `IntentEvent`.

**Files:**
- Create: `src/renderer/resolve-dynamic.ts`
- Create: `src/renderer/resolve-dynamic.test.ts`

**Background:** A `DynamicValue` in JSON-UI is any object of shape `{ path: string }` embedded in action params. JSON-UI's own `resolveAction` resolves these against `DataProvider`. The NC pre-resolver handles a subset first: if the path matches a field ID in the staging snapshot, substitute the value in place. Other paths are left alone for JSON-UI's resolver to handle against `DataProvider`.

- [ ] **Step 1: Write failing test — plain params pass through unchanged**

Create `src/renderer/resolve-dynamic.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { preResolveDynamicParams } from "./resolve-dynamic";

describe("preResolveDynamicParams", () => {
  test("returns plain params unchanged when nothing is dynamic", () => {
    const params = { limit: 10, sort: "asc" };
    const result = preResolveDynamicParams(params, {});
    expect(result).toEqual({ limit: 10, sort: "asc" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/resolve-dynamic.test.ts
```

Expected: FAIL with "Cannot find module './resolve-dynamic'".

- [ ] **Step 3: Create `src/renderer/resolve-dynamic.ts`**

```typescript
import type { StagingSnapshot } from "../orchestrator/intent-event";

type DynamicValue = { path: string };

function isDynamic(value: unknown): value is DynamicValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof (value as { path: unknown }).path === "string" &&
    Object.keys(value as object).length === 1
  );
}

/**
 * Pre-resolve DynamicValue entries in action params against the staging snapshot.
 * Only paths that match a staging field ID are substituted; other paths are left
 * for JSON-UI's resolveAction to handle against DataProvider.
 */
export function preResolveDynamicParams(
  params: Record<string, unknown>,
  snapshot: StagingSnapshot,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (isDynamic(value) && Object.prototype.hasOwnProperty.call(snapshot, value.path)) {
      out[key] = snapshot[value.path];
    } else {
      out[key] = value;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/renderer/resolve-dynamic.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Add test — DynamicValue referencing a staging field is substituted**

Append:

```typescript
  test("substitutes a DynamicValue path when the path matches a staging field ID", () => {
    const params = { email: { path: "email" }, limit: 10 };
    const snapshot = { email: "dan@example.com" };
    const result = preResolveDynamicParams(params, snapshot);
    expect(result).toEqual({ email: "dan@example.com", limit: 10 });
  });
```

- [ ] **Step 6: Run and confirm pass**

Expected: PASS (2 tests).

- [ ] **Step 7: Add test — non-matching path is left alone**

Append:

```typescript
  test("leaves DynamicValue paths that do not match any staging field ID untouched", () => {
    const params = { userId: { path: "user/id" } };
    const snapshot = { email: "dan@example.com" };
    const result = preResolveDynamicParams(params, snapshot);
    expect(result).toEqual({ userId: { path: "user/id" } });
  });
```

- [ ] **Step 8: Run and confirm pass**

Expected: PASS (3 tests).

- [ ] **Step 9: Add test — objects with extra keys beyond `path` are not dynamic**

Append:

```typescript
  test("objects with extra keys beyond `path` are not treated as DynamicValue", () => {
    const params = { meta: { path: "email", label: "Email" } };
    const snapshot = { email: "x@y.z" };
    const result = preResolveDynamicParams(params, snapshot);
    expect(result).toEqual({ meta: { path: "email", label: "Email" } });
  });
```

- [ ] **Step 10: Run and confirm pass**

Expected: PASS (4 tests).

- [ ] **Step 11: Commit**

```bash
git add src/renderer/resolve-dynamic.ts src/renderer/resolve-dynamic.test.ts
git commit -m "feat: pre-resolve DynamicValue action params against staging buffer"
```

---

### Task 9: Action handlers factory (pure, testable in isolation)

**Goal:** Extract the per-intent action-handler construction into a pure, testable function. Given a catalog, a staging buffer, an `onIntent` callback, and an optional `catalogVersion`, it returns a `Record<actionName, (params) => void>` passable directly to `JSONUIProvider`. Isolating this keeps `NCRenderer` (Task 10) short and gives us hermetic tests for intent emission.

**Files:**
- Create: `src/renderer/action-handlers.ts`
- Create: `src/renderer/action-handlers.test.ts`

- [ ] **Step 1: Write failing test — handler emits IntentEvent with staging snapshot (Invariant 5)**

Create `src/renderer/action-handlers.test.ts`:

```typescript
import { describe, test, expect, vi } from "vitest";
import { createStagingBuffer } from "./staging-buffer";
import { makeActionHandlers } from "./action-handlers";
import { ncStarterCatalog } from "../catalog/input-fields";
import type { IntentEvent } from "../orchestrator/intent-event";

describe("makeActionHandlers", () => {
  test("returns a handler per catalog action that emits a full IntentEvent (Invariant 5)", () => {
    const buf = createStagingBuffer();
    buf.set("email", "dan@example.com");
    const onIntent = vi.fn();

    const handlers = makeActionHandlers({
      catalog: ncStarterCatalog,
      buffer: buf,
      onIntent,
      catalogVersion: "starter-0.1",
    });

    expect(Object.keys(handlers).sort()).toEqual(["cancel", "submit_form"]);

    handlers.submit_form!({});

    expect(onIntent).toHaveBeenCalledTimes(1);
    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    expect(event.action_name).toBe("submit_form");
    expect(event.action_params).toEqual({});
    expect(event.staging_snapshot).toEqual({ email: "dan@example.com" });
    expect(event.catalog_version).toBe("starter-0.1");
    expect(typeof event.timestamp).toBe("number");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/action-handlers.test.ts
```

Expected: FAIL with "Cannot find module './action-handlers'".

- [ ] **Step 3: Create `src/renderer/action-handlers.ts`**

```typescript
import type { Catalog } from "@json-ui/core";
import type { StagingBuffer } from "./staging-buffer";
import { preResolveDynamicParams } from "./resolve-dynamic";
import type { IntentEvent } from "../orchestrator/intent-event";

export interface MakeActionHandlersOptions {
  catalog: Catalog;
  buffer: StagingBuffer;
  onIntent: (event: IntentEvent) => void;
  catalogVersion?: string;
}

/**
 * Build a map of action-name -> handler for every action declared in the catalog.
 * Each handler:
 *   1. Captures the current staging snapshot.
 *   2. Pre-resolves DynamicValue params against the snapshot (Invariant 11).
 *   3. Emits a fully-formed IntentEvent to the onIntent callback (Invariant 5).
 *
 * The result is intended to be passed as JSONUIProvider's `actionHandlers` prop.
 * NOTE: backpressure (Invariant 10) is NOT implemented here — see plan honesty notes.
 */
export function makeActionHandlers({
  catalog,
  buffer,
  onIntent,
  catalogVersion,
}: MakeActionHandlersOptions): Record<string, (params: Record<string, unknown>) => void> {
  const handlers: Record<string, (params: Record<string, unknown>) => void> = {};
  for (const actionName of Object.keys(catalog.actions)) {
    handlers[actionName] = (params: Record<string, unknown>) => {
      const snapshot = buffer.snapshot();
      const resolvedParams = preResolveDynamicParams(params, snapshot);
      const event: IntentEvent = {
        action_name: actionName,
        action_params: resolvedParams,
        staging_snapshot: snapshot,
        catalog_version: catalogVersion,
        timestamp: Date.now(),
      };
      onIntent(event);
    };
  }
  return handlers;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/renderer/action-handlers.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Add failing test — action_params and staging_snapshot stay separate on collision (Invariant 6)**

Append:

```typescript
  test("action_params and staging_snapshot stay separate on key collision (Invariant 6)", () => {
    const buf = createStagingBuffer();
    buf.set("email", "user-typed@example.com");
    const onIntent = vi.fn();
    const handlers = makeActionHandlers({ catalog: ncStarterCatalog, buffer: buf, onIntent });

    handlers.submit_form!({ email: "llm-chose-this@example.com" });

    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    expect(event.action_params).toEqual({ email: "llm-chose-this@example.com" });
    expect(event.staging_snapshot).toEqual({ email: "user-typed@example.com" });
  });
```

- [ ] **Step 6: Run and confirm pass**

Expected: PASS (2 tests).

- [ ] **Step 7: Add failing test — DynamicValue pre-resolution (Invariant 11)**

Append:

```typescript
  test("pre-resolves DynamicValue params against the staging buffer (Invariant 11)", () => {
    const buf = createStagingBuffer();
    buf.set("email", "dan@example.com");
    const onIntent = vi.fn();
    const handlers = makeActionHandlers({ catalog: ncStarterCatalog, buffer: buf, onIntent });

    handlers.submit_form!({ to: { path: "email" } });

    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    expect(event.action_params).toEqual({ to: "dan@example.com" });
  });
```

- [ ] **Step 8: Run and confirm pass**

Expected: PASS (3 tests).

- [ ] **Step 9: Add failing test — Rule 4B (buffer is not cleared on flush)**

Append:

```typescript
  test("does not clear the staging buffer on flush (Rule 4B)", () => {
    const buf = createStagingBuffer();
    buf.set("email", "dan@example.com");
    buf.set("name", "Daniel");
    const onIntent = vi.fn();
    const handlers = makeActionHandlers({ catalog: ncStarterCatalog, buffer: buf, onIntent });

    handlers.submit_form!({});

    // Buffer contents must remain after flush.
    expect(buf.snapshot()).toEqual({ email: "dan@example.com", name: "Daniel" });
  });
```

- [ ] **Step 10: Run and confirm pass**

Expected: PASS (4 tests).

- [ ] **Step 11: Commit**

```bash
git add src/renderer/action-handlers.ts src/renderer/action-handlers.test.ts
git commit -m "feat: makeActionHandlers factory with Invariants 5, 6, 11 and Rule 4B"
```

---

### Task 10: NCRenderer wrapper with reconciliation on tree commit

**Goal:** The main `NCRenderer` React component. Wraps JSON-UI's `JSONUIProvider` + `Renderer`, provides the `StagingBufferProvider`, walks committed trees to drive reconciliation, and wires in `makeActionHandlers` from Task 9. Reconciliation is guarded by a `try/catch` so invalid trees (duplicate field IDs) are skipped rather than crashing the effect.

**Files:**
- Create: `src/renderer/nc-renderer.tsx`
- Create: `src/renderer/nc-renderer.test.tsx`

- [ ] **Step 1: Write failing test — NCRenderer renders a simple tree**

Create `src/renderer/nc-renderer.test.tsx`:

```typescript
import React from "react";
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UITree } from "@json-ui/core";
import { NCRenderer } from "./nc-renderer";
import { NCTextField, toRegistered } from "./input-fields";
import { useStagingBuffer } from "./staging-buffer-context";
import { ncStarterCatalog } from "../catalog/input-fields";

describe("NCRenderer", () => {
  test("renders a tree using the provided registry", () => {
    const tree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "TextField", props: { id: "email", label: "Email" } },
      },
    };
    const registry = { TextField: toRegistered(NCTextField) };
    render(
      <NCRenderer
        tree={tree}
        registry={registry}
        catalog={ncStarterCatalog}
        onIntent={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Email")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/nc-renderer.test.tsx
```

Expected: FAIL with "Cannot find module './nc-renderer'".

- [ ] **Step 3: Create `src/renderer/nc-renderer.tsx`**

```typescript
import React, { useEffect, useMemo, useRef } from "react";
import { Renderer, JSONUIProvider, type ComponentRegistry } from "@json-ui/react";
import type { UITree, Catalog } from "@json-ui/core";
import { StagingBufferProvider, useStagingBuffer } from "./staging-buffer-context";
import { collectFieldIds } from "./tree-walker";
import { makeActionHandlers } from "./action-handlers";
import type { IntentEvent } from "../orchestrator/intent-event";

export interface NCRendererProps {
  tree: UITree;
  registry: ComponentRegistry;
  catalog: Catalog;
  onIntent: (event: IntentEvent) => void;
  catalogVersion?: string;
}

/**
 * NCRenderer wraps JSON-UI's Renderer and adds:
 *   - staging buffer provider (Rule 1)
 *   - reconciliation after every successful tree commit (Rule 3, Risk 2)
 *   - action handlers that flush buffer snapshots into IntentEvents (Rule 4)
 *
 * Backpressure (Invariant 10) is NOT implemented at this layer. The follow-up
 * plan that wires the orchestrator will add a pending-Promise mechanism.
 */
export function NCRenderer(props: NCRendererProps) {
  return (
    <StagingBufferProvider>
      <NCRendererInner {...props} />
    </StagingBufferProvider>
  );
}

function NCRendererInner({
  tree,
  registry,
  catalog,
  onIntent,
  catalogVersion,
}: NCRendererProps) {
  const buf = useStagingBuffer();
  const lastReconciledTree = useRef<UITree | null>(null);

  useEffect(() => {
    if (tree === lastReconciledTree.current) {
      return;
    }
    try {
      const ids = collectFieldIds(tree);
      buf.reconcile(ids);
      lastReconciledTree.current = tree;
    } catch (error) {
      // Invariant 9 / Risk 2: if the tree is invalid (e.g., duplicate field ids),
      // skip reconciliation. The previous last-reconciled tree remains, and the
      // buffer is untouched. The user's typed input is preserved.
      console.warn("[NCRenderer] skipping reconciliation for invalid tree:", error);
    }
  }, [tree, buf]);

  const actionHandlers = useMemo(
    () => makeActionHandlers({ catalog, buffer: buf, onIntent, catalogVersion }),
    [catalog, buf, onIntent, catalogVersion],
  );

  return (
    <JSONUIProvider registry={registry} actionHandlers={actionHandlers} initialData={{}}>
      <Renderer tree={tree} registry={registry} />
    </JSONUIProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/renderer/nc-renderer.test.tsx
```

Expected: PASS (1 test).

- [ ] **Step 5: Add failing test — reconciliation drops buffer entries for absent fields, verified directly against the buffer (Invariant 1, hermetic)**

This test uses a Probe component registered in the JSON-UI registry. The Probe mounts inside NCRenderer's `StagingBufferProvider` context and writes the buffer reference to a module-level variable. Assertions run directly on `capturedBuf.get()` — not on the rendered input value, which would pass whether reconciliation worked or not (because `NCTextField` re-initializes from an empty buffer on remount).

This step has **three distinct file modifications** to `src/renderer/nc-renderer.test.tsx`:

**5a. Add one new import to the existing import block at the top of the file.** After the other `@json-ui/*` imports, add:

```typescript
import type { ComponentRenderProps } from "@json-ui/react";
```

The `useStagingBuffer` import is already present from Step 1 — do not re-import it.

**5b. Add module-level declarations immediately below the imports and above the first `describe` block.** These are shared by Task 10 Step 5, Task 10 Step 7, and all Task 11 tests.

```typescript
// Shared capture target for probe-based tests. Module-scoped so the probe
// component can write to it from within NCRenderer's provider tree.
let capturedBuf: ReturnType<typeof useStagingBuffer> | undefined;

function ProbeComponent(_props: ComponentRenderProps) {
  capturedBuf = useStagingBuffer();
  return null;
}
```

**5c. Append a new `describe` block at the end of the file.**

```typescript
describe("NCRenderer reconciliation", () => {
  test("reconciles the staging buffer after each tree commit (Invariant 1, hermetic)", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    capturedBuf = undefined;

    const registry = {
      TextField: toRegistered(NCTextField),
      Probe: ProbeComponent,
    };

    const treeWithEmail: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Container", props: {}, children: ["probe", "f1"] },
        probe: { key: "probe", type: "Probe", props: {} },
        f1: { key: "f1", type: "TextField", props: { id: "email", label: "Email" } },
      },
    };
    const treeWithoutEmail: UITree = {
      root: "r2",
      elements: {
        r2: { key: "r2", type: "Container", props: {}, children: ["probe2", "f2"] },
        probe2: { key: "probe2", type: "Probe", props: {} },
        f2: { key: "f2", type: "TextField", props: { id: "other", label: "Other" } },
      },
    };

    const { rerender } = render(
      <NCRenderer tree={treeWithEmail} registry={registry} catalog={ncStarterCatalog} onIntent={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("Email"), "dan@example.com");
    expect(capturedBuf).toBeDefined();
    expect(capturedBuf!.get("email")).toBe("dan@example.com");

    rerender(
      <NCRenderer tree={treeWithoutEmail} registry={registry} catalog={ncStarterCatalog} onIntent={vi.fn()} />,
    );

    // Direct assertion on buffer state: reconciliation ran and dropped "email".
    expect(capturedBuf!.get("email")).toBeUndefined();
    expect(capturedBuf!.snapshot()).toEqual({});
  });
});
```

- [ ] **Step 6: Run and confirm pass**

```bash
npx vitest run src/renderer/nc-renderer.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 7: Add failing test — firing an action emits an IntentEvent with the staging snapshot (integration check)**

The core intent-emission logic is already unit-tested in Task 9's `makeActionHandlers` tests. This integration test verifies NCRenderer correctly wires those handlers through `JSONUIProvider` by clicking a rendered button.

Append:

```typescript
describe("NCRenderer action integration", () => {
  test("firing a catalog action emits an IntentEvent with staging_snapshot and action_params", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const onIntent = vi.fn();
    const NCButton = ({ element, onAction }: ComponentRenderProps<{ label: string; action: unknown }>) => (
      <button onClick={() => onAction?.(element.props.action as never)}>{element.props.label}</button>
    );
    const registry = {
      TextField: toRegistered(NCTextField),
      Button: NCButton,
    };
    const tree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Container", props: {}, children: ["f1", "b1"] },
        f1: { key: "f1", type: "TextField", props: { id: "email", label: "Email" } },
        b1: {
          key: "b1",
          type: "Button",
          props: { label: "Submit", action: { name: "submit_form", params: {} } },
        },
      },
    };

    render(
      <NCRenderer tree={tree} registry={registry} catalog={ncStarterCatalog} onIntent={onIntent} />,
    );
    await user.type(screen.getByLabelText("Email"), "dan@example.com");
    await user.click(screen.getByText("Submit"));

    expect(onIntent).toHaveBeenCalledTimes(1);
    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    expect(event.action_name).toBe("submit_form");
    expect(event.staging_snapshot).toEqual({ email: "dan@example.com" });
  });
});
```

- [ ] **Step 8: Run and confirm pass**

Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/nc-renderer.tsx src/renderer/nc-renderer.test.tsx
git commit -m "feat: NCRenderer wrapper with hermetic reconciliation test and intent integration"
```

---

### Task 11: Renderer-level Invariant 3 + invalid-tree safety + orchestrator isolation

**Goal:** Close three remaining gaps — Invariant 3 at the renderer level (same ID with different props preserves the buffered value), Invariant 9 / Risk 2 (invalid-tree reconciliation skip, tested hermetically via a spy on `reconcile`), and Invariant 7 (orchestrator isolation enforced by a file-content test).

**Files:**
- Modify: `src/renderer/nc-renderer.test.tsx` (append two new tests that reuse the module-level `capturedBuf` and `ProbeComponent` from Task 10 Step 5)
- Create: `src/renderer/orchestrator-isolation.test.ts`

- [ ] **Step 1: Add failing test — same ID with different props preserves buffer (Invariant 3, renderer-level)**

The spec's motivating example for Invariant 3 is "the LLM adds an `error: 'Invalid email'` prop to the same field id; the user's typed value must survive." This test exercises exactly that.

Append to `src/renderer/nc-renderer.test.tsx`:

```typescript
describe("NCRenderer props-agnostic reconciliation", () => {
  test("preserves buffer entries when the same field is re-emitted with different props (Invariant 3, renderer-level)", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    capturedBuf = undefined;

    const registry = {
      TextField: toRegistered(NCTextField),
      Probe: ProbeComponent,
    };

    const initialTree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Container", props: {}, children: ["probe", "f1"] },
        probe: { key: "probe", type: "Probe", props: {} },
        f1: { key: "f1", type: "TextField", props: { id: "email", label: "Email" } },
      },
    };
    const errorTree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Container", props: {}, children: ["probe", "f1"] },
        probe: { key: "probe", type: "Probe", props: {} },
        f1: {
          key: "f1",
          type: "TextField",
          props: { id: "email", label: "Email", error: "Invalid email" },
        },
      },
    };

    const { rerender } = render(
      <NCRenderer tree={initialTree} registry={registry} catalog={ncStarterCatalog} onIntent={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    expect(capturedBuf!.get("email")).toBe("user@example.com");

    rerender(
      <NCRenderer tree={errorTree} registry={registry} catalog={ncStarterCatalog} onIntent={vi.fn()} />,
    );

    // Same id, different props → buffer must still have the typed value.
    expect(capturedBuf!.get("email")).toBe("user@example.com");
    // And the error prop should be visible in the DOM.
    expect(screen.getByRole("alert").textContent).toBe("Invalid email");
  });
});
```

- [ ] **Step 2: Run and confirm pass**

```bash
npx vitest run src/renderer/nc-renderer.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 3: Add failing test — invalid tree (duplicate ids) skips reconciliation (Invariant 9, hermetic via spy)**

This test installs a spy on `reconcile` and asserts the spy was never called with the invalid tree's field IDs. Even if React's error handling changed in a future version, the spy assertion directly verifies whether reconciliation ran or not — no reliance on observable DOM side effects.

Append:

```typescript
describe("NCRenderer invalid-tree safety", () => {
  test("skips reconciliation when the tree has duplicate field ids (Invariant 9, hermetic)", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    capturedBuf = undefined;

    const registry = {
      TextField: toRegistered(NCTextField),
      Probe: ProbeComponent,
    };

    const validTree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Container", props: {}, children: ["probe", "f1"] },
        probe: { key: "probe", type: "Probe", props: {} },
        f1: { key: "f1", type: "TextField", props: { id: "email", label: "Email" } },
      },
    };
    const invalidTree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Container", props: {}, children: ["probe", "a", "b"] },
        probe: { key: "probe", type: "Probe", props: {} },
        a: { key: "a", type: "TextField", props: { id: "dup", label: "A" } },
        b: { key: "b", type: "TextField", props: { id: "dup", label: "B" } },
      },
    };

    const { rerender } = render(
      <NCRenderer tree={validTree} registry={registry} catalog={ncStarterCatalog} onIntent={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("Email"), "preserved");
    expect(capturedBuf!.get("email")).toBe("preserved");

    // Spy on reconcile. If the invalid-tree guard in NCRenderer is removed,
    // this spy will record a call with ids containing "dup".
    const reconcileSpy = vi.spyOn(capturedBuf!, "reconcile");

    // Swallow React's warn logging for the expected error.
    const warn = console.warn;
    console.warn = () => {};
    try {
      rerender(
        <NCRenderer tree={invalidTree} registry={registry} catalog={ncStarterCatalog} onIntent={vi.fn()} />,
      );
    } finally {
      console.warn = warn;
    }

    // The spy must not have been called with any set containing "dup".
    for (const call of reconcileSpy.mock.calls) {
      const ids = call[0] as Set<string>;
      expect(ids.has("dup")).toBe(false);
    }
    // And the buffer contents survive the invalid-tree attempt.
    expect(capturedBuf!.get("email")).toBe("preserved");
  });
});
```

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run src/renderer/nc-renderer.test.tsx
```

Expected: PASS (5 tests). If the invalid-tree guard in NCRenderer were removed, `reconcileSpy` would record a call with `ids.has("dup") === true` and the `expect(...).toBe(false)` assertion would fail, turning the test red.

- [ ] **Step 5: Create `src/renderer/orchestrator-isolation.test.ts` — Invariant 7**

The spec explicitly commits to enforcing orchestrator isolation "by test or lint rule." This test reads every file under `src/orchestrator/` and asserts none of them import from the renderer's internal modules.

```typescript
import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield full;
    }
  }
}

describe("orchestrator isolation (Invariant 7)", () => {
  test("no file under src/orchestrator imports from the renderer's staging-buffer module", () => {
    const offenders: string[] = [];
    const forbidden = [
      "renderer/staging-buffer",
      "renderer/staging-buffer-context",
      "renderer/tree-walker",
      "renderer/resolve-dynamic",
      "renderer/action-handlers",
      "renderer/nc-renderer",
      "renderer/input-fields",
    ];
    for (const file of walk("src/orchestrator")) {
      const content = readFileSync(file, "utf-8");
      for (const bad of forbidden) {
        if (content.includes(bad)) {
          offenders.push(`${file} imports ${bad}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 6: Run and confirm pass**

```bash
npx vitest run src/renderer/orchestrator-isolation.test.ts
```

Expected: PASS (1 test). The orchestrator directory currently contains only `intent-event.ts` with no internal imports, so no forbidden string appears. Any future orchestrator file that imports from a renderer internal will turn this test red.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/nc-renderer.test.tsx src/renderer/orchestrator-isolation.test.ts
git commit -m "test: Invariant 3 (renderer-level), Invariant 9 (hermetic spy), Invariant 7 (orchestrator isolation)"
```

---

### Task 12: Public exports and end-to-end integration test

**Goal:** Create the barrel export at `src/renderer/index.ts`, update `src/index.ts` to re-export the public surface, and add one end-to-end smoke test that exercises the full flow: render → type → click action → receive IntentEvent with the staging snapshot.

**Files:**
- Create: `src/renderer/index.ts`
- Modify: `src/index.ts`
- Create: `src/integration.test.tsx`

- [ ] **Step 1: Create `src/renderer/index.ts`**

```typescript
// Public exports for the NC renderer wrapper.
export { NCRenderer, type NCRendererProps } from "./nc-renderer";

export {
  StagingBufferProvider,
  useStagingBuffer,
  type StagingBufferProviderProps,
} from "./staging-buffer-context";

export { createStagingBuffer, type StagingBuffer } from "./staging-buffer";

export {
  NCTextField,
  NCCheckbox,
  toRegistered,
  type NCTextFieldProps,
  type NCCheckboxProps,
} from "./input-fields";

export { collectFieldIds, DuplicateFieldIdError } from "./tree-walker";

export { preResolveDynamicParams } from "./resolve-dynamic";

export {
  makeActionHandlers,
  type MakeActionHandlersOptions,
} from "./action-handlers";
```

- [ ] **Step 2: Replace `src/index.ts` with a real barrel**

```typescript
// Neural Computer runtime — public entry point.
// See docs/ for design specs.

export * from "./renderer";
export type {
  FieldId,
  StagingSnapshot,
  IntentEvent,
} from "./orchestrator/intent-event";
export { ncStarterCatalog } from "./catalog/input-fields";
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Create end-to-end integration test at `src/integration.test.tsx`**

```typescript
import React from "react";
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UITree } from "@json-ui/core";
import type { ComponentRenderProps } from "@json-ui/react";
import {
  NCRenderer,
  NCTextField,
  NCCheckbox,
  toRegistered,
  ncStarterCatalog,
  type IntentEvent,
} from "./index";

describe("integration: render -> type -> intent", () => {
  test("end-to-end flow emits a complete IntentEvent", async () => {
    const user = userEvent.setup();
    const onIntent = vi.fn();
    const NCButton = ({ element, onAction }: ComponentRenderProps<{ label: string; action: unknown }>) => (
      <button onClick={() => onAction?.(element.props.action as never)}>{element.props.label}</button>
    );
    const registry = {
      TextField: toRegistered(NCTextField),
      Checkbox: toRegistered(NCCheckbox),
      Button: NCButton,
    };
    const tree: UITree = {
      root: "r",
      elements: {
        r: { key: "r", type: "Container", props: {}, children: ["f1", "f2", "b1"] },
        f1: { key: "f1", type: "TextField", props: { id: "name", label: "Name" } },
        f2: { key: "f2", type: "Checkbox", props: { id: "subscribe", label: "Subscribe" } },
        b1: {
          key: "b1",
          type: "Button",
          props: { label: "Submit", action: { name: "submit_form", params: {} } },
        },
      },
    };

    render(
      <NCRenderer
        tree={tree}
        registry={registry}
        catalog={ncStarterCatalog}
        catalogVersion="starter-0.1"
        onIntent={onIntent}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Daniel");
    await user.click(screen.getByLabelText("Subscribe"));
    await user.click(screen.getByText("Submit"));

    expect(onIntent).toHaveBeenCalledTimes(1);
    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    expect(event.action_name).toBe("submit_form");
    expect(event.action_params).toEqual({});
    expect(event.staging_snapshot).toEqual({ name: "Daniel", subscribe: true });
    expect(event.catalog_version).toBe("starter-0.1");
    expect(typeof event.timestamp).toBe("number");
  });
});
```

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: PASS — all prior tests plus the new integration test. Approximately 30 tests total across all files.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.ts src/index.ts src/integration.test.tsx
git commit -m "feat: public exports + end-to-end integration smoke test"
```

---

## Self-Review

**Spec coverage (honest):**

| Spec element | Covered by | Notes |
|---|---|---|
| Rule 1 (Ownership) | Task 5 | `StagingBufferProvider` owns buffer in `useRef` |
| Rule 2 (Keying: id required) | Tasks 4, 7 | Walker reads `props.id`; catalog requires `id: z.string()` |
| Rule 3 (Reconciliation, buffer-level) | Task 3 step 13 | Buffer preserves across repeated reconcile with same ID set |
| Rule 3 (Reconciliation, renderer-level) | Task 11 step 1 | Same-id-different-props test with `error` prop added |
| Rule 4 (Flush on intent) | Task 9 | `makeActionHandlers` emits full IntentEvent |
| Rule 4A (action_params / staging_snapshot separate) | Task 9 step 5 | Direct collision test |
| Rule 4B (buffer not cleared on flush) | Task 9 step 9 | Direct assertion after flush |
| Risk 1 (LLM acceptance) | Out of scope | Prompt engineering; lives in a catalog-prompting spec |
| Risk 2 (invalid-tree reconciliation skip) | Task 11 step 3 | Spy-based hermetic test |
| Risk 2 (partial streaming) | **DEFERRED** | Requires JSON-UI streaming API not yet present |
| Risk 3 (unmount) | Non-goal | Explicitly documented in spec |
| DynamicValue pre-resolution | Tasks 8, 9 step 7 | Pure function + handler integration |
| NC implements all inputs | Task 6 | NCTextField, NCCheckbox, plus toRegistered adapter |
| Invariant 1 (reconcile drops) | Tasks 3 step 9, 10 step 5 | Buffer and renderer level |
| Invariant 2 (reconcile preserves presence) | Task 3 step 11 | Buffer level |
| Invariant 3 (props-agnostic keying) | Tasks 3 step 13, 11 step 1 | Buffer level + renderer level |
| Invariant 4 (snapshot non-destructive) | Task 3 step 7 | |
| Invariant 5 (full snapshot in intent) | Task 9 step 1 | |
| Invariant 6 (action_params vs staging_snapshot) | Task 9 step 5 | Direct collision test |
| Invariant 7 (orchestrator isolation) | Task 11 step 5 | File-content test (grep-style) |
| Invariant 8 (duplicate ids throw) | Task 4 step 13 | Built into tree walker |
| Invariant 9 (invalid-tree safety) | Task 11 step 3 | Spy-based hermetic test |
| Invariant 10 (backpressure rejection) | **DEFERRED** | Cannot implement at renderer layer alone — requires orchestrator cooperation |
| Invariant 11 (DynamicValue before resolveAction) | Task 9 step 7 | Pre-resolution happens in action handler before JSON-UI's resolveAction |

**Explicitly deferred (not silently dropped):**

- **Invariant 10 (backpressure rejection).** A synchronous in-flight flag is vacuous in React's event loop: any second click dispatches after the first handler's synchronous `finally` has already cleared the flag. Real backpressure requires tracking the orchestrator's response Promise, which is orchestrator-owned state this plan does not touch. Follow-up: the orchestrator-integration plan will add a pending-intent Promise and wire the rejection through it.
- **Risk 2 streaming sub-case.** Requires a JSON-UI streaming API that does not exist yet. The current implementation handles the discrete invalid-tree case (duplicate field IDs) but not mid-stream commit failures.

**Architecture invariants verified:**

- `collectFieldIds(tree): Set<FieldId>` and `buf.reconcile(Set<FieldId>)` — types match across Tasks 3, 4, 10.
- `makeActionHandlers` returns `Record<string, (params: Record<string, unknown>) => void>` — compatible with JSON-UI's `JSONUIProvider.actionHandlers` prop type (verified against `packages/react/src/renderer.tsx:147-150` in the upstream repo: `Record<string, (params: Record<string, unknown>) => Promise<unknown> | unknown>` — a `void`-returning function is assignable to `unknown`-returning).
- **`NCTextField` / `NCCheckbox` are direct-props components wrapped via `toRegistered` before being placed in a JSON-UI registry.** This is critical: registering direct-props components without the adapter would give every prop value `undefined` at runtime, because JSON-UI's `Renderer` invokes registered components with `ComponentRenderProps` (`{ element, onAction, children, loading }`), not with the component's direct props. An earlier draft of this plan had this bug silently — fixed by introducing the adapter.
- React hooks compliance: `useRef` for buffer identity stability, `useMemo` for handler stability with `[catalog, buf, onIntent, catalogVersion]` dep array, `useEffect` for reconciliation with `[tree, buf]` dep array wrapped in `try/catch`. `NCTextField` has no sync `useEffect` (removed as unnecessary — reconciliation + component remount handles out-of-band eviction cleanly).

**TDD honesty:**

- Task 3 steps 5-14 are labeled **invariant-lock tests** in their step headings rather than strict red-green cycles. The initial implementation in Step 3 satisfies them all by construction. The task's opening paragraph documents this explicitly.
- Task 4 step 13 (duplicate-id enforcement) is likewise an invariant lock because the uniqueness check is built into the walker from Step 3.
- All other tasks follow proper red-green cycles: the first test in each file fails on a nonexistent module, the implementation makes it pass, and subsequent tests exercise behaviors that were not trivially satisfied by the first implementation.

**Reconciliation test hermeticity:**

- The Task 10 Step 5 reconciliation test and all Task 11 tests use a `ProbeComponent` registered in the NCRenderer's component registry. The probe mounts inside the `StagingBufferProvider` context and captures a live buffer reference to a module-level variable. Assertions then read the buffer directly via `capturedBuf.get(id)` and `capturedBuf.snapshot()`, rather than inferring reconciliation from rendered-input side effects. An earlier draft inferred via `input.value === ""`, which would pass whether reconciliation worked or not (because `NCTextField` re-initializes from an empty buffer on remount).
- The Task 11 Step 3 invalid-tree test uses `vi.spyOn(capturedBuf, "reconcile")` to verify directly that reconciliation was not called with the invalid tree's field IDs. This makes the red-green cycle hermetic: removing the `try/catch` guard in `NCRenderer` would cause the spy to record a call containing `"dup"`, turning the `expect(ids.has("dup")).toBe(false)` assertion red.

---

## What's done after this plan

After Task 12 commits cleanly:

- `neural-computer` has a working `NCRenderer` component that wraps JSON-UI, owns a staging buffer, walks trees for reconciliation, intercepts actions via the pure `makeActionHandlers` factory, emits fully-formed `IntentEvent`s with pre-resolved params and full staging snapshots, refuses to reconcile invalid trees, and preserves typed input across prop-only re-emissions.
- Approximately 30 tests across pure units, component integration, hermetic spy-based reconciliation tests, and file-content orchestrator-isolation assertions cover every spec invariant this plan claims to implement. The two spec elements this plan does not implement (Invariant 10 backpressure, Risk 2 streaming sub-case) are explicitly deferred in the Self-Review section and the deferrals are architectural — not handwaves.
- The orchestrator loop, LLM invocation, Python subprocess dispatch, memoryjs transactions, and the full backpressure mechanism are deferred to separate follow-up specs.
- `src/index.ts` exports the public surface. The next plan can import `NCRenderer` and begin wiring it to a real orchestrator.
