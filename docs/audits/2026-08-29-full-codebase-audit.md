# Neural Computer — Full Codebase Audit

**Date:** 2026-08-29
**Scope:** Entire `neural-computer` repository as of `main` (`53a97de`). Every source file under `src/`, every test, every config, every architecture doc, both design specs, both shipped plans, CI, packaging, and the dependency-graph tool.
**Method:** Line-by-line read of all 20 source files and 13 test files; cross-check against specs, CHANGELOG, AGENTS.md, CLAUDE.md, README, and `docs/architecture/*`; no JSON-UI or memoryjs source was present in this environment, so upstream behavior is flagged where NC's claims depend on it rather than invented.
**Verdict:** The runtime is a carefully designed v1 scaffold with real invariant thinking and a history of catching its own bugs. It is not a product, several of its loudest correctness claims are false, and the documentation has drifted far enough that an agent following AGENTS.md today will implement against a stale world.

This is not a drive-by. Every finding below cites a file, a claim, or both. Nothing is deferred to "later" without a reason it cannot be established from the tree.

---

## 1. What this repo actually is

`package.json` describes "an LLM-driven runtime" that wraps JSON-UI and memoryjs "with a TypeScript orchestrator dispatching real computation to a Python subprocess."

What ships:

- A React catalog renderer (`NCRenderer`, five components) bound to a staging buffer.
- A runtime handle with a one-at-a-time intent gate and a headless observer cache.
- A stub intent handler that maps `IntentEvent → UITree` via a caller-supplied pure function. No Anthropic call. No Python subprocess. No orchestrator loop.
- A memoryjs projection function that is never wired by NC itself; callers must call `createObservableDataModelFromGraph` from memoryjs.

`@anthropic-ai/sdk` is a production dependency and is imported nowhere. The Python REPL is a README paragraph. The "Neural Computer" is a composer of two unpublished sibling libraries plus a stub.

That is a legitimate v1. Calling it an LLM-driven runtime with a computation arm is marketing copy sitting in `package.json`, README, OVERVIEW, and CLAUDE.md.

---

## 2. What is genuinely good

Honesty requires listing this, because the bugs below sit on top of real engineering:

- Staging-buffer access discipline is a real architectural idea. Intents as the only LLM flush boundary is the right call.
- The post-ship Opus review items in CHANGELOG (dropped `action.params`, swallowed `emitIntent` rejections, Zod-strip phantom IDs, missing `react/jsx-runtime` alias, Invariant 4 untested) are real bugs that were actually fixed, and the regression tests for those fixes are pointed.
- `emitIntent` captures the handler before `await`. That is the correct concurrent-swap discipline.
- Observer failure isolation (Invariant 13) is implemented, tested, and the throwing-registry trick is documented why unknown types would not have exercised the catch path.
- Buffer-isolation is enforced by a meta-test, not a comment.
- `useCommittedTree` correctly locks `commitMode`. The hook itself is fine. The problem is that the main mounting path never uses it.
- TypeScript is strict (`noUncheckedIndexedAccess`). Test file count (66 `it()` blocks / 13 files) matches README and INVARIANTS.md, not CLAUDE.md.

The team can do careful work. The rest of this document is about where that care stopped, or where the docs kept claiming it after it stopped.

---

## 3. Critical — stated invariants that the code does not keep

### NC-001 — Invariant 8 is not enforced at the render boundary

**Claim (spec line 67, INVARIANTS.md):** "Attempting to render a tree with two fields sharing the same `id` raises a catalog validation error _before the tree reaches JSON-UI_."

**Code (`src/renderer/nc-renderer.tsx`):** `catalog.validateTree(tree)` runs inside `useLayoutEffect`. The JSX unconditionally mounts `<Renderer tree={tree} registry={registry} />` with the raw, possibly-invalid tree.

Effects run after commit. An invalid tree is already in the React fiber tree, already walked by `@json-ui/react`'s `Renderer`, already instantiated NC components, already calling `useStagingField` on colliding IDs, _before_ validation runs. Failed validation only skips reconcile and observer update. It does not skip render.

The tests for Invariant 8 prove `validateTree` returns `success: false` and that reconcile is skipped. They never assert the invalid tree is absent from the DOM. They cannot, because it is present.

This is the same class of bug as the Zod-strip regression (walk `result.data`, not `tree`) except applied to the React render itself: validation and rendering are on different paths, and rendering is the one without the guard.

**Fix shape:** Validate during render (or `useMemo` on `tree`), keep a last-good validated tree in state/ref, and pass _that_ to `<Renderer>`. Do not pass `tree` through just because the parent set it.

### NC-002 — React and the observer do not see the same tree (Invariant 12 hole)

**Claim (Invariant 12, Path C spec Rule 2):** After a successful commit, `getLastRender()` is derived from the same validated tree that drove the React render. Observer is passed `result.data` (Zod-stripped).

**Code:** Observer gets `result.data`. React `<Renderer>` gets raw `tree`. Zod v4 strips unknown keys. A Container with a stray `id: "phantom"` is the exact case the post-ship review already caught for _reconcile_. The review did not apply the same fix to the React render path.

Consequence: React components can observe props the catalog rejected; the LLM observer cannot. "The LLM sees what the user sees" is false whenever the LLM emits extra keys — which an LLM will.

`extraRegistry` makes this worse: NCRenderer will render caller-supplied types; `ncHeadlessRegistry` will not. Path C Open Question 2 deferred headless registry override "until a real use case emerges" while `extraRegistry` already exists on the React side. Using the documented React extension API silently desynchronizes Invariant 12.

### NC-003 — Field-ID type stability is specified and unimplemented

**Claim (spec Rule 3):** "Replacing an input in place: Same ID, different component type. This is a catalog error and must be caught by validation."

**Code:** `validateUniqueFieldIds` (via `catalog.validateTree`) checks uniqueness within _one_ tree. Nothing compares ID-to-component-type across commits. An `id: "email"` TextField can become a Checkbox on the next tree. Staging still holds a string. `NCCheckbox` does `checked={value ?? false}` on that string. React will not treat this as a catalog error. The user's value is misinterpreted, not dropped.

No test exists for this case.

### NC-004 — Backpressure UX was forbidden to ship as "deferred" and shipped as silent drop

**Claim (spec Open Question 2, explicit):** "The first implementation must commit to one of these before shipping; 'deferred' is not an acceptable end state." Candidates: disabled button, toast, silent drop, queued replay.

