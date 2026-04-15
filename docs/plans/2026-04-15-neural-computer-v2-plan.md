# Neural Computer v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task lists its recommended model (Sonnet or Opus — no Haiku). The two-stage review step that subagent-driven-development provides runs after every task.

**Goal:** Build the Neural Computer runtime as a thin orchestration layer on top of the already-shipped JSON-UI and memoryjs primitives. NC wraps `@json-ui/react`'s `JSONUIProvider` with a memoryjs-backed `ObservableDataModel` + a shared `StagingBuffer`, handles catalog-declared intents by dispatching to an LLM (Anthropic SDK), and mounts its own NC-authored input components.

**Architecture:** Path C (dual-backend). `@json-ui/react` renders the UI for the user while sharing one `StagingBuffer` and one `ObservableDataModel` with a parallel `@json-ui/headless` renderer session used by the LLM Observer layer. Durable state lives in memoryjs; the adapter projects it into a flat `Record<string, JSONValue>` view for `DataProvider`. NC owns the orchestrator loop, the backpressure in-flight flag, the streaming commit policy, and the LLM integration. Every staging-buffer, reconciliation, field-ID-uniqueness, and DynamicValue-resolution primitive that the April 11 spec required NC to build is now shipped by `@json-ui/core` / `@json-ui/react` and is imported directly — this plan is roughly 60% smaller than the stale April 11 version because those primitives no longer need to be hand-rolled.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React 19, `@json-ui/core` ^0.1.0, `@json-ui/react` ^0.1.0, `@danielsimonjr/memoryjs` ^1.10.0, `@anthropic-ai/sdk` ^0.65.0, Zod 4, Vitest 4 (jsdom env), tsup.

**Supersedes:** `docs/plans/2026-04-11-ephemeral-ui-state-plan.md` (stale — written before JSON-UI Plans 1/2/3 and memoryjs 1.10.0 shipped the primitives that plan hand-rolled).

**Prerequisites verified (2026-04-15):**

- `@json-ui/core` 0.1.0 ships `StagingBuffer`, `ObservableDataModel`, `IntentEvent`, `FieldId`, `JSONValue`, `createCatalog`, `generateCatalogPrompt`, `collectFieldIds`, `validateUniqueFieldIds`, `resolveActionWithStaging`, `preResolveDynamicParams`.
- `@json-ui/react` 0.1.0 ships `JSONUIProvider` with `store` / `stagingStore` / `onIntent` / `catalogVersion` props, `StagingProvider` + `useStaging` / `useStagingField` / `useStagingSnapshot`, `DataProvider` external-store mode, `ActionProvider` with staging-aware execute, `useUIStream` with `commitMode: "atomic"`.
- `@json-ui/headless` 0.1.0 ships `createHeadlessRenderer`, `createHeadlessContext`, `walkTree`, serializers, `collectFieldIds` re-export.
- `@danielsimonjr/memoryjs` 1.10.0 ships `createObservableDataModelFromGraph(storage, { projection })`, `ReadOnlyMemoryGraphDataError`, `GraphStorage.cachedGraph`, `ManagerContext`, `GovernanceManager.withTransaction`, `AuditLog`.
- NC repo is scaffolded: `package.json` with dependencies, `tsconfig.json` with strict mode, `src/index.ts` placeholder, `docs/specs/2026-04-11-ephemeral-ui-state-design.md`.

---

## Critical Conventions

1. **TypeScript strict + `noUncheckedIndexedAccess: true`.** Already enabled in `tsconfig.json`. Every `tree.elements[key]` is `T | undefined`. Use `!` only when prior logic has verified existence.

2. **Direct-to-`main` git model.** NC is pre-alpha; no PR workflow yet. Commit per task and push when the plan finishes. Each commit message starts with `feat:` / `fix:` / `test:` / `chore:` / `docs:`.

3. **No emojis in code, comments, commit messages, or documentation output.** Per `AGENTS.md`.

4. **Import from published package names, not relative paths.** `@json-ui/core`, `@json-ui/react`, `@danielsimonjr/memoryjs`. Local dev uses `npm link` or `file:` deps; neither affects the import statements.

5. **NC owns the backpressure in-flight flag and the LLM acceptance contract** (Invariants 10 and Risk 1 in the ephemeral-UI-state spec). The libraries correctly do NOT implement these — they are orchestration concerns.

6. **NC uses `useUIStream` in `"atomic"` mode** (NC Invariant 9 — reconcile only on successful tree commits). The default `"streaming"` mode publishes partial trees and is unsafe for staging reconciliation.

7. **Input components write to the staging buffer via `useStagingField`; display components read durable state via `useDataValue`.** These two surfaces are orthogonal and must stay so.

8. **Durable state is written ONLY via memoryjs transactions called from the orchestrator.** The React `DataProvider` bound to the memoryjs adapter is read-only at the `set`/`delete` boundary — the adapter throws `ReadOnlyMemoryGraphDataError`. User intent → staging buffer → IntentEvent → orchestrator → memoryjs transaction → durable state update → adapter re-projects → React re-renders.

9. **Buffer isolation (Invariant 7).** The orchestrator module (`src/orchestrator/`) MUST NOT import from `src/renderer/` or from `@json-ui/react`'s staging primitives. The orchestrator only sees `IntentEvent` objects. Task 12 adds an ESLint rule enforcing this.

---

## File Structure

```
neural-computer/
├── src/
│   ├── index.ts                          # public barrel — Task 13
│   ├── types/
│   │   ├── index.ts                      # re-export barrel
│   │   └── nc-types.ts                   # NC-specific types — Task 2
│   ├── catalog/
│   │   ├── index.ts
│   │   └── nc-catalog.ts                 # createCatalog wrapper + schemas — Task 3
│   ├── renderer/
│   │   ├── index.ts
│   │   ├── input-components.tsx          # NCTextField, NCCheckbox, etc. — Task 4
│   │   ├── nc-renderer.tsx               # NCRenderer React wrapper — Task 8
│   │   └── use-committed-tree.ts         # atomic-mode useUIStream wrapper — Task 9
│   ├── memory/
│   │   ├── index.ts
│   │   └── projection.ts                 # GraphProjection function — Task 5
│   ├── runtime/
│   │   ├── index.ts
│   │   └── context.ts                    # createNCRuntime factory — Task 6
│   ├── orchestrator/                     # pure intent handling — NO React imports (Invariant 7)
│   │   ├── index.ts
│   │   └── handle-intent.ts              # intent dispatcher (LLM stub) — Task 7
│   ├── app/                              # React mounting — imports from renderer + orchestrator
│   │   ├── index.ts
│   │   └── nc-app.tsx                    # top-level NCApp component — Task 10
│   └── integration.test.tsx              # end-to-end test — Task 11
├── .eslintrc.cjs                         # buffer-isolation lint rule — Task 12
├── vitest.config.ts                      # Task 1
├── tsup.config.ts                        # Task 1
└── package.json                          # Task 1 (dep bump)
```

---

## Task 1: Scaffold — dep bump, build, test, lint configs

**Model:** Sonnet
**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tsup.config.ts`
- Create: `.eslintrc.cjs` (empty ESLint root — Task 12 will add rules)

- [ ] **Step 1: Bump memoryjs dep to 1.10.0**

Edit `package.json`:

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.65.0",
    "@danielsimonjr/memoryjs": "^1.10.0",
    "@json-ui/core": "^0.1.0",
    "@json-ui/react": "^0.1.0",
    "react": "^19.0.0",
    "zod": "^4.0.0"
  }
}
```

- [ ] **Step 2: Add missing devDep — react-dom for jsdom rendering**

`@testing-library/react` is already present in `package.json`. It requires `react-dom` at runtime for jsdom rendering, so add it as a devDep:

```json
    "react-dom": "^19.0.0"
```

- [ ] **Step 3: Run `npm install` to pull the new versions**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npm install`
Expected: exits 0. `node_modules/@danielsimonjr/memoryjs/dist/index.d.ts` contains `createObservableDataModelFromGraph`.

Verify: `grep "createObservableDataModelFromGraph" node_modules/@danielsimonjr/memoryjs/dist/index.d.ts`
Expected: at least one match.

- [ ] **Step 4: Create `vitest.config.ts`**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: [],
  },
});
```

- [ ] **Step 5: Create `tsup.config.ts`**

Create `tsup.config.ts`:

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
});
```

- [ ] **Step 6: Create an empty `.eslintrc.cjs` root (Task 12 fills it in)**

Create `.eslintrc.cjs`:

```javascript
// Root ESLint config. Buffer-isolation rule added in Task 12.
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: ["@typescript-eslint"],
  extends: [],
  rules: {},
  ignorePatterns: ["dist", "node_modules", "coverage", "docs"],
};
```

- [ ] **Step 7: Verify typecheck and test run cleanly on the placeholder src/index.ts**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npm run typecheck`
Expected: exits 0, no output.

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npm test`
Expected: exits 0. "No test files found" is acceptable for the placeholder state.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add package.json package-lock.json vitest.config.ts tsup.config.ts .eslintrc.cjs
git commit -m "chore: scaffold vitest, tsup, eslint configs + bump memoryjs to 1.10.0"
```

---

## Task 2: NC core type definitions

**Model:** Sonnet
**Files:**
- Create: `src/types/nc-types.ts`
- Create: `src/types/index.ts`
- Create: `src/types/nc-types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/types/nc-types.test.ts`:

```typescript
import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  NCIntentHandler,
  NCRuntime,
  NCCatalogVersion,
} from "./nc-types";
import type { IntentEvent, StagingBuffer, ObservableDataModel } from "@json-ui/core";

describe("NC core types", () => {
  it("NCIntentHandler is an async function taking IntentEvent", () => {
    expectTypeOf<NCIntentHandler>().toEqualTypeOf<
      (event: IntentEvent) => Promise<void>
    >();
  });

  it("NCRuntime exposes stagingBuffer, durableStore, emitIntent, setIntentHandler, destroy", () => {
    expectTypeOf<NCRuntime>().toHaveProperty("stagingBuffer").toEqualTypeOf<StagingBuffer>();
    expectTypeOf<NCRuntime>().toHaveProperty("durableStore").toEqualTypeOf<ObservableDataModel>();
    expectTypeOf<NCRuntime>().toHaveProperty("emitIntent").toEqualTypeOf<
      (event: IntentEvent) => Promise<void>
    >();
    expectTypeOf<NCRuntime>().toHaveProperty("setIntentHandler").toEqualTypeOf<
      (handler: NCIntentHandler) => void
    >();
    expectTypeOf<NCRuntime>().toHaveProperty("destroy").toEqualTypeOf<() => void>();
  });

  it("NCCatalogVersion is a string brand", () => {
    const v: NCCatalogVersion = "nc-starter-0.1" as NCCatalogVersion;
    expect(typeof v).toBe("string");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/types/nc-types.test.ts`
Expected: FAIL with "Cannot find module './nc-types'".

- [ ] **Step 3: Create `src/types/nc-types.ts`**

Create `src/types/nc-types.ts`:

```typescript
import type {
  IntentEvent,
  StagingBuffer,
  ObservableDataModel,
} from "@json-ui/core";

/**
 * An NC intent handler receives a fully-formed IntentEvent from the
 * React layer (via ActionProvider.onIntent) and is responsible for
 * composing the observation, invoking the LLM, and applying any
 * resulting dispatches (memoryjs transactions, new UI tree, Python
 * subprocess calls, etc.). Returns a promise that resolves when the
 * intent has been fully processed — the orchestrator uses this for
 * backpressure tracking.
 */
export type NCIntentHandler = (event: IntentEvent) => Promise<void>;

/**
 * Nominal string brand for a catalog version. NC threads this through
 * every emitted IntentEvent.catalog_version so the orchestrator can
 * validate that the LLM's tree emissions match the catalog version in
 * effect at emission time.
 */
export type NCCatalogVersion = string & { readonly __brand: "NCCatalogVersion" };

/**
 * The NC runtime — a handle to the shared state references and the
 * intent-dispatch entry point. Created once per process via
 * createNCRuntime and passed down to NCRenderer and the orchestrator
 * loop. The staging buffer and durable store are shared references
 * between the React renderer, the LLM Observer (headless renderer,
 * planned), and the orchestrator's memoryjs transactions.
 *
 * The intent handler is bound LAZILY via setIntentHandler, not at
 * construction time. This matches React's useEffect lifecycle: the
 * runtime is created synchronously at app start, but the setTree
 * reference the stub handler needs only exists after the React app
 * mounts and useState runs. NCApp handles this wiring internally so
 * most callers never touch setIntentHandler directly.
 */
export interface NCRuntime {
  /** Shared staging buffer for in-progress user input. */
  stagingBuffer: StagingBuffer;
  /** Memoryjs-backed (or in-memory) ObservableDataModel for durable state. */
  durableStore: ObservableDataModel;
  /**
   * Emit an IntentEvent through NC's backpressure gate. Rejects the
   * event synchronously (and logs) if another intent is already in
   * flight. Returns when the currently-bound handler has finished.
   * If no handler has been bound via setIntentHandler, logs a warning
   * and returns immediately without processing.
   */
  emitIntent: (event: IntentEvent) => Promise<void>;
  /**
   * Install (or replace) the intent handler. The React app calls
   * this in a useEffect after useState has provided a setTree
   * reference that the handler can capture. Installing a second
   * handler replaces the first immediately; any in-flight intent
   * continues to run with the old handler until it resolves.
   */
  setIntentHandler: (handler: NCIntentHandler) => void;
  /** Release resources. Idempotent. */
  destroy: () => void;
}
```

- [ ] **Step 4: Create `src/types/index.ts` barrel**

Create `src/types/index.ts`:

```typescript
export type {
  NCIntentHandler,
  NCCatalogVersion,
  NCRuntime,
} from "./nc-types";
```

- [ ] **Step 5: Run tests**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/types/nc-types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/types/nc-types.ts src/types/index.ts src/types/nc-types.test.ts
git commit -m "feat(types): add NC core type definitions (NCRuntime, NCIntentHandler, NCCatalogVersion)"
```

---

## Task 3: NC catalog with id-required input schemas

**Model:** Sonnet
**Files:**
- Create: `src/catalog/nc-catalog.ts`
- Create: `src/catalog/index.ts`
- Create: `src/catalog/nc-catalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/catalog/nc-catalog.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ncStarterCatalog, NC_CATALOG_VERSION } from "./nc-catalog";

describe("ncStarterCatalog", () => {
  it("has a non-empty version string", () => {
    expect(typeof NC_CATALOG_VERSION).toBe("string");
    expect(NC_CATALOG_VERSION.length).toBeGreaterThan(0);
  });

  it("declares the standard NC input + display components", () => {
    expect(ncStarterCatalog.hasComponent("Container")).toBe(true);
    expect(ncStarterCatalog.hasComponent("Text")).toBe(true);
    expect(ncStarterCatalog.hasComponent("TextField")).toBe(true);
    expect(ncStarterCatalog.hasComponent("Checkbox")).toBe(true);
    expect(ncStarterCatalog.hasComponent("Button")).toBe(true);
  });

  it("declares submit_form and cancel actions", () => {
    expect(ncStarterCatalog.hasAction("submit_form")).toBe(true);
    expect(ncStarterCatalog.hasAction("cancel")).toBe(true);
  });

  it("validates a clean tree with an input component carrying an id prop", () => {
    const tree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Container",
          props: {},
          children: ["email-field"],
        },
        "email-field": {
          key: "email-field",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
      },
    };
    const result = ncStarterCatalog.validateTree(tree);
    expect(result.success).toBe(true);
  });

  it("rejects a TextField tree with a missing id prop (Zod failure)", () => {
    const tree = {
      root: "r",
      elements: {
        r: {
          key: "r",
          type: "TextField",
          // missing id
          props: { label: "Email" },
        },
      },
    };
    const result = ncStarterCatalog.validateTree(tree);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects a tree with two input components sharing the same id (NC Invariant 8)", () => {
    const tree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Container",
          props: {},
          children: ["a", "b"],
        },
        a: {
          key: "a",
          type: "TextField",
          props: { id: "shared", label: "First" },
        },
        b: {
          key: "b",
          type: "TextField",
          props: { id: "shared", label: "Second" },
        },
      },
    };
    const result = ncStarterCatalog.validateTree(tree);
    expect(result.success).toBe(false);
    expect(result.fieldIdError).toBeDefined();
    expect(result.fieldIdError?.fieldId).toBe("shared");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/catalog/nc-catalog.test.ts`
Expected: FAIL with "Cannot find module './nc-catalog'".

- [ ] **Step 3: Create `src/catalog/nc-catalog.ts`**

Create `src/catalog/nc-catalog.ts`:

```typescript
import { createCatalog } from "@json-ui/core";
import { z } from "zod";
import type { NCCatalogVersion } from "../types";

/**
 * Version string threaded through every emitted IntentEvent.catalog_version
 * field so the orchestrator can validate LLM tree emissions against the
 * catalog version in effect at emission time. Bump this string whenever
 * the catalog's public shape changes.
 */
export const NC_CATALOG_VERSION = "nc-starter-0.1" as NCCatalogVersion;

/**
 * The NC starter catalog: five components (two display, three input) and
 * two actions. Every input component carries a required `id: z.string()`
 * prop, which keys the staging buffer (NC Invariant 2). Duplicate IDs
 * across the tree are rejected by catalog.validateTree via the
 * validateUniqueFieldIds check that core runs automatically after Zod
 * parsing (NC Invariant 8).
 *
 * Display components:
 *   - Container — holds children, no data.
 *   - Text — renders a content string read from props.
 *
 * Input components:
 *   - TextField — text input with optional placeholder/error.
 *   - Checkbox — boolean input with an always-visible label.
 *   - Button — fires a catalog action via ActionProvider.
 */