**Code:** Silent drop. `console.warn`. `intentInFlight` is a closed-over boolean inside `createNCRuntime`. It is not on `NCRuntime`. `NCButton` has no `disabled`, no `aria-busy`, no knowledge the gate exists. CHANGELOG "Known deferred items" lists "Backpressure UX" as a follow-up spec.

A user who double-clicks Submit loses the second click with no UI signal. The runtime cannot even be used to implement the disabled-button option without adding a getter or subscription the public interface does not have.

This is a shipped spec violation, not a roadmap item.

### NC-005 — `emitIntent` contract is self-contradictory and the implementation matches the second sentence

JSDoc on `NCRuntime.emitIntent`:

> The returned promise always resolves (never rejects)

and later in the same block:

> Handler rejections propagate out through this promise

CHANGELOG Fixed #4 claims the docstring was corrected to "always resolves." The implementation has no `catch` around `await currentHandler(event)`. Handler throws → `emitIntent` rejects → NCRenderer's `.catch` logs it. The first sentence is false. The CHANGELOG's description of the fix is false.

Callers who trust "never rejects" will not attach `.catch`. Direct `emitIntent` users (anyone mounting `NCRenderer` is not the only caller — the method is public) get unhandled rejections.

---

## 4. High — bugs, packaging, and security-adjacent holes

### NC-006 — Invalid trees still render, with unsafe prop casts

`NCText`, `NCTextField`, `NCCheckbox`, `NCButton` all do `element.props as { ... }`. Combined with NC-001, a tree that failed Zod still reaches those casts. Missing `content` renders empty. Missing `id` passes `undefined` into `useStagingField`. This is not theoretical: the Invariant 8 tests _intentionally_ rerender duplicate-ID trees through `NCRenderer`.

### NC-007 — `cancel` is a catalog action that does nothing

`ncStarterCatalog.actions.cancel` is described as "Cancel the current intent (discards staging snapshot)." No code path discards staging on `cancel`. The stub handler does not distinguish action names. There is no default handler. The catalog documents a behavior the runtime will not perform unless every caller reimplements it. An LLM that emits a Cancel button following the catalog description will lie to the user.

### NC-008 — `Button.action.name` is an unconstrained string

Catalog schema: `name: z.string()`. Not an enum of `submit_form | cancel`, not `z.enum` derived from `actions`. Any string reaches `execute()` and then the orchestrator as `action_name`. Combined with a future LLM handler, this is an open action namespace with no catalog-level allowlist. The catalog's `actions` map is documentation for the LLM, not a gate.

### NC-009 — `createNCRuntime.catalogVersion` and `NCRenderer.catalogVersion` are two sources of truth

Runtime option is passed only into `createNCObserver` → headless renderer. IntentEvent `catalog_version` is attached by `JSONUIProvider` from the `NCRenderer` prop. Nothing asserts they match. A caller can construct the runtime with version A, mount NCRenderer with version B, and produce IntentEvents labeled B while the observer was bound with A.

`createNCRuntime`'s `catalogVersion` is optional; `NCRenderer`'s is required. The observer can be constructed with `undefined` version while every intent carries a version string.

### NC-010 — `NCApp` is not the atomic-commit path Invariant 9 depends on

Invariant 9 is implemented by `useCommittedTree` wrapping `useUIStream({ commitMode: "atomic" })`. `NCApp` uses `useState<UITree>(initialTree)` and `setTree` from the stub handler. The primary public mounting component never touches streaming or atomic mode.

When the deferred Anthropic handler streams tokens, `onTreeCommit(partial)` through today's `NCApp` _will_ reconcile against partial trees. The invariant is opt-in via a hook that the documented quickstart does not use. COMPONENTS.md claims the `useCommittedTree` error-path test leaves the buffer untouched; that test never creates a staging buffer. It only asserts `tree` stays null on fetch rejection.

Invariant 9 is a property of an unused hook plus an architectural hope, not of the app you actually mount.

### NC-011 — React is a dependency, not a peerDependency; the vitest alias is test-only

CHANGELOG: "Added `react-dom` to `dependencies` (NC is a React app, not a library)." The package exports `NCApp`, `NCRenderer`, hooks, and a public barrel. It is a library.

`react` / `react-dom` in `dependencies` plus no `peerDependencies` means consumers get NC's React _and_ their own. The vitest `resolve.alias` that exists specifically because two Reacts explode hooks does not apply to a bundler consuming `neural-computer` from npm. The two-React failure mode the project already hit in tests is waiting in production.

`package.json` also has no `exports` map, no `files` allowlist, `"main": "./dist/index.js"` with `"type": "module"` and a CJS build that is not wired, and a single tsup entry that pulls React into any import of `createStubIntentHandler`. Server-side orchestrator code cannot import the stub without a React graph.

### NC-012 — `"use client"` is on leaf files and will not survive the public bundle

`src/index.ts` (the tsup entry) has no `"use client"` directive. `nc-app.tsx`, `nc-renderer.tsx`, and `input-components.tsx` do. Bundling from the barrel collapses those directives. Next.js App Router consumers importing from `neural-computer` will treat the package as a Server Component and fail on hooks.

There are no subpath exports (`neural-computer/react` vs `neural-computer/orchestrator`) to separate the graphs.

### NC-013 — Observer cache is a mutable shared object

`getLastRender()` returns `lastRender` by reference. Any caller (orchestrator, test, diagnostics) that mutates `node.props` corrupts the cache the next LLM observation will read. No freeze, no clone, no `Readonly` at the type level beyond whatever `NormalizedNode` already is (and object properties remain mutable in JS).

### NC-014 — `defaultNCProjection` is prototype-pollution-shaped

```ts
entitiesByName[entity.name] = projected;
entitiesByType[entity.entityType] ??= [];
```

Keys come from memoryjs entity names and types. Those are LLM-influenced strings. Assigning `__proto__` or `constructor` onto a `{}` object is a classic pollution gadget. Use `Object.create(null)` or a `Map`. Duplicate entity names silently overwrite; no warning.

### NC-015 — `serialize("html")` is a footgun next to user-controlled staging

The API exists for "diagnostic preview." Headless TextField bakes `currentValue` from staging into props. If any caller does `element.innerHTML = observer.serialize("html")` and the HTML serializer does not exhaustively escape (this environment could not read `@json-ui/headless` to verify), that is XSS of user input plus LLM-emitted tree text.

Even if the serializer escapes, shipping HTML of staging values invites the mistake. There is no warning in the JSDoc that the string is unsafe for `innerHTML`.

### NC-016 — Unbounded staging values, unbounded observer JSON, no intent payload cap

`NCTextField` is an unconstrained `<input>`. Staging accepts whatever `setValue` is given. IntentEvent snapshots the full buffer. Observer `serialize("json-string")` JSON.stringifies the whole tree. A paste of a 20 MB string becomes an LLM prompt and a layout-effect headless walk. There is no max length in the catalog schema (`z.string()`, not `.max()`), no truncation, no backpressure on payload size. The only backpressure is "one intent at a time."

### NC-017 — `destroy()` does not cancel in-flight work and does not clear the handler's `setTree`

`destroy()` sets `destroyed`, nulls the handler slot, destroys the observer. An in-flight `currentHandler` (captured before await) still runs. `NCApp`'s handler still calls `setTree`. `NCApp`'s `useEffect` has no cleanup, so unmount does not uninstall the handler. React 19 is lenient about setState-on-unmount; it is still a leaked callback holding the last `setTree` and whatever the handler closed over (including the runtime).

`destroy()` during in-flight is exercised by the backpressure integration test (`releaseFirst(); runtime.destroy();` without awaiting the first handler). That test does not assert post-destroy behavior.

### NC-018 — CI pins GitHub Actions SHAs and then checks out sibling repos at floating default branch

`actions/checkout`, `setup-node`, `setup-bun` are SHA-pinned. `danielsimonjr/memoryjs` and `danielsimonjr/JSON-UI` are checked out with no `ref:`. A push to those defaults changes what CI typechecks against. Combined with `file:` dependencies, this repo has no lock on its actual API surface. A breaking JSON-UI commit is an NC CI failure or, worse, a silent behavior change if types still line up.

---

## 5. Medium — real defects, missing contracts, weak tests

### NC-019 — `extraRegistry` can reintroduce the dropped-`action.params` bug

Registry merge is `{ ...buildDefaultRegistry(), ...extraRegistry }`. A caller who overrides `Button` with a component whose `action` type is `{ name: string }` silently drops params again. No warning. The Critical Convention in AGENTS.md cannot be enforced across an extension point that replaces the component.

`NCApp` does not plumb `extraRegistry` at all. The API exists only on `NCRenderer`. Two mounting paths, two feature sets.

### NC-020 — Catalog and renderer catalogs are not identity-checked

`createNCRuntime({ catalog })` binds the observer. `NCRenderer({ catalog })` validates. Docs say they MUST be the same object. Nothing compares them. Two catalogs with the same name and different Zod shapes produce observer/React split-brain that Invariant 12 tests will not catch (those tests pass the same catalog both times).

### NC-021 — `useLayoutEffect` try/catch lies about buffer state

```ts
try {
  const liveIds = collectFieldIds(result.data!);
  runtime.stagingBuffer.reconcile(liveIds);
  runtime.observer.render(result.data!);
} catch (err) {
  console.warn("[NC] Reconcile threw; buffer untouched:", err);
}
```

If `reconcile` succeeds and something later in the block throws, the warning says the buffer is untouched. It is not. `observer.render` currently swallows its own errors, so this is latent — until someone removes that inner catch, or `collectFieldIds`/`reconcile` is not atomic (upstream, unverified here).

`result.data!` non-null assertion: if `success === true` with undefined `data`, this throws, hits the catch, and claims buffer untouched (true in that case). Still a landmine.

### NC-022 — React Strict Mode double-fires observer.render

`useLayoutEffect` without cleanup, in Strict Mode, runs twice on mount. `getLastRenderPassId()` becomes 2 after the first commit. Tests do not wrap in StrictMode (`@testing-library/react` default). Production Next.js / CRA StrictMode will disagree with tests that expect passId `=== 1`. Not a functional break, but Invariant 12's "pass ID is a commit counter" is not a commit counter under Strict Mode; it is an effect-run counter.

### NC-023 — Buffer-isolation regex is bypassable

Forbidden patterns are `from "..."` only. They miss:

- `require("react")`
- `import("react")` / `import("@json-ui/headless")`
- `from "@json-ui/react/anything"`
- `from '@json-ui/react'`
- side-effect `import "react"`
- re-export `export { x } from "react"`

The test is better than nothing. It is not a compiler. Task 12 in the v1 plan promised an ESLint rule. `.eslintrc.cjs` comment says "Buffer-isolation rule added in Task 12." `rules: {}`. The ESLint packages are not in `package.json`. There is no `lint` script. CI runs `bun run --if-present lint`, which no-ops.

### NC-024 — `NC_CATALOG_VERSION` brand is a comment

`string & { readonly __brand: "NCCatalogVersion" }` is erased. Every call site uses `as NCCatalogVersion`. TypeScript will not stop a wrong string without the cast, and with the cast it stops nothing. Catalog versioning / migration is listed as deferred; the brand exists to look like it isn't.

### NC-025 — Empty and pathological field IDs

`id: z.string()` allows `""`, `" "`, `"."`, `"__proto__"`. Duplicate empty IDs might collide. Staging keyed on `""` is a debugging nightmare. No `.min(1)`, no pattern, no reserved-word check.

### NC-026 — `NCApp` ignores `initialTree` after mount

Standard `useState(initial)` trap, undocumented. Parent passes a new `initialTree` (route change, reset) and NCApp keeps the old tree. No `key=` guidance in README. No `tree` / `onTreeChange` controlled mode.

### NC-027 — Headless Button copies raw `element.props` while React Button reads a narrow shape

Comment claims `action.params` "arrive pre-resolved by headless context's resolveActionWithStaging pass." The component does not resolve anything; it casts and forwards. If that upstream pass is real, observer Buttons show resolved params that the React tree's `element.props` still hold as `{ path: "email" }` until click. That is another Invariant 12 split: LLM sees resolved action params in the tree view; the user-facing React tree still has DynamicValue objects in props (they only resolve at click). Could not verify the headless walker against source in this environment — treat as an unverified assumption the comment states as fact.

### NC-028 — Observer `currentValue` path is untested through React commits