export const ncStarterCatalog = createCatalog({
  name: "nc-starter",
  components: {
    Container: {
      props: z.object({}),
      hasChildren: true,
      description: "Holds other components. Only layout semantics.",
    },
    Text: {
      props: z.object({
        content: z.string(),
      }),
      description: "Renders plain text from props.content.",
    },
    TextField: {
      props: z.object({
        id: z.string(),
        label: z.string(),
        placeholder: z.string().optional(),
        error: z.string().optional(),
      }),
      description:
        "Single-line text input bound to staging buffer by props.id.",
    },
    Checkbox: {
      props: z.object({
        id: z.string(),
        label: z.string(),
      }),
      description: "Boolean input bound to staging buffer by props.id.",
    },
    Button: {
      props: z.object({
        label: z.string(),
        // Action declaration. NC's Button fires ActionProvider.execute
        // with this action when clicked. The name must match an entry
        // in the catalog's `actions` map. Params are optional and may
        // contain DynamicValue literals ({path: "..."}) that the
        // staging-aware resolver will substitute at dispatch time.
        action: z
          .object({
            name: z.string(),
            params: z
              .record(z.string(), z.unknown())
              .optional(),
          })
          .optional(),
      }),
      description:
        "Fires a catalog action via ActionProvider. Action declared via props.action.",
    },
  },
  actions: {
    submit_form: {
      description: "Flush the current staging buffer as an intent event.",
    },
    cancel: {
      description: "Cancel the current intent (discards staging snapshot).",
    },
  },
});
```

- [ ] **Step 4: Create `src/catalog/index.ts` barrel**

Create `src/catalog/index.ts`:

```typescript
export { ncStarterCatalog, NC_CATALOG_VERSION } from "./nc-catalog";
```

- [ ] **Step 5: Run tests**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/catalog/nc-catalog.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/catalog/nc-catalog.ts src/catalog/index.ts src/catalog/nc-catalog.test.ts
git commit -m "feat(catalog): add NC starter catalog with id-required input schemas"
```

---

## Task 4: NC input components

**Model:** Sonnet
**Files:**
- Create: `src/renderer/input-components.tsx`
- Create: `src/renderer/index.ts`
- Create: `src/renderer/input-components.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/input-components.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DataProvider,
  StagingProvider,
  ActionProvider,
} from "@json-ui/react";
import { createStagingBuffer } from "@json-ui/core";
import {
  NCTextField,
  NCCheckbox,
  NCButton,
  NCContainer,
  NCText,
} from "./input-components";

function Wrapper({ children, buffer = createStagingBuffer() }: {
  children: React.ReactNode;
  buffer?: ReturnType<typeof createStagingBuffer>;
}) {
  return (
    <DataProvider initialData={{}}>
      <StagingProvider store={buffer}>
        <ActionProvider>{children}</ActionProvider>
      </StagingProvider>
    </DataProvider>
  );
}

describe("NCTextField", () => {
  it("renders a text input bound to the staging buffer by id", () => {
    const buffer = createStagingBuffer();
    render(
      <Wrapper buffer={buffer}>
        <NCTextField element={{
          key: "r",
          type: "TextField",
          props: { id: "email", label: "Email" },
        }} />
      </Wrapper>,
    );
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "alice@example.com" } });
    expect(buffer.get("email")).toBe("alice@example.com");
  });

  it("reflects a pre-existing staging value on initial render", () => {
    const buffer = createStagingBuffer();
    buffer.set("name", "Alice");
    render(
      <Wrapper buffer={buffer}>
        <NCTextField element={{
          key: "r",
          type: "TextField",
          props: { id: "name", label: "Name" },
        }} />
      </Wrapper>,
    );
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    expect(input.value).toBe("Alice");
  });
});

describe("NCCheckbox", () => {
  it("toggles a boolean staging field", () => {
    const buffer = createStagingBuffer();
    render(
      <Wrapper buffer={buffer}>
        <NCCheckbox element={{
          key: "r",
          type: "Checkbox",
          props: { id: "agree", label: "I agree" },
        }} />
      </Wrapper>,
    );
    const checkbox = screen.getByLabelText("I agree") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(buffer.get("agree")).toBe(true);
  });
});

describe("NCContainer", () => {
  it("renders its children", () => {
    render(
      <Wrapper>
        <NCContainer element={{
          key: "r",
          type: "Container",
          props: {},
          children: ["a"],
        }}>
          <span data-testid="child">hello</span>
        </NCContainer>
      </Wrapper>,
    );
    expect(screen.getByTestId("child")).toBeDefined();
  });
});

describe("NCText", () => {
  it("renders the content prop", () => {
    render(
      <Wrapper>
        <NCText element={{
          key: "r",
          type: "Text",
          props: { content: "hello world" },
        }} />
      </Wrapper>,
    );
    expect(screen.getByText("hello world")).toBeDefined();
  });
});

describe("NCButton", () => {
  it("renders the label prop", () => {
    render(
      <Wrapper>
        <NCButton element={{
          key: "r",
          type: "Button",
          props: { label: "Submit" },
        }} />
      </Wrapper>,
    );
    expect(screen.getByRole("button", { name: "Submit" })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/renderer/input-components.test.tsx`
Expected: FAIL with "Cannot find module './input-components'".

- [ ] **Step 3: Create `src/renderer/input-components.tsx`**

Create `src/renderer/input-components.tsx`:

```typescript
"use client";

import React from "react";
import { useStagingField, useActions } from "@json-ui/react";
import type { UIElement } from "@json-ui/core";

/**
 * Props shape used by all NC-authored React components. Matches the
 * ComponentRegistry contract of @json-ui/react: the renderer passes
 * the current element plus resolved children.
 */
export interface NCComponentProps {
  element: UIElement;
  children?: React.ReactNode;
}

export function NCContainer({ element, children }: NCComponentProps) {
  return <div data-key={element.key}>{children}</div>;
}

export function NCText({ element }: NCComponentProps) {
  const content = (element.props as { content: string }).content;
  return <p data-key={element.key}>{content}</p>;
}

export function NCTextField({ element }: NCComponentProps) {
  const props = element.props as {
    id: string;
    label: string;
    placeholder?: string;
    error?: string;
  };
  const [value, setValue] = useStagingField<string>(props.id);
  return (
    <label data-key={element.key}>
      {props.label}
      <input
        type="text"
        value={value ?? ""}
        placeholder={props.placeholder}
        onChange={(e) => setValue(e.target.value)}
      />
      {props.error !== undefined && (
        <span role="alert">{props.error}</span>
      )}
    </label>
  );
}

export function NCCheckbox({ element }: NCComponentProps) {
  const props = element.props as { id: string; label: string };
  const [value, setValue] = useStagingField<boolean>(props.id);
  return (
    <label data-key={element.key}>
      <input
        type="checkbox"
        checked={value ?? false}
        onChange={(e) => setValue(e.target.checked)}
      />
      {props.label}
    </label>
  );
}

export function NCButton({ element }: NCComponentProps) {
  const props = element.props as { label: string; action?: { name: string } };
  const { execute } = useActions();
  const onClick = React.useCallback(() => {
    if (props.action) {
      void execute({ name: props.action.name });
    }
  }, [execute, props.action]);
  return (
    <button type="button" data-key={element.key} onClick={onClick}>
      {props.label}
    </button>
  );
}
```

- [ ] **Step 4: Create `src/renderer/index.ts` barrel (partial — more added in later tasks)**

Create `src/renderer/index.ts`:

```typescript
export {
  NCContainer,
  NCText,
  NCTextField,
  NCCheckbox,
  NCButton,
  type NCComponentProps,
} from "./input-components";
```

- [ ] **Step 5: Run tests**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/renderer/input-components.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/renderer/input-components.tsx src/renderer/index.ts src/renderer/input-components.test.tsx
git commit -m "feat(renderer): add NC input components wired to staging buffer"
```

---

## Task 5: memoryjs GraphProjection

**Model:** Sonnet
**Files:**
- Create: `src/memory/projection.ts`
- Create: `src/memory/index.ts`
- Create: `src/memory/projection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/memory/projection.test.ts`:

```typescript
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
    expect(Object.keys(result.entitiesByType).sort()).toEqual(["message", "user"]);
    expect(Array.isArray(result.entitiesByType.user)).toBe(true);
    expect(result.entitiesByType.user).toHaveLength(2);
    expect(result.entitiesByType.message).toHaveLength(1);
  });

  it("exposes entities by name for O(1) lookup", () => {
    const result = defaultNCProjection(
      [makeEntity("Alice", "user", ["likes coffee"])],
      [],
    );
    expect(result.entities.Alice).toBeDefined();
    expect(result.entities.Alice?.entityType).toBe("user");
    expect(result.entities.Alice?.observations).toEqual(["likes coffee"]);
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/memory/projection.test.ts`
Expected: FAIL with "Cannot find module './projection'".

- [ ] **Step 3: Create `src/memory/projection.ts`**

Create `src/memory/projection.ts`:

```typescript
import type {
  Entity,
  Relation,
  GraphProjection,
  JSONValue,
} from "@danielsimonjr/memoryjs";

/**
 * The flat view NC exposes to @json-ui/react's DataProvider via the
 * memoryjs ObservableDataModel adapter. Every field must satisfy
 * JSONValue so DataProvider's useSyncExternalStore binding stays
 * tearing-safe.
 *
 *   entitiesByType: grouped by entityType, used by the LLM to list
 *     "all users", "all messages", etc. in display components.
 *   entities: keyed by entity name for O(1) lookup from catalog
 *     actions that reference a specific durable path, e.g.
 *     `{path: "entities/Alice/observations/0"}`.
 *   relationCount: exposed as a simple scalar for diagnostic display.
 *     Full relation projection is deferred to a later NC sub-spec.
 */
export interface NCProjectedData {
  entitiesByType: Record<string, Array<NCProjectedEntity>>;
  entities: Record<string, NCProjectedEntity>;
  relationCount: number;
  [key: string]: JSONValue;
}

export interface NCProjectedEntity {
  name: string;
  entityType: string;
  observations: string[];
  createdAt: string;
  lastModified: string;
  [key: string]: JSONValue;
}

function toProjected(entity: Entity): NCProjectedEntity {
  return {
    name: entity.name,
    entityType: entity.entityType,
    observations: [...entity.observations],
    createdAt: entity.createdAt ?? "",
    lastModified: entity.lastModified ?? "",
  };
}

/**
 * Default NC graph projection. Groups entities by type and builds an
 * O(1) name-indexed map. Relations are counted but not projected —
 * the first iteration of NC does not need relation data in the
 * React tree. Bigger projections can be added later as NC grows.
 *
 * This is a pure function of its inputs so it is easy to test
 * without standing up a real memoryjs ManagerContext.
 */
export const defaultNCProjection: GraphProjection = (
  entities: ReadonlyArray<Entity>,
  relations: ReadonlyArray<Relation>,
): Record<string, JSONValue> => {
  const entitiesByType: Record<string, Array<NCProjectedEntity>> = {};
  const entitiesByName: Record<string, NCProjectedEntity> = {};
  for (const entity of entities) {
    const projected = toProjected(entity);
    entitiesByName[entity.name] = projected;
    const bucket = entitiesByType[entity.entityType] ?? [];
    bucket.push(projected);
    entitiesByType[entity.entityType] = bucket;
  }
  const result: NCProjectedData = {
    entitiesByType,
    entities: entitiesByName,
    relationCount: relations.length,
  };
  return result;
};
```

- [ ] **Step 4: Create `src/memory/index.ts` barrel**

Create `src/memory/index.ts`:

```typescript
export {
  defaultNCProjection,
  type NCProjectedData,
  type NCProjectedEntity,
} from "./projection";
```

- [ ] **Step 5: Run tests**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/memory/projection.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/memory/projection.ts src/memory/index.ts src/memory/projection.test.ts
git commit -m "feat(memory): add defaultNCProjection — entities-by-type + entities-by-name"
```

---

## Task 6: NC runtime context factory (architectural core)

**Model:** Opus — wires together staging buffer + memoryjs adapter + backpressure flag + intent handler plumbing. Multiple design decisions about ordering and error handling.
**Files:**
- Create: `src/runtime/context.ts`
- Create: `src/runtime/index.ts`
- Create: `src/runtime/context.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/runtime/context.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createObservableDataModel, type IntentEvent } from "@json-ui/core";
import { createNCRuntime } from "./context";

// Note: tests use core's in-memory createObservableDataModel rather than
// the memoryjs adapter because this test verifies the NC runtime wrapper,
// not memoryjs integration. A separate integration test (Task 11) exercises
// the memoryjs adapter end-to-end.

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/runtime/context.test.ts`
Expected: FAIL with "Cannot find module './context'".

- [ ] **Step 3: Create `src/runtime/context.ts`**

Create `src/runtime/context.ts`:

```typescript
import {
  createStagingBuffer,
  type IntentEvent,
  type ObservableDataModel,
} from "@json-ui/core";
import type { NCIntentHandler, NCRuntime } from "../types";

/**
 * Options for createNCRuntime. The caller supplies an
 * ObservableDataModel (typically built from memoryjs via
 * createObservableDataModelFromGraph, or from core's in-memory
 * createObservableDataModel for tests).
 *
 * The intent handler is NOT part of the options — it is installed
 * later via runtime.setIntentHandler. This matches the React
 * lifecycle: the runtime is created synchronously at app start, but
 * the setTree reference the handler captures only exists after the
 * React app mounts and useState runs. NCApp (Task 10) handles this
 * wiring internally.
 *
 * The runtime owns the staging buffer — it creates a fresh one per
 * call. The durable store is caller-owned because memoryjs adapters
 * are built asynchronously from a ManagerContext and their lifetime
 * exceeds the runtime's lifetime (the caller can rebuild the runtime
 * without tearing down the underlying graph).
 */
export interface CreateNCRuntimeOptions {
  durableStore: ObservableDataModel;
}

const NO_HANDLER_WARNING =
  "[NC runtime] emitIntent called before setIntentHandler; ignoring. " +
  "Make sure NCApp has mounted and called setIntentHandler in its useEffect " +
  "before any action can fire.";

/**
 * Create an NC runtime handle. Creates a fresh StagingBuffer via
 * @json-ui/core's createStagingBuffer factory, holds a mutable slot
 * for the intent handler (wired later via setIntentHandler), and
 * gates every emit through a backpressure flag (NC Invariant 10 —
 * new intents are rejected while one is in flight).
 *
 * The factory is async to leave room for future initialization
 * steps (e.g., hydrating a persisted staging buffer, handshaking
 * with a remote orchestrator). The current implementation returns
 * synchronously-available data but keeps the signature async.
 */
export async function createNCRuntime(
  options: CreateNCRuntimeOptions,
): Promise<NCRuntime> {
  const stagingBuffer = createStagingBuffer();
  let intentHandler: NCIntentHandler | null = null;
  let intentInFlight = false;
  let destroyed = false;

  const emitIntent = async (event: IntentEvent): Promise<void> => {
    if (destroyed) {
      console.warn("[NC runtime] emitIntent called after destroy; ignoring.");
      return;
    }
    if (intentHandler === null) {
      console.warn(NO_HANDLER_WARNING);
      return;
    }
    if (intentInFlight) {
      // NC Invariant 10: reject (and log) rather than queue. The user's
      // UI should disable the Submit button while an intent is in flight,
      // but the runtime enforces the contract defensively even if the
      // UI drops the guard.
      console.warn(
        `[NC runtime] Rejected in-flight intent: ${event.action_name}`,
      );
      return;
    }
    // Capture the current handler before awaiting. If setIntentHandler
    // is called again during the handler's execution, the in-flight
    // call still runs against its original handler — swaps take effect
    // on the next emit.
    const currentHandler = intentHandler;
    intentInFlight = true;
    try {
      await currentHandler(event);
    } finally {
      intentInFlight = false;
    }
  };

  const setIntentHandler = (handler: NCIntentHandler): void => {
    if (destroyed) {
      console.warn(
        "[NC runtime] setIntentHandler called after destroy; ignoring.",
      );
      return;
    }
    intentHandler = handler;
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    intentHandler = null;
    // The durableStore is caller-owned; we don't dispose it here.
    // If it's a memoryjs adapter, the caller disposes it via
    // adapter.dispose() after runtime.destroy().
  };

  return {
    stagingBuffer,
    durableStore: options.durableStore,
    emitIntent,
    setIntentHandler,
    destroy,
  };
}
```

- [ ] **Step 4: Create `src/runtime/index.ts` barrel**

Create `src/runtime/index.ts`:

```typescript
export {
  createNCRuntime,
  type CreateNCRuntimeOptions,
} from "./context";
```

- [ ] **Step 5: Run tests**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/runtime/context.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/runtime/context.ts src/runtime/index.ts src/runtime/context.test.ts
git commit -m "feat(runtime): add createNCRuntime with staging buffer + backpressure gate"
```

---

## Task 7: Intent handler with LLM stub

**Model:** Opus — architectural decisions about what the handler does, how it composes the observation, and where the real LLM call will plug in.
**Files:**
- Create: `src/orchestrator/handle-intent.ts`
- Create: `src/orchestrator/index.ts`
- Create: `src/orchestrator/handle-intent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/orchestrator/handle-intent.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import type { IntentEvent, UITree } from "@json-ui/core";
import { createStubIntentHandler } from "./handle-intent";

describe("createStubIntentHandler", () => {
  it("calls the onTreeCommit callback with a tree derived from the event", async () => {
    const onTreeCommit = vi.fn();
    const handler = createStubIntentHandler({
      nextTree: (event: IntentEvent): UITree => ({
        root: "r",
        elements: {
          r: {
            key: "r",
            type: "Text",
            props: { content: `got ${event.action_name}` },
          },
        },
      }),
      onTreeCommit,
    });

    const event: IntentEvent = {
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: { email: "a@b.c" },
      timestamp: Date.now(),
    };

    await handler(event);

    expect(onTreeCommit).toHaveBeenCalledTimes(1);
    const committedTree = onTreeCommit.mock.calls[0]![0] as UITree;
    expect(committedTree.root).toBe("r");
    expect(
      (committedTree.elements.r!.props as { content: string }).content,
    ).toBe("got submit_form");
  });

  it("is async — caller can await the full handler cycle", async () => {
    const handler = createStubIntentHandler({
      nextTree: () => ({ root: "r", elements: { r: { key: "r", type: "Text", props: { content: "" } } } }),
      onTreeCommit: async () => {
        await new Promise((r) => setTimeout(r, 5));
      },
    });
    const before = Date.now();
    await handler({
      action_name: "x",
      action_params: {},
      staging_snapshot: {},
      timestamp: before,
    });
    const elapsed = Date.now() - before;
    expect(elapsed).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/orchestrator/handle-intent.test.ts`
Expected: FAIL with "Cannot find module './handle-intent'".

- [ ] **Step 3: Create `src/orchestrator/handle-intent.ts`**

Create `src/orchestrator/handle-intent.ts`:

```typescript
import type { IntentEvent, UITree } from "@json-ui/core";
import type { NCIntentHandler } from "../types";

/**
 * Options for the stub intent handler. The stub is deterministic —
 * it takes a pure function that maps an IntentEvent to the next
 * UITree and calls onTreeCommit with that tree. This is the v1
 * handler shape; the real LLM-backed handler will be introduced in
 * a follow-up task and will conform to the same NCIntentHandler
 * signature so the orchestrator loop doesn't need to know which is
 * in use.
 *
 * Isolating the "compute next tree" step as a pure function lets
 * us test the loop without standing up a real Anthropic client.
 * The real handler will call the Anthropic SDK and feed the
 * response back through the same contract.
 */
export interface CreateStubIntentHandlerOptions {
  /**
   * Pure function mapping an IntentEvent to the next UITree. Called
   * once per dispatched intent. The stub does not batch multiple
   * events; each intent produces exactly one tree.
   */
  nextTree: (event: IntentEvent) => UITree;
  /**
   * Callback fired with the committed next tree. The orchestrator
   * loop uses this to drive the React re-render. Returning a promise
   * lets the orchestrator await any downstream effects (e.g., a
   * memoryjs transaction) before the handler resolves.
   */
  onTreeCommit: (tree: UITree) => Promise<void> | void;
}

/**
 * Build a deterministic intent handler suitable for integration
 * testing. Real LLM-backed handlers will replace this in a later
 * task but will conform to the same NCIntentHandler signature.
 */
export function createStubIntentHandler(
  options: CreateStubIntentHandlerOptions,
): NCIntentHandler {
  return async (event: IntentEvent): Promise<void> => {
    const tree = options.nextTree(event);
    await options.onTreeCommit(tree);
  };
}
```

- [ ] **Step 4: Create `src/orchestrator/index.ts` barrel**

Create `src/orchestrator/index.ts`:

```typescript
export {
  createStubIntentHandler,
  type CreateStubIntentHandlerOptions,
} from "./handle-intent";
```

- [ ] **Step 5: Run tests**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/orchestrator/handle-intent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/orchestrator/handle-intent.ts src/orchestrator/index.ts src/orchestrator/handle-intent.test.ts
git commit -m "feat(orchestrator): add createStubIntentHandler for deterministic testing"
```

---

## Task 8: NCRenderer React wrapper

**Model:** Sonnet — mechanical composition of already-shipped JSON-UI providers.
**Files:**
- Create: `src/renderer/nc-renderer.tsx`
- Modify: `src/renderer/index.ts` (add new exports)
- Create: `src/renderer/nc-renderer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/nc-renderer.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  createObservableDataModel,
  type UITree,
  type IntentEvent,
} from "@json-ui/core";
import { NCRenderer } from "./nc-renderer";
import { createNCRuntime } from "../runtime";
import { ncStarterCatalog, NC_CATALOG_VERSION } from "../catalog";

// Build an NC runtime with the given intent observer already wired via
// setIntentHandler, so tests can assert onIntent reception without
// repeating the two-step construction pattern in every test body.
async function makeRuntime(onIntent: (event: IntentEvent) => void) {
  const durableStore = createObservableDataModel({});
  const runtime = await createNCRuntime({ durableStore });
  runtime.setIntentHandler(async (event) => onIntent(event));
  return runtime;
}

describe("NCRenderer", () => {
  it("renders a simple Text tree from the NC starter catalog", async () => {
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
    expect(screen.getByText("hello")).toBeDefined();
    runtime.destroy();
  });

  it("reconciles the staging buffer on tree commit — drops orphaned fields", async () => {
    const initialTree: UITree = {
      root: "root",
      elements: {
        root: { key: "root", type: "Container", props: {}, children: ["a", "b"] },
        a: { key: "a", type: "TextField", props: { id: "email", label: "Email" } },
        b: { key: "b", type: "TextField", props: { id: "name", label: "Name" } },
      },
    };
    const runtime = await makeRuntime(() => {});
    runtime.stagingBuffer.set("email", "a@b.c");
    runtime.stagingBuffer.set("name", "Alice");
    runtime.stagingBuffer.set("orphan", "drop me");

    const { rerender } = render(
      <NCRenderer
        tree={initialTree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // orphan not in tree → dropped after reconcile runs on commit.
    expect(runtime.stagingBuffer.has("email")).toBe(true);
    expect(runtime.stagingBuffer.has("name")).toBe(true);
    expect(runtime.stagingBuffer.has("orphan")).toBe(false);

    // Now commit a new tree that drops "name" — reconcile should drop
    // it from staging, preserving "email".
    const nextTree: UITree = {
      root: "root",
      elements: {
        root: { key: "root", type: "Container", props: {}, children: ["a"] },
        a: { key: "a", type: "TextField", props: { id: "email", label: "Email" } },
      },
    };
    rerender(
      <NCRenderer
        tree={nextTree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    expect(runtime.stagingBuffer.has("email")).toBe(true);
    expect(runtime.stagingBuffer.has("name")).toBe(false);
    runtime.destroy();
  });

  it("fires onIntent when a Button action is clicked with the full staging snapshot", async () => {
    const tree: UITree = {
      root: "root",
      elements: {
        root: { key: "root", type: "Container", props: {}, children: ["input", "btn"] },
        input: {
          key: "input",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
        btn: {
          key: "btn",
          type: "Button",
          props: { label: "Submit", action: { name: "submit_form" } },
        },
      },
    };
    const onIntent = vi.fn();
    const runtime = await makeRuntime(onIntent);
    runtime.stagingBuffer.set("email", "alice@example.com");

    render(
      <NCRenderer
        tree={tree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    });

    expect(onIntent).toHaveBeenCalledTimes(1);
    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    expect(event.action_name).toBe("submit_form");
    expect(event.staging_snapshot).toEqual({ email: "alice@example.com" });
    expect(event.catalog_version).toBe(NC_CATALOG_VERSION);
    runtime.destroy();
  });

  it("skips reconcile when the tree fails catalog validation (NC Invariant 9 + 8)", async () => {
    const initialTree: UITree = {
      root: "root",
      elements: {
        root: { key: "root", type: "Container", props: {}, children: ["a"] },
        a: { key: "a", type: "TextField", props: { id: "email", label: "E" } },
      },
    };
    const runtime = await makeRuntime(() => {});
    runtime.stagingBuffer.set("email", "keep-me");

    const { rerender } = render(
      <NCRenderer
        tree={initialTree}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // Now pass a tree with a duplicate field id — validateTree should
    // return success: false, NCRenderer should NOT reconcile.
    const badTree: UITree = {
      root: "root",
      elements: {
        root: { key: "root", type: "Container", props: {}, children: ["a", "b"] },
        a: { key: "a", type: "TextField", props: { id: "shared", label: "A" } },
        b: { key: "b", type: "TextField", props: { id: "shared", label: "B" } },
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

    // The original "email" staging value is preserved because reconcile
    // was skipped on the invalid tree.
    expect(runtime.stagingBuffer.get("email")).toBe("keep-me");
    runtime.destroy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/renderer/nc-renderer.test.tsx`
Expected: FAIL with "Cannot find module './nc-renderer'".

- [ ] **Step 3: Create `src/renderer/nc-renderer.tsx`**

Create `src/renderer/nc-renderer.tsx`:

```typescript
"use client";

import React from "react";
import {
  JSONUIProvider,
  Renderer,
  type ComponentRegistry,
  type ComponentRenderer,
} from "@json-ui/react";
import {
  collectFieldIds,
  type Catalog,
  type IntentEvent,
  type UITree,
} from "@json-ui/core";
import {
  NCContainer,
  NCText,
  NCTextField,
  NCCheckbox,
  NCButton,
} from "./input-components";
import type { NCRuntime, NCCatalogVersion } from "../types";

/**
 * Maps NC-authored React components to the ComponentRegistry shape
 * @json-ui/react expects. NC components already accept `{element,
 * children}` as a subset of ComponentRenderProps, so the assignment is
 * structural and no wrapper function is needed — TypeScript's
 * `ComponentType<P>` is contravariant in P, and UIElement is structurally
 * compatible with the NC components' prop shape.
 */
function buildDefaultRegistry(): ComponentRegistry {
  return {
    Container: NCContainer as ComponentRenderer,
    Text: NCText as ComponentRenderer,
    TextField: NCTextField as ComponentRenderer,
    Checkbox: NCCheckbox as ComponentRenderer,
    Button: NCButton as ComponentRenderer,
  };
}

export interface NCRendererProps {
  /** The committed tree to render. Must come from a successful stream
   *  commit — NCRenderer does NOT tolerate partial trees. Use the
   *  useCommittedTree hook to get a tree from useUIStream in atomic mode. */
  tree: UITree;
  /** NC runtime handle (staging buffer, durable store, emitIntent). */
  runtime: NCRuntime;
  /** Catalog used to validate the tree before reconciliation. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catalog: Catalog<any, any, any>;
  /** Catalog version threaded through emitted IntentEvents. */
  catalogVersion: NCCatalogVersion;
  /** Optional additional component registry entries. */
  extraRegistry?: ComponentRegistry;
}

/**
 * The NC React wrapper. Mounts @json-ui/react's JSONUIProvider with
 * NC's runtime-shared StagingBuffer and memoryjs-backed durable store,
 * wires the onIntent callback to the runtime's backpressure gate, and
 * runs catalog.validateTree + staging.reconcile on every committed tree.
 *
 * Partial-tree safety (NC Invariant 9) is the caller's responsibility
 * — NCRenderer assumes the `tree` prop only changes on successful
 * stream commits. Use useCommittedTree (Task 9) to get this behavior
 * from useUIStream automatically.
 */
export function NCRenderer({
  tree,
  runtime,
  catalog,
  catalogVersion,
  extraRegistry,
}: NCRendererProps) {
  const registry = React.useMemo(
    () => ({ ...buildDefaultRegistry(), ...extraRegistry }),
    [extraRegistry],
  );

  // Reconcile the staging buffer against the committed tree. Guarded
  // by catalog.validateTree — a tree that fails validation (Zod or
  // field-ID uniqueness) is skipped, leaving the buffer untouched.
  // This is the library-side enforcement of NC Invariants 8 and 9.
  React.useEffect(() => {
    const result = catalog.validateTree(tree);
    if (!result.success) {
      console.warn(
        "[NC] Skipping reconcile: catalog.validateTree failed",
        result.error ?? result.fieldIdError,
      );
      return;
    }
    try {
      const liveIds = collectFieldIds(tree);
      runtime.stagingBuffer.reconcile(liveIds);
    } catch (err) {
      console.warn("[NC] Reconcile threw; buffer untouched:", err);
    }
  }, [tree, catalog, runtime.stagingBuffer]);

  const onIntent = React.useCallback(
    (event: IntentEvent) => {
      void runtime.emitIntent(event);
    },
    [runtime],
  );

  return (
    <JSONUIProvider
      registry={registry}
      store={runtime.durableStore}
      stagingStore={runtime.stagingBuffer}
      onIntent={onIntent}
      catalogVersion={catalogVersion}
    >
      {/*
        Renderer requires `registry` as a prop even though JSONUIProvider
        accepts it — JSONUIProvider's registry prop is currently vestigial
        (it doesn't wire it into the render tree). Pass the same registry
        to both so NC stays forward-compatible if JSONUIProvider starts
        consuming its registry prop in the future.
      */}
      <Renderer tree={tree} registry={registry} />
    </JSONUIProvider>
  );
}
```

- [ ] **Step 4: Extend `src/renderer/index.ts` barrel**

Append to `src/renderer/index.ts`:

```typescript
export { NCRenderer, type NCRendererProps } from "./nc-renderer";
```

Final content:

```typescript
export {
  NCContainer,
  NCText,
  NCTextField,
  NCCheckbox,
  NCButton,
  type NCComponentProps,
} from "./input-components";

export { NCRenderer, type NCRendererProps } from "./nc-renderer";
```

- [ ] **Step 5: Run tests**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/renderer/nc-renderer.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/renderer/nc-renderer.tsx src/renderer/index.ts src/renderer/nc-renderer.test.tsx
git commit -m "feat(renderer): add NCRenderer wrapping JSONUIProvider with validate+reconcile"
```

---

## Task 9: Atomic-commit useUIStream wrapper

**Model:** Sonnet
**Files:**
- Create: `src/renderer/use-committed-tree.ts`
- Modify: `src/renderer/index.ts`
- Create: `src/renderer/use-committed-tree.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/use-committed-tree.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { UITree } from "@json-ui/core";
import { useCommittedTree } from "./use-committed-tree";

function makeStreamBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]!));
      i += 1;
    },
  });
}