Path C's test plan: type into TextField → next tree commit → `getLastRender()` includes `currentValue`. Implemented integration test: type → click (no tree commit) → assert `currentValue` is _absent_. That second assertion is correct for "observer is tree-commit, not keystroke." The spec's actual `currentValue`-after-commit path is only covered by calling headless components with a synthetic context, not by `NCRenderer` reconciling then `observer.render`. Nobody tests that a post-submit tree which _keeps_ the email field bakes the staging value into the observer.

### NC-029 — `createNCRuntime` is async for no reason

Comment: "async to leave room for future initialization." Every caller awaits. There is no `await` in the body. This forces `async` tests, forbids sync construction in `useMemo` without a wrapper, and is a footgun for React (you cannot call it during render). Either hydrate something or make it sync.

### NC-030 — No Error Boundary, no validation error surface

Failed `validateTree` is `console.warn`. The user still sees the invalid tree (NC-001). Host apps get no `onValidationError` callback. `NCApp` has no error boundary. A throw in an NC component (bad cast, hook misuse) unmounts the entire host tree.

### NC-031 — `onIntent` and `NCButton` fire-and-forget

Clicks do not await the handler. There is no pending UI. Combined with NC-004, the user has no idea whether the click was accepted, rejected, or still running. `.catch` to `console.error` is a developer diagnostic, not a product behavior.

### NC-032 — Tests leak timers and in-flight promises

Backpressure integration test destroys the runtime while the first handler is parked on a deferred. `handle-intent.test.ts` uses `Date.now()` around `setTimeout(5)` — timing-sensitive, will flake under load. Many tests `setTimeout(0)` inside `act` to flush promises instead of flushing the emitIntent promise directly. No `afterEach` that calls `runtime.destroy()`; tests that throw before `destroy()` leak observer/renderer resources.

### NC-033 — `NCRuntime` type test does not mention `observer`

`nc-types.test.ts` checks `stagingBuffer`, `durableStore`, `emitIntent`, `setIntentHandler`, `destroy`. Path C added `observer` to the interface. The structural type test was not updated. A regression that dropped `observer` from this test's expectation list would not fail that test; other tests would. The type test is incomplete advertising.

### NC-034 — `input-components.test.tsx` does not test the thing that already broke once

NCButton tests: "renders the label prop." That's it. Params forwarding, `.catch` on `execute`, missing-action click, DynamicValue — all live only in integration tests. COMPONENTS.md says this file covers "action firing." It does not.

### NC-035 — No test that handler rejection clears `intentInFlight`

`finally` does clear it. There is no test that a throwing handler allows a subsequent emit. If someone "fixes" NC-005 by swallowing rejections inside `emitIntent` and accidentally removes `finally`, or moves the flag, the recovery path is untested. context.test.ts never installs a rejecting handler.

### NC-036 — `emitIntent` after `destroy`, `setIntentHandler` after `destroy` are untested

Code paths exist (`console.warn`, return). Tests only check destroy idempotency and that observer exists before destroy.

### NC-037 — Projection drops relation structure

Documented as deferred. The durable store the LLM is supposed to "read freely" is projected to `entitiesByType`, `entities` (by name), and a scalar `relationCount`. Graph edges are invisible to any UI bound to this projection. `createdAt` / `lastModified` become `""` when missing, indistinguishable from an actual empty timestamp.

### NC-038 — `tools/create-dependency-graph` is a nested package `docs:deps` does not install

Root `npm run docs:deps` is `npx tsx tools/create-dependency-graph/create-dependency-graph.ts --include-tests`. The tool imports `js-yaml`, declared only in `tools/create-dependency-graph/package.json`. Root `package.json` does not depend on `js-yaml`. Running the documented command from a clean root install fails unless tsx happens to find a hoisted copy.

The generated architecture files were last stamped 2026-04-16 and do not include `src/observer/` (DEPENDENCY_GRAPH module list: app, catalog, entry, memory, orchestrator, renderer, runtime, types). TEST_COVERAGE.md reports 17 source files; there are 20. unused-analysis.md lists `src/types/nc-types.ts` as unused (it is the type source for the whole runtime). COMPONENTS.md has no observer section. The inventory tool was not re-run after Path C, and several of its "unused" conclusions are false negatives from barrel-export blindness.

### NC-039 — Mixed package managers, conflicting getting-started docs

Repo has `bun.lock`, no root `package-lock.json`. CI: `bun install --frozen-lockfile`. README: `npm install`. Dependabot: `package-ecosystem: bun`. `engines.node: >=18` while CI uses Node 22 and Bun 1.4.0. React 19 on Node 18 is not a combination anyone has tested in this CI. `dev` script is `tsx watch src/index.ts` — watching a re-export barrel. There is no example app, no playground, no way to "run" NC.

### NC-040 — ESLint is theater

`.eslintrc.cjs` requires `@typescript-eslint/parser` and `@typescript-eslint` plugin. Neither is a dependency. `extends: []`, `rules: {}`. Four `eslint-disable` comments for `no-explicit-any` in a project that does not run that rule. CLAUDE.md: "No lint script exists yet." Correct. CI's `--if-present lint` hides that.

### NC-041 — `passWithNoTests: true` left in vitest config

Comment: "Task 1 scaffold." There are 66 tests. The flag means a glob mistake that matches nothing is a green CI. Delete it.

### NC-042 — `skipLibCheck: true`

Hides type errors in `@json-ui/*` and memoryjs. Given those are `file:` siblings whose `dist/` is the API, this is how NC CI stays green while the siblings drift.

### NC-043 — No Prettier config, format script is unanchored

`npm run format` runs prettier on `**/*.{ts,tsx,json,md}` with defaults. No `.prettierrc`, no `.prettierignore`. Running it will churn generated `docs/architecture/dependency-graph.json` and lockfiles if someone formats the whole glob. No format check in CI.

### NC-044 — Dependabot auto-merge of minor/patch

`.github/workflows/dependabot-automerge.yml` squash-merges Dependabot patch and minor with `gh pr merge --auto`. This is a 0.x library whose real API is unpublished siblings. Auto-merging `vitest` 4.x minors, `jsdom`, `@anthropic-ai/sdk` (unused), and GitHub Actions is how you get "CI was green yesterday." Labels `[dependencies, npm]` are referenced; whether those labels exist in the GitHub repo was not verified.

`@anthropic-ai/sdk` will keep getting Dependabot PRs for a package NC does not import.

### NC-045 — Quickstart documents the anti-pattern AGENTS.md forbids