function mockFetchOnce(body: ReadableStream<Uint8Array>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, body } as Response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const patches = [
  `{"op":"set","path":"/root","value":"r"}\n`,
  `{"op":"set","path":"/elements/r","value":{"key":"r","type":"Text","props":{"content":"hi"}}}\n`,
];

describe("useCommittedTree", () => {
  it("returns null before send is called", () => {
    const { result } = renderHook(() => useCommittedTree({ api: "/mock" }));
    expect(result.current.tree).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });

  it("only commits the tree after the stream completes (atomic mode)", async () => {
    mockFetchOnce(makeStreamBody(patches));
    const { result } = renderHook(() => useCommittedTree({ api: "/mock" }));

    await act(async () => {
      await result.current.send("draw");
    });

    expect(result.current.tree).not.toBeNull();
    expect((result.current.tree as UITree).root).toBe("r");
    expect(result.current.isStreaming).toBe(false);
  });

  it("leaves tree unchanged on stream error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const { result } = renderHook(() => useCommittedTree({ api: "/mock" }));
    await act(async () => {
      await result.current.send("draw");
    });
    expect(result.current.tree).toBeNull();
    expect(result.current.error?.message).toBe("network down");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/renderer/use-committed-tree.test.tsx`
Expected: FAIL with "Cannot find module './use-committed-tree'".

- [ ] **Step 3: Create `src/renderer/use-committed-tree.ts`**

Create `src/renderer/use-committed-tree.ts`:

```typescript
import { useUIStream, type UseUIStreamOptions } from "@json-ui/react";

/**
 * Thin wrapper around @json-ui/react's useUIStream that pre-selects
 * the atomic commit mode required by NC Invariant 9 (reconcile only
 * on successful tree commits). Consumers can still pass onComplete /
 * onError callbacks but cannot override the commitMode — NC's
 * reconciliation policy is non-negotiable at this layer.
 *
 * The returned `tree` is `null` before any stream completes and then
 * transitions directly from `null` to the fully committed tree when
 * the stream finishes. No partial trees are ever published, so a
 * consumer that reconciles on `useEffect(() => reconcile(tree), [tree])`
 * will only see the validated, complete tree.
 */
export type UseCommittedTreeOptions = Omit<UseUIStreamOptions, "commitMode">;

export function useCommittedTree(options: UseCommittedTreeOptions) {
  return useUIStream({ ...options, commitMode: "atomic" });
}
```

- [ ] **Step 4: Extend `src/renderer/index.ts`**

Append to `src/renderer/index.ts`:

```typescript
export {
  useCommittedTree,
  type UseCommittedTreeOptions,
} from "./use-committed-tree";
```

- [ ] **Step 5: Run tests**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/renderer/use-committed-tree.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/renderer/use-committed-tree.ts src/renderer/index.ts src/renderer/use-committed-tree.test.tsx
git commit -m "feat(renderer): add useCommittedTree atomic-mode useUIStream wrapper"
```

---

## Task 10: NCApp — React mounting layer

**Model:** Opus — the NCApp component bridges the React lifecycle (useState, useEffect) with NC's runtime handler slot. The design decision is how to get a stable `setTree` reference into the intent handler without restructuring the runtime as a React hook.

**Boundary note:** This task creates files under `src/app/`, NOT `src/orchestrator/`. NC Invariant 7 forbids the orchestrator module from importing anything React-related. `nc-app.tsx` imports `NCRenderer` (React) and so belongs in the App layer. Task 12 adds a meta-test that enforces the boundary structurally.

**Pattern:** NCApp owns a `useState<UITree>` for the current tree. On mount (useEffect), it calls `runtime.setIntentHandler(props.buildIntentHandler(setTree))`, passing its own setState as the `onTreeCommit` sink for the stub handler (or whatever handler factory the caller supplies). When a catalog action fires, NCRenderer forwards the IntentEvent through `runtime.emitIntent`, which calls the handler, which calls `setTree(nextTree)`, which re-renders NCApp with the new tree.

**Files:**
- Create: `src/app/nc-app.tsx`
- Create: `src/app/index.ts`
- Create: `src/app/nc-app.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/nc-app.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { createObservableDataModel, type UITree, type IntentEvent } from "@json-ui/core";
import { NCApp } from "./nc-app";
import { createNCRuntime } from "../runtime";
import { ncStarterCatalog, NC_CATALOG_VERSION } from "../catalog";
import { createStubIntentHandler } from "../orchestrator";

describe("NCApp", () => {
  it("mounts NCRenderer, wires the intent handler, and drives tree transitions", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });

    const initialTree: UITree = {
      root: "start",
      elements: {
        start: {
          key: "start",
          type: "Container",
          props: {},
          children: ["btn"],
        },
        btn: {
          key: "btn",
          type: "Button",
          props: { label: "Go", action: { name: "submit_form" } },
        },
      },
    };

    const nextTree: UITree = {
      root: "done",
      elements: {
        done: {
          key: "done",
          type: "Text",
          props: { content: "after submit_form" },
        },
      },
    };

    const treeCommits: UITree[] = [];

    render(
      <NCApp
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
        initialTree={initialTree}
        buildIntentHandler={(setTree) =>
          createStubIntentHandler({
            nextTree: () => nextTree,
            onTreeCommit: (tree) => {
              treeCommits.push(tree);
              setTree(tree);
            },
          })
        }
      />,
    );

    // Initial tree renders the Go button.
    expect(screen.getByRole("button", { name: "Go" })).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Go" }));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Intent handler fired exactly once and the tree transitioned.
    expect(treeCommits).toHaveLength(1);
    expect(treeCommits[0]!.root).toBe("done");
    expect(screen.getByText("after submit_form")).toBeDefined();
    runtime.destroy();
  });

  it("swaps the intent handler when buildIntentHandler identity changes", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });

    const tree: UITree = {
      root: "btn",
      elements: {
        btn: {
          key: "btn",
          type: "Button",
          props: { label: "Fire", action: { name: "submit_form" } },
        },
      },
    };

    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});

    const { rerender } = render(
      <NCApp
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
        initialTree={tree}
        buildIntentHandler={() => first}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fire" }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(first).toHaveBeenCalledTimes(1);

    rerender(
      <NCApp
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
        initialTree={tree}
        buildIntentHandler={() => second}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fire" }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(second).toHaveBeenCalledTimes(1);

    runtime.destroy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/app/nc-app.test.tsx`
Expected: FAIL with "Cannot find module './nc-app'".

- [ ] **Step 3: Create `src/app/nc-app.tsx`**

Create `src/app/nc-app.tsx`:

```typescript
"use client";

import React from "react";
import type { Catalog, UITree } from "@json-ui/core";
import { NCRenderer } from "../renderer";
import type {
  NCRuntime,
  NCCatalogVersion,
  NCIntentHandler,
} from "../types";

export interface NCAppProps {
  runtime: NCRuntime;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catalog: Catalog<any, any, any>;
  catalogVersion: NCCatalogVersion;
  initialTree: UITree;
  /**
   * Factory that takes the NCApp's internal `setTree` reference and
   * returns the NCIntentHandler the runtime should use. The handler
   * is responsible for calling `setTree(nextTree)` on every committed
   * tree transition — typically by passing setTree as the
   * `onTreeCommit` callback to `createStubIntentHandler` (or the real
   * LLM-backed handler once that exists).
   *
   * NCApp calls this factory in a useEffect with the current setTree,
   * then installs the result via `runtime.setIntentHandler`. When
   * `buildIntentHandler`'s identity changes across renders, NCApp
   * re-installs the new handler so the runtime always dispatches to
   * the latest one.
   */
  buildIntentHandler: (setTree: (tree: UITree) => void) => NCIntentHandler;
}

/**
 * The top-level React mounting point for an NC app. Owns the current
 * UITree in a React state hook, installs the intent handler against
 * the runtime on mount, and renders NCRenderer.
 *
 * NCApp is intentionally small — it exists so the caller does not
 * have to repeat the useState + useEffect + setIntentHandler dance
 * in every integration. For callers that need to own the tree state
 * themselves (e.g., because the tree comes from a useUIStream hook
 * running elsewhere), mount NCRenderer directly and call
 * runtime.setIntentHandler manually.
 */
export function NCApp({
  runtime,
  catalog,
  catalogVersion,
  initialTree,
  buildIntentHandler,
}: NCAppProps) {
  const [tree, setTree] = React.useState<UITree>(initialTree);

  React.useEffect(() => {
    const handler = buildIntentHandler(setTree);
    runtime.setIntentHandler(handler);
  }, [runtime, buildIntentHandler]);

  return (
    <NCRenderer
      tree={tree}
      runtime={runtime}
      catalog={catalog}
      catalogVersion={catalogVersion}
    />
  );
}
```

- [ ] **Step 4: Create `src/app/index.ts` barrel**

Create `src/app/index.ts`:

```typescript
export { NCApp, type NCAppProps } from "./nc-app";
```

- [ ] **Step 5: Run tests**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/app/nc-app.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/app/nc-app.tsx src/app/index.ts src/app/nc-app.test.tsx
git commit -m "feat(app): add NCApp React mounting component"
```

---

## Task 11: End-to-end integration test

**Model:** Opus — exercises the full Path C flow and asserts the invariants hold across the real components.
**Files:**
- Create: `src/integration.test.tsx`

- [ ] **Step 1: Write the integration test**

Create `src/integration.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  createObservableDataModel,
  type IntentEvent,
  type UITree,
} from "@json-ui/core";
import { createNCRuntime } from "./runtime";
import { ncStarterCatalog, NC_CATALOG_VERSION } from "./catalog";
import { NCRenderer } from "./renderer";

describe("NC Path C end-to-end integration", () => {
  it("type → submit → intent cycle with staging snapshot", async () => {
    const onIntent = vi.fn();
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });
    runtime.setIntentHandler(async (e) => onIntent(e));

    const tree: UITree = {
      root: "form",
      elements: {
        form: {
          key: "form",
          type: "Container",
          props: {},
          children: ["email", "agree", "submit"],
        },
        email: {
          key: "email",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
        agree: {
          key: "agree",
          type: "Checkbox",
          props: { id: "agree", label: "I agree" },
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

    // User types an email.
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "alice@example.com" } });

    // User checks the agreement.
    const checkbox = screen.getByLabelText("I agree") as HTMLInputElement;
    fireEvent.click(checkbox);

    // User clicks Submit.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Exactly one intent fired, with the full staging snapshot and
    // the NC catalog version threaded through.
    expect(onIntent).toHaveBeenCalledTimes(1);
    const event = onIntent.mock.calls[0]![0] as IntentEvent;
    expect(event.action_name).toBe("submit_form");
    expect(event.staging_snapshot).toEqual({
      email: "alice@example.com",
      agree: true,
    });
    expect(event.catalog_version).toBe(NC_CATALOG_VERSION);

    // Buffer is NOT cleared on flush (NC Rule 4B).
    expect(runtime.stagingBuffer.snapshot()).toEqual({
      email: "alice@example.com",
      agree: true,
    });

    runtime.destroy();
  });

  it("reconciliation on tree commit preserves matching IDs and drops orphans", async () => {
    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });
    runtime.setIntentHandler(async () => {});

    const first: UITree = {
      root: "form",
      elements: {
        form: {
          key: "form",
          type: "Container",
          props: {},
          children: ["a", "b"],
        },
        a: {
          key: "a",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
        b: {
          key: "b",
          type: "TextField",
          props: { id: "name", label: "Name" },
        },
      },
    };
    const { rerender } = render(
      <NCRenderer
        tree={first}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // Pre-populate both fields.
    runtime.stagingBuffer.set("email", "a@b.c");
    runtime.stagingBuffer.set("name", "Alice");

    // Re-render with a tree that only contains "email".
    const second: UITree = {
      root: "form",
      elements: {
        form: {
          key: "form",
          type: "Container",
          props: {},
          children: ["a"],
        },
        a: {
          key: "a",
          type: "TextField",
          props: { id: "email", label: "Email" },
        },
      },
    };
    rerender(
      <NCRenderer
        tree={second}
        runtime={runtime}
        catalog={ncStarterCatalog}
        catalogVersion={NC_CATALOG_VERSION}
      />,
    );

    // Reconciliation preserved "email" and dropped "name".
    expect(runtime.stagingBuffer.get("email")).toBe("a@b.c");
    expect(runtime.stagingBuffer.has("name")).toBe(false);

    runtime.destroy();
  });

  it("backpressure rejects a second intent while the first is in flight", async () => {
    let releaseFirst: () => void = () => {};
    const firstDone = new Promise<void>((r) => {
      releaseFirst = r;
    });
    let calls = 0;
    const onIntent = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        await firstDone;
      }
    });

    const durableStore = createObservableDataModel({});
    const runtime = await createNCRuntime({ durableStore });
    runtime.setIntentHandler(onIntent);

    const tree: UITree = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Button",
          props: { label: "Fire", action: { name: "submit_form" } },
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

    // Two rapid clicks — only the first should reach onIntent.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fire" }));
      fireEvent.click(screen.getByRole("button", { name: "Fire" }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onIntent).toHaveBeenCalledTimes(1);

    releaseFirst();
    runtime.destroy();
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/integration.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 3: Run the full test suite to catch cross-task regressions**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npm test`
Expected: all tests pass across every file created in Tasks 2-11.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/integration.test.tsx
git commit -m "test: add NC Path C end-to-end integration test"
```

---

## Task 12: Buffer isolation meta-test (NC Invariant 7 enforcement)

**Model:** Sonnet

NC Invariant 7 requires that the orchestrator module not import from the React side. Task 10 already respects this by putting `nc-app.tsx` under `src/app/`, not `src/orchestrator/`. This task adds a permanent regression guard: a vitest meta-test that reads every file under `src/orchestrator/` and asserts no forbidden import is present. Any future refactor that accidentally pulls React into the orchestrator will fail this test in CI.

Enforcement is via vitest (not ESLint plugin) because it gives the same guarantee with zero extra dependencies and runs in the standard test suite.

**Files:**
- Create: `src/orchestrator/buffer-isolation.test.ts`

- [ ] **Step 1: Write the regression-guard test**

Create `src/orchestrator/buffer-isolation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";

// NC Invariant 7: the orchestrator module must not import from
// @json-ui/react, react, react-dom, or src/renderer/ / src/app/.
// The orchestrator only sees IntentEvent objects from @json-ui/core
// and never touches the rendering layer directly.
const FORBIDDEN_IMPORTS: ReadonlyArray<RegExp> = [
  /from\s+["']@json-ui\/react["']/,
  /from\s+["']react["']/,
  /from\s+["']react-dom["']/,
  /from\s+["']\.\.\/renderer["']/,
  /from\s+["']\.\.\/renderer\//,
  /from\s+["']\.\.\/app["']/,
  /from\s+["']\.\.\/app\//,
];

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await collectTsFiles(full)));
    } else if (
      (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) &&
      !e.name.endsWith(".test.ts") &&
      !e.name.endsWith(".test.tsx")
    ) {
      files.push(full);
    }
  }
  return files;
}

describe("NC Invariant 7: orchestrator buffer isolation", () => {
  it("no non-test file under src/orchestrator/ imports React or the renderer/app layers", async () => {
    const orchestratorDir = join(process.cwd(), "src/orchestrator");
    const files = await collectTsFiles(orchestratorDir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      for (const pattern of FORBIDDEN_IMPORTS) {
        expect(
          pattern.test(content),
          `${file} must not match forbidden import pattern ${pattern}`,
        ).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npx vitest run src/orchestrator/buffer-isolation.test.ts`
Expected: PASS (1 test). Task 10 put `nc-app.tsx` under `src/app/`, so `src/orchestrator/` contains only `handle-intent.ts` + `index.ts`, neither of which imports React.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/orchestrator/buffer-isolation.test.ts
git commit -m "test(orchestrator): add NC Invariant 7 buffer-isolation meta-test"
```

---

## Task 13: Public barrel + README quickstart + final verification

**Model:** Sonnet
**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Replace `src/index.ts` with the public barrel**

Replace `src/index.ts`:

```typescript
// Neural Computer — public entry point.
//
// The NC runtime composes @json-ui/react, @json-ui/headless, and
// @danielsimonjr/memoryjs into an LLM-driven application runtime.
// See docs/specs/ and docs/plans/ for the architecture.

// Catalog
export { ncStarterCatalog, NC_CATALOG_VERSION } from "./catalog";

// Types
export type {
  NCIntentHandler,
  NCCatalogVersion,
  NCRuntime,
} from "./types";

// Runtime
export {
  createNCRuntime,
  type CreateNCRuntimeOptions,
} from "./runtime";

// Memory
export {
  defaultNCProjection,
  type NCProjectedData,
  type NCProjectedEntity,
} from "./memory";

// Renderer (React surface)
export {
  NCRenderer,
  NCContainer,
  NCText,
  NCTextField,
  NCCheckbox,
  NCButton,
  useCommittedTree,
  type NCRendererProps,
  type NCComponentProps,
  type UseCommittedTreeOptions,
} from "./renderer";

// Orchestrator (intent handling — no React)
export {
  createStubIntentHandler,
  type CreateStubIntentHandlerOptions,
} from "./orchestrator";

// App (top-level React mounting component)
export { NCApp, type NCAppProps } from "./app";
```

- [ ] **Step 2: Update README.md with a quickstart**

Replace the "Status and roadmap" section of `README.md` with:

```markdown
## Status

The runtime surface is live. All 12 implementation tasks from
`docs/plans/2026-04-15-neural-computer-v2-plan.md` are complete.
The stub intent handler is the v1 mechanism; a real Anthropic-backed
handler will replace it in a follow-up spec.

## Quickstart

```tsx
import { ManagerContext, createObservableDataModelFromGraph } from "@danielsimonjr/memoryjs";
import { createRoot } from "react-dom/client";
import React from "react";
import {
  NCApp,
  createNCRuntime,
  createStubIntentHandler,
  defaultNCProjection,
  ncStarterCatalog,
  NC_CATALOG_VERSION,
} from "neural-computer";
import type { UITree } from "@json-ui/core";

const ctx = new ManagerContext("./nc.jsonl");
const durableStore = await createObservableDataModelFromGraph(ctx.storage, {
  projection: defaultNCProjection,
});
const runtime = await createNCRuntime({ durableStore });

const initialTree: UITree = {
  root: "r",
  elements: {
    r: { key: "r", type: "Text", props: { content: "hello" } },
  },
};

function App() {
  return (
    <NCApp
      runtime={runtime}
      catalog={ncStarterCatalog}
      catalogVersion={NC_CATALOG_VERSION}
      initialTree={initialTree}
      buildIntentHandler={(setTree) =>
        createStubIntentHandler({
          nextTree: (event) => ({
            root: "r",
            elements: {
              r: {
                key: "r",
                type: "Text",
                props: { content: `got ${event.action_name}` },
              },
            },
          }),
          onTreeCommit: setTree,
        })
      }
    />
  );
}

createRoot(document.getElementById("app")!).render(<App />);
```
```

- [ ] **Step 3: Run the full verification suite**

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npm run typecheck`
Expected: exits 0.

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npm test`
Expected: every test in every file created in Tasks 2-12 passes.

Run: `cd "C:/Users/danie/Dropbox/Github/neural-computer" && npm run build`
Expected: `dist/` contains `index.js`, `index.mjs`, `index.d.ts`, `index.d.mts`, with sourcemaps.

- [ ] **Step 4: Verify the built barrel exports the full public surface**

NC's `package.json` has `"type": "module"`, so a bare `node -e "require(...)"` won't work — Node treats the inline code as ESM. Use the CJS input-type override:

Run: `node --input-type=commonjs -e "const nc = require('./dist/index.cjs'); console.log(Object.keys(nc).sort().join('\n'));"`
Expected output includes at minimum:
```
NCApp
NCButton
NCCheckbox
NCContainer
NCRenderer
NCText
NCTextField
NC_CATALOG_VERSION
createNCRuntime
createStubIntentHandler
defaultNCProjection
ncStarterCatalog
useCommittedTree
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git add src/index.ts README.md
git commit -m "feat: public barrel + README quickstart + v2 plan complete"
```

- [ ] **Step 6: Push to origin/main**

```bash
cd "C:/Users/danie/Dropbox/Github/neural-computer"
git push origin main
```

---

## Self-Review

**Spec coverage:** Every invariant from `docs/specs/2026-04-11-ephemeral-ui-state-design.md` has a task that implements it:

| Invariant | Task |
|---|---|
| 1 (Reconciliation drops orphans) | Task 8 reconcile test, Task 11 integration test |
| 2 (Reconciliation preserves matching IDs) | Task 11 integration test |
| 3 (Reconciliation preserves across prop changes) | Library-enforced by `collectFieldIds` — no NC code needed |
| 4 (Snapshot non-destructive) | Library-enforced by `StagingBuffer.snapshot` |
| 5 (Intent events carry full snapshot) | Task 8, Task 11 |
| 6 (action_params and staging_snapshot separate) | Library-enforced by `ActionProvider` — Task 11 asserts |
| 7 (Buffer isolation) | Task 12 meta-test |
| 8 (Field ID uniqueness) | Task 3 catalog test, Task 8 skip-reconcile-on-invalid test |
| 9 (Partial-tree safety) | Task 9 useCommittedTree atomic mode |
| 10 (Backpressure rejection) | Task 6 runtime backpressure test, Task 11 integration test |
| 11 (DynamicValue pre-resolution) | Library-enforced by `resolveActionWithStaging` in `ActionProvider.execute` |

**Placeholder scan:** No TBD, TODO, "implement later", or vague error handling. Every step has exact file paths, complete code, and exact commands with expected output.

**Type consistency:**
- `NCRuntime` shape defined in Task 2, consumed in Tasks 6, 8, 10, 11
- `NCCatalogVersion` branded string defined in Task 2, used in Task 3 (`NC_CATALOG_VERSION`), consumed in Tasks 8, 10, 11
- `createNCRuntime` signature in Task 6 matches consumers in Tasks 8, 10, 11
- `NCRendererProps.tree` is `UITree`, `runtime` is `NCRuntime`, `catalog` is `Catalog<any,any,any>`, `catalogVersion` is `NCCatalogVersion` — consistent across Tasks 8, 10, 11
- `createStubIntentHandler` returns `NCIntentHandler` in Task 7, passed to `createNCRuntime.onIntent` in Tasks 6, 10, 11

**Scope check:** Task 10 places `NCApp` under `src/app/` from the start (not `src/orchestrator/`) because it imports `NCRenderer` which pulls in React. `src/orchestrator/` stays pure and only contains intent-dispatch logic. Task 12 adds a meta-test that enforces this boundary structurally so future refactors cannot accidentally cross it.

---

## Done Criteria

- [ ] All 13 tasks committed to `main`
- [ ] `npm test` passes across every test file
- [ ] `npm run typecheck` clean
- [ ] `npm run build` clean; `dist/` contains the public barrel
- [ ] Task 12 meta-test confirms `src/orchestrator/` has no React imports (NC Invariant 7)
- [ ] `README.md` quickstart compiles against the published surface
- [ ] Plan pushed to `origin/main`

---

## Out of scope (follow-up specs)

- **Real Anthropic LLM integration** — `createStubIntentHandler` is v1. A follow-up task will add `createAnthropicIntentHandler` that calls `@anthropic-ai/sdk`, streams the response, feeds patches through `useCommittedTree`'s atomic mode, and parses the final tree.
- **Python REPL subprocess dispatch** — the RLM-pattern computation arm. Independent subsystem; separate spec.
- **LLM Observer headless-renderer session** — Path C's dual-backend second half. Mounted alongside `NCRenderer` with the same runtime references. Separate spec because the LLM Observer's serialization format and subscription semantics need their own design pass.
- **Persistent staging buffer across process restart** — explicit non-goal in the April 11 spec (Risk 3 + Open Question 3). A future opt-in would route through memoryjs rather than parallel storage.
- **Backpressure UX** — the runtime rejects and logs, but the visual treatment of rejected intents (disabled Submit button, toast, silent) is a UX decision load-bearing enough to warrant its own spec.
- **Catalog versioning / migration** — `NC_CATALOG_VERSION` is a constant. A real versioning flow (LLM sees a new catalog, old trees still validate gracefully) is a follow-up.