README `buildIntentHandler={(setTree) => createStubIntentHandler(...)}` is an inline arrow. NCApp JSDoc: callers SHOULD memoize; inline arrows reinstall the handler every commit. AGENTS.md: "The integration tests pin the factory at module scope so they don't hit this path." `nc-app.test.tsx` uses inline arrows in both tests. The documented example, the tests, and the critical convention are three different stories.

### NC-046 — Specs still say "not yet implemented"

Both `docs/specs/2026-04-11-ephemeral-ui-state-design.md` and `docs/specs/2026-04-16-headless-dual-backend-design.md` open with `**Status:** Design spec (not yet implemented)`. Both are shipped. Agents are told to read these specs before touching `src/renderer/`. The file-layout sketches (`staging-buffer.ts`, `intent-event.ts`, `loop.ts`, `C:\Users\danie\Dropbox\Github\JSON-UI`) describe a repo that does not exist. The Windows absolute path is an author-machine leak.

### NC-047 — CHANGELOG Unreleased is an autobiography, not a changelog

Everything is under `[Unreleased]`. "v1 shipped 2026-04-15" appears in README. No `0.1.0` release section. The Added section contains both "Path C implemented" and, in the design-spec bullet, "Implementation is the next task." Known deferred still lists "`@json-ui/headless` dual-backend session" with "no v1 code mounts a headless session" — Path C mounted it. Public barrel counts in the same file: 13 values / 24 total, vs 15 / 28 in README.

### NC-048 — CLAUDE.md, AGENTS.md, and architecture docs disagree with the code

| Claim                                           | Where                                                  | Reality                                                    |
| ----------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| 47 tests / 11 files                             | CLAUDE.md, CHANGELOG scaffold bullet                   | 66 / 13                                                    |
| 11 invariants                                   | CLAUDE.md, OVERVIEW (in one leftover phrase in CLAUDE) | 13                                                         |
| Five named state surfaces                       | CLAUDE.md, AGENTS.md, Path C spec ("five existing")    | Spec body lists six; Path C adds observer cache as another |
| Module map has no `observer/`                   | CLAUDE.md, AGENTS.md                                   | `src/observer/` is a public module                         |
| `@json-ui/headless` not listed as a `file:` dep | CLAUDE.md "three dependencies"                         | `package.json` has four file: deps including headless      |
| `CreateNCRuntimeOptions` is `{ durableStore }`  | COMPONENTS.md                                          | Requires `catalog`, optional `catalogVersion`              |
| Public barrel 13 symbols                        | COMPONENTS.md                                          | 15 values + 13 types                                       |
| nc-renderer tests: 6                            | COMPONENTS.md                                          | 8                                                          |
| context tests: 7                                | COMPONENTS.md                                          | 8                                                          |
| Staging buffer owned by NCRenderer              | ARCHITECTURE.md state table                            | Created by `createNCRuntime`; renderer only reconciles     |
| In-flight flag owned by renderer wrapper        | Spec                                                   | Owned by `createNCRuntime`                                 |
| 17 TS files, 844 LOC                            | DEPENDENCY_GRAPH.md                                    | 20 source files, 1101 source LOC                           |
| JSON-UI listed without headless                 | README architecture                                    | Headless is a first-class Path C dependency                |
| "Currently 47 tests"                            | CLAUDE.md commands                                     | Stale                                                      |

Agents following CLAUDE.md will not know the observer exists.

### NC-049 — Five / six / seven state surfaces

The original spec names durable state, current UI tree, staging buffer, in-flight flag, catalog version, LLM session state (six), then says the useful guarantee is a narrow observation surface. CLAUDE.md says five. ARCHITECTURE.md says six and lists those six, omitting the observer cache. Path C spec says the observer "joins the five existing named surfaces" and also lists six runtime handles (`stagingBuffer`, `durableStore`, `emitIntent`, `setIntentHandler`, `destroy`, `observer`). AGENTS.md "What Not to Do": "Do not invent new state categories beyond the five named in the active spec." Path C invented one and the what-not-to-do was not updated.

This is not pedantry. The project's own correctness story is "named surfaces with declared read/write boundaries." If the team cannot count them, the discipline is a slogan.

### NC-050 — Invariant 7's original wording is dead; the test tests a different invariant

Original: orchestrator does not import `renderer/staging-buffer.ts`. That file was never in this repo; staging moved to `@json-ui/core`. The test now forbids React, headless, renderer, app, observer. That is good. INVARIANTS.md still explains the migration. The orchestrator today is 46 lines of stub. The isolation test protects a module that does not yet do orchestration. When the Anthropic handler lands and wants `runtime.observer.serialize()`, it must go through `NCRuntime` (allowed) and not `../observer` (forbidden). That is the right rule — if anyone building the real handler reads INVARIANTS.md rather than the regex.

### NC-051 — Risk 1 (LLM acceptance contract) has no prompt and no adversarial tests

Spec: system prompt must declare "accept = emit tree without those fields"; testing must include adversarial malformed trees. There is no system prompt. `generateCatalogPrompt` is never called. Adversarial coverage is duplicate IDs and Zod-strip phantoms — not "LLM accepts but keeps the fields" or "LLM emits a tree that drops the ID the user is still looking at." Behavioral contract is unenforceable without an LLM; the spec said the runtime degrades predictably. Degrade path is console.warn + render anyway (NC-001).

### NC-052 — No SECURITY.md, no threat model, no trusted-tree boundary

UI trees are LLM output. That is untrusted HTML-adjacent structure. React text escaping covers `NCText` content. The catalog does not allow `href`, `src`, or raw HTML _today_. `extraRegistry` can add them tomorrow. Staging snapshots go to the LLM (prompt injection from the user into the next tree). Durable-store paths in DynamicValue (`{ path: "entities/admin/observations" }`) copy durable data into `action_params`. None of this is documented as a security boundary. For an LLM-driven UI that is the product.

---

## 6. Low — structure, a11y, polish, nits that still matter

### NC-053 — Accessibility of starter components is below a production form

- `NCTextField` error span has `role="alert"` but the input has no `aria-invalid` or `aria-describedby`.
- No `htmlFor` / `id` pairing (wrapper `<label>` is OK until someone nests interactive content).
- `NCButton` has no disabled/pending state (see NC-004).
- No focus management when the tree swaps after click; focus is lost.
- No `<form>` / submit-on-enter. Only `type="button"`. Keyboard users tab and click. Enter in a text field does nothing.
- `NCText` is always `<p>`. Headings, lists, status text — all paragraphs.
- No live region for validation failures at the tree level.

### NC-054 — `data-key={element.key}` is not a stable React key

JSON-UI's Renderer presumably keys children. NC also stamps `data-key` on DOM. Fine for tests. Do not confuse with React `key`. Duplicate tree keys vs duplicate field IDs are different namespaces and nothing documents that.

### NC-055 — Headless Container drops all props; React Container ignores them too

Consistent, but `extra` layout props an LLM might emit are stripped by Zod (`z.object({})`) and would also be dropped. There is no layout system. Every screen is an unstyled div stack. That is acceptable for v1; README still sells a "renderer."

### NC-056 — `NCTextField` is `type="text"` only

No email/password/number/textarea. Catalog cannot express them. An LLM that needs a multiline message gets a single-line input. Spec mentions Select as a future input; nothing is stubbed.

### NC-057 — `.dropboxignore` in a GitHub repo

Author's Dropbox workflow leaked. Harmless. Does not belong in a public Apache-2.0 tree any more than `C:\Users\danie\...`.

### NC-058 — Nested `tools/*/package-lock.json` vs root Bun lockfile

Dependabot has a history of bumping `js-yaml` in the nested tool (CHANGELOG of git log: several security patches). Root and tool disagree on how JS is installed. The tool's `engines` and `@types/node` (`^25.0.2`) do not match the root (`@types/node: ^20`).

### NC-059 — `tsup` dts + `"use client"` + CJS/ESM dual package

No `exports` field means Node's dual-package hazard applies if anyone requires the CJS file via guesswork. `main` points at ESM `.js`. CJS output is `index.cjs` (typical tsup) and is unpublished-as-API. Sourcemaps are generated; `package.json` does not list them in a `files` field because there is no `files` field. `private: true` is the only thing preventing an accidental publish of `node_modules`-adjacent junk. `.gitignore` ignores `dist`; consumers of the GitHub repo cannot use the package without building, and the sibling `file:` deps must exist.

### NC-060 — No `sideEffects: false`

Bundlers cannot tree-shake aggressively. Combined with a single entry, importing `NC_CATALOG_VERSION` may pull React.

### NC-061 — Catalog `z.record(z.string(), z.unknown())` for action params

`z.unknown()` lets non-JSON values through if a tree is constructed in-process (not from JSON.parse). Functions, class instances, `undefined` in records. LLM JSON path is fine. The in-process stub `nextTree` path is not validated (NC-010's cousin): `createStubIntentHandler` never `validateTree`s the produced tree.

### NC-062 — Stub handler commits invalid trees

`nextTree` can return garbage. `onTreeCommit` fires. `setTree` updates React. Then NC-001. The stub is the only handler. Every test that uses it with a well-formed tree hides that the stub is not a catalog gate.

### NC-063 — Observer serialize unknown format throws; render failures do not

Asymmetry is fine, but `serialize("bogus")` is the only observer method that throws. After `destroy()`, `serialize` still works on cached data (documented). `render` no-ops. Mixed lifecycle.

### NC-064 — `consecutiveFailures` is unbounded and has no subscriber

Invariant 13 is "detectable." Detectable by polling two getters. No event, no threshold, Open Question 3 deferred circuit breaker. Orchestrator (stub) never reads these counters. The detectability is theoretical until a real handler exists.

### NC-065 — `JSONUIProvider` registry prop is vestigial and NC papers over it

Comment in NCRenderer: pass registry to both Provider and Renderer because Provider's copy is unused. That is an upstream bug NC is encoding as a ritual. If JSON-UI starts consuming the Provider registry and they diverge, NC will not notice (it passes the same object today). Fine. Still a smell that belongs in an upstream issue, not a block comment that will rot.

### NC-066 — `buildDefaultRegistry` uses `as ComponentRenderer` four times

Contravariance workaround. If JSON-UI's `ComponentRenderProps` gains required fields, this will fail at runtime after a `skipLibCheck` CI pass.

### NC-067 — Types-only memoryjs import vs runtime

`projection.ts` imports types from memoryjs. If a consumer never uses the projection, they still need memoryjs installed because it is a `dependency` (not `peer` / `optionalPeer`). Same for `@json-ui/headless` on a React-only host, and `@json-ui/react` on a headless-only host. The package is all-or-nothing.

### NC-068 — `integration.test.tsx` lives at `src/` root

Every other test is colocated. The integration file is a module-level dweller that CLAUDE.md lists in the module map as if it were a feature. Fine. Inconsistent.

### NC-069 — No `CONTRIBUTING.md`, no issue templates, no CODEOWNERS, no `files` in npm sense

Expected for private 0.1.0. README still presents the project as something to `npm install` and import from `"neural-computer"` — a name that is not published.

### NC-070 — Architecture DATAFLOW.md omits the observer

Step 6 lists validate + reconcile. Path C added `observer.render` on the same line in code. DATAFLOW dependency array in the snippet: `[tree, catalog, runtime.stagingBuffer]` — code also has `runtime.observer`. Docs for the core loop are one Path C behind.

### NC-071 — INVARIANTS.md Invariant 7 FORBIDDEN list omits `../observer` in the prose, includes it in the test

Prose: `@json-ui/react`, `@json-ui/headless`, `react`, `react-dom`, `../renderer`, `../app`. Test also has `../observer`. Small, but this is the invariant document.

### NC-072 — `context.test.ts` constructs IntentEvents without `catalog_version`

Runtime unit tests are not going through ActionProvider, so they cannot catch a regression where catalog_version stops being threaded. Integration tests do. Split-brain coverage: the runtime does not attach catalog_version at all (NC-009).

### NC-073 — `useCommittedTree` options type is `Omit<UseUIStreamOptions, "commitMode">`

If upstream adds a required option, this wrapper's tests (mocked fetch, NDJSON patches) become the only documentation of the stream protocol. Those tests are testing JSON-UI, not NC. Valuable as a contract test; brittle as an NC unit test. When JSON-UI changes patch format, NC's Invariant 9 test file breaks for reasons unrelated to NC.

### NC-074 — No coverage thresholds, `test:coverage` exists, CI does not run it

`vitest run --coverage` is not configured with a provider in `vitest.config.ts` (`@vitest/coverage-v8` is not a dependency). `npm run test:coverage` likely errors. CI does not try.

### NC-075 — License header vs LICENSE file

Apache-2.0 LICENSE exists. Source files have no SPDX headers. Fine for Apache. package.json matches.

### NC-076 — `createHtmlSerializer({ emitters: {} })` is a module-level singleton

Shared across all observers in a process. If `createHtmlSerializer` closes over mutable state (unverified), multiple runtimes share it. Cheap today. Global singleton in a library is still a smell.

### NC-077 — Headless TextField/Checkbox omit `currentValue` when `has` is false, including explicit `undefined`

If staging `set(id, undefined)` or a value that `has` reports true with get undefined — depends on upstream StagingBuffer. If `has` is true for a set-undefined, `currentValue: undefined` is added. JSON.stringify drops `undefined` in objects... actually JSON.stringify _omits_ `undefined` values in objects. The "omit key for untouched" compactness goal can be undone by JSON serialization anyway for other fields.

### NC-078 — No `catalog.validateTree` on `initialTree` before first paint

First paint uses the raw initial tree. `useLayoutEffect` then validates. First frame can be invalid (NC-001 applied to t=0).

### NC-079 — `NCApp` useEffect deps `[runtime, buildIntentHandler]` miss nothing React cares about except intentional omit of `setTree` (stable)

OK. Missing cleanup (NC-017). Re-running installs a new handler without waiting for in-flight (documented as OK). Strict Mode double-mount installs twice. OK.

### NC-080 — Public export of `createNCObserver` and `ncHeadlessRegistry`

Path C rationale: advanced callers, tests, CLI previews. Also a way to mount a second observer while spec says dual mounting is undefined. The test-only `registry` override on `CreateNCObserverOptions` is in the public type. Production callers can inject a throwing registry by accident.

### NC-081 — `NormalizedNode.meta.visible` is hardcoded `true`

No visibility pruning in NC's headless components. If JSON-UI's walker supports hiding, NC's registry ignores it. LLM always sees every node NC's registry emits. Fine until someone adds `visible` to the catalog.

### NC-082 — Comments in production code retell CHANGELOG

`input-components.tsx` and `nc-renderer.tsx` contain multi-paragraph histories of the Opus review. AGENTS.md already indexes those traps. The comments are _why_-adjacent but they are also changelog-in-source. They will diverge (they already mention "April-15" while Path C is April-16).

### NC-083 — `docs/plans/2026-04-11-ephemeral-ui-state-plan.md` is superseded and still in the tree without a banner at the top of agent entry points

AGENTS.md correctly points at the April-15 plan. An agent that glob-reads `docs/plans/` will follow the April-11 plan that hand-rolls a staging buffer JSON-UI already shipped. The April-11 plan itself is honest that Invariant 10 cannot be implemented at the buffer layer. Good plan, wrong time. Needs a one-line SUPERSEDED header if it doesn't have one at a glance — the v2 plan says it supersedes; the April-11 file's own status should scream.

### NC-084 — OVERVIEW "Maintained by: Daniel Simon Jr." and no CODEOWNERS

Not a bug. Ownership of a private 0.1.0.

### NC-085 — GitHub CI `bun run --if-present lint` then test then build; no `npm run format --check`

Format drift will not fail CI. Typecheck will.

### NC-086 — `overrides` pin react to `$react`

Good for install-time dedup of _this_ package's tree. Does nothing for the consumer's tree (NC-011).

### NC-087 — Observer render is synchronous inside `useLayoutEffect`

Path C spec: "always cheap (only renders when called)." A large tree: Zod validate + collectFieldIds + reconcile + full headless walk, all before paint. The ARCHITECTURE.md claim "the reconcile is a pure in-memory operation, so the timing has no perf cost" is false once observer.render is on the same effect. Headless walk of a 500-node tree on every commit is a perf cost, and it is on the layout path.

### NC-088 — No React.memo on NC components

Every tree commit reallocates `element.props` objects (new tree from LLM). Memo would not help much without a stable element identity from the Renderer. Depends on whether JSON-UI's Renderer preserves component instances by key. Unverified. If it does not, every keystroke is isolated (good) but every commit remounts inputs (bad: focus loss, already NC-053).

### NC-089 — `defaultNCProjection` copies observation arrays and rebuilds both indexes on every graph snapshot

memoryjs adapter will call this on every transaction. O(entities + relations) allocations. Fine for small graphs. No incremental update. `relationCount: relations.length` is the only relation feature and still walks the array for length (cheap).

### NC-090 — LLM observation size

`serialize("json-string")` of a NormalizedNode with nested children, plus `staging_snapshot`, plus durable projection, plus catalog prompt (when a real handler exists) is multiple copies of the same user data. No compaction strategy beyond "omit currentValue when untouched" — and that omit is undone the moment a field is touched and a tree is re-committed.

### NC-091 — Test "globals: true" while every file still imports from `vitest`

Harmless duplication. Suggests copy-paste from a plan that did not pick one style.

### NC-092 — The product-shaped hole

There is no `createAnthropicIntentHandler`. There is no `src/compute/`. There is no example. There is no way to see a Neural Computer on a screen except by writing the README snippet against unpublished siblings. The 13 invariants are properties of a form widget and a cache. Evaluating this repo as "an LLM-driven runtime inspired by Zhuge et al." on those terms, it is not that yet. Evaluating it as "a staging-buffer integration on top of JSON-UI," it is a solid, over-documented, under-packaged library with a handful of real invariant bugs.

---

## 7. Invariant-by-invariant honesty

| #   | Stated guarantee                         | Honest status                                                                                                                                                                              |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Reconcile drops missing IDs              | **Held**, for trees that pass validation. Invalid trees skip reconcile (so IDs that _should_ drop, do not).                                                                                |
| 2   | Reconcile preserves present IDs          | **Held**, same caveat.                                                                                                                                                                     |
| 3   | Preserve across prop changes             | **Held** for same component type. **Fails** spec's same-ID-different-type case (NC-003).                                                                                                   |
| 4   | Snapshot non-destructive                 | **Held**. Tested.                                                                                                                                                                          |
| 5   | Intent carries full snapshot             | **Held**, via JSON-UI ActionProvider. NC integration test covers it.                                                                                                                       |
| 6   | params / snapshot unmerged               | **Held**. Tested. The NCButton params-forwarding fix is load-bearing.                                                                                                                      |
| 7   | Orchestrator isolation                   | **Held** for static `from` imports of a 46-line stub. Regex is incomplete (NC-023).                                                                                                        |
| 8   | Duplicate IDs never reach JSON-UI        | **Failed** (NC-001). Validation exists; it is after render.                                                                                                                                |
| 9   | No reconcile on partial/invalid trees    | **Partial.** Invalid: reconcile skipped, render not. Partial streams: only if caller uses `useCommittedTree`. `NCApp` does not.                                                            |
| 10  | In-flight intents rejected, not queued   | **Held** as a gate. **Failed** as a product (NC-004). Rejected clicks are silent. Flag is not observable.                                                                                  |
| 11  | DynamicValue pre-resolve from staging    | **Held** in the React click path (integration test). Headless path is an upstream assumption (NC-027).                                                                                     |
| 12  | Observer shadows React                   | **Partial.** Same _keys_ on happy path. Different _props_ (raw vs Zod-stripped). Breaks with `extraRegistry`. `currentValue`-after-commit untested through NCRenderer. Strict Mode passId. |
| 13  | Observer failure isolated and detectable | **Held** for injected throwing registry. Detectable only by polling. Stub handler never polls.                                                                                             |

"All 13 invariants have test coverage" is true in the sense that each has an `it()`. It is false in the sense that several tests assert a weaker property than the invariant text.

---

## 8. Security notes (consolidated)

This is not a networked server. The trust boundary is "LLM output is a UI tree; user input is a staging snapshot that returns to the LLM."

1. **XSS:** React's default escaping covers text nodes. `serialize("html")` plus `innerHTML` is the break glass. `extraRegistry` can add `dangerouslySetInnerHTML` or `href="javascript:"` without NC noticing. Catalog today has no URL fields — keep it that way or sanitize.

2. **Prototype pollution:** NC-014. Entity names from the graph.

3. **Prompt injection:** User types into TextField; snapshot goes to the (future) LLM; LLM emits the next tree. That is the architecture. Document it. Do not put secrets in `durableStore` paths that DynamicValue can name, and do not put secrets in Text `content` the LLM generated from user input.

4. **Action namespace:** NC-008. Future handler must allowlist `action_name` against the catalog.

5. **Supply chain:** Unused `@anthropic-ai/sdk`; floating sibling refs in CI; Dependabot automerge; `file:` deps that npm cannot reproduce; `skipLibCheck`.

6. **PII:** Staging values appear in `console.warn` paths only indirectly; they appear in observer cache, IntentEvent, and any debug HTML. `destroy()` does not zero the staging buffer or the observer cache (spec: final-frame read is allowed). Process dumps will contain field values.

7. **Mutable observer cache:** NC-013. Integrity of the LLM's view.

---

## 9. Performance notes (consolidated)

1. Layout-effect does validate + walk + reconcile + headless render before paint (NC-087).
2. Headless is a second full tree walk, every commit, even when the orchestrator will not read until the next click.
3. `JSON.stringify` of NormalizedNode on each observation (caller-driven, but the API invites it).
4. Projection rebuilds full maps.
5. No component memo; likely full React walk each commit.
6. Single bundle; no code splitting between React and orchestrator.
7. `buildDefaultRegistry()` runs inside `useMemo` keyed only on `extraRegistry`; default registry object is new every extraRegistry identity change (including undefined → undefined is stable).
8. Staging snapshots copy the full map on every intent (correct, and O(fields)).

None of this matters at five-component demo scale. It matters the moment an LLM emits a dashboard with a hundred fields and the observer stringifies it into a prompt on every submit.

---

## 10. Files reviewed

Source (20): `src/index.ts`; `types/nc-types.ts`, `types/index.ts`; `catalog/nc-catalog.ts`, `catalog/index.ts`; `runtime/context.ts`, `runtime/index.ts`; `orchestrator/handle-intent.ts`, `orchestrator/index.ts`; `memory/projection.ts`, `memory/index.ts`; `renderer/nc-renderer.tsx`, `input-components.tsx`, `use-committed-tree.ts`, `renderer/index.ts`; `app/nc-app.tsx`, `app/index.ts`; `observer/nc-observer.ts`, `nc-headless-components.ts`, `observer/index.ts`.

Tests (13): colocated tests plus `src/integration.test.tsx` and `orchestrator/buffer-isolation.test.ts`. 66 `it()` blocks.

Docs: README, CHANGELOG, AGENTS.md, CLAUDE.md, both specs, three plans (April-11, April-15, April-16), architecture set (OVERVIEW, ARCHITECTURE, COMPONENTS, DATAFLOW, API, INVARIANTS, DEPENDENCY_GRAPH, TEST_COVERAGE, unused-analysis, generated JSON/YAML).

Config: package.json, bun.lock (presence), tsconfig, tsup, vitest, eslintrc, gitignore, dropboxignore, LICENSE, GitHub workflows, dependabot, tools/create-dependency-graph.

Not present in this environment: `node_modules`, `../JSON-UI`, `../memoryjs`. Upstream APIs are taken from NC's comments and tests, not re-verified against sibling source.

---

## 11. Suggested work order (if anyone fixes this)

Not calendar. Dependency order:

1. **NC-001 / NC-002** — last-good validated tree drives `<Renderer>` and observer. Same object. Invalid trees do not paint.
2. **NC-004 / expose `isIntentInFlight`** — disable the button; stop violating the spec's "deferred is not acceptable."
3. **NC-005** — pick one emitIntent contract, test throwing handlers, test flag recovery.
4. **NC-011 / NC-012** — peerDependencies, `exports` subpaths, `"use client"` on the React entry.
5. **NC-003** — ID-to-type stability across commits, or explicitly amend the spec.
6. **NC-007 / NC-008** — cancel actually discards, or stop advertising it; constrain action names.
7. **NC-010** — either NCApp uses atomic commits or Invariant 9's text stops claiming the app does.
8. **Burn down documentation** — one number for tests, invariants, surfaces, exports. Specs marked shipped. CHANGELOG Known deferred that is no longer deferred. CLAUDE.md module map includes observer. Generate `docs:deps` after Path C or stop checking in stale generated files.
9. **Remove `@anthropic-ai/sdk`** until the handler spec exists. Pin sibling SHAs in CI.
10. **NC-014, NC-013, NC-016** — pollution, freeze cache, cap payload size.
11. Then the real LLM handler, with allowlisted actions and a prompt that states Risk 1.

Until (1) and (2), do not tell agents the 13 invariants are held.
