# Sibling API surface for Neural Computer

**Status:** Spec + patches (2026-08-29). Sibling repos could not be pushed from this environment (403). Apply the patches locally and open PRs from a principal that can write `danielsimonjr/JSON-UI` and `danielsimonjr/MemoryJS`.
**Date:** 2026-08-29

## What was actually wrong

These are the integration seams that showed up while wiring the LLM handler. None of them are NC bugs that can be fixed only in NC.

**memoryjs `set()` is sync and throws.** JSON-UI's `ObservableDataModel.set` is synchronous. memoryjs durable writes are async transactions. The adapter therefore throws `ReadOnlyMemoryGraphDataError` on `set()` / `delete()` so React `DataProvider` cannot pretend to mutate the graph. That is the right React boundary. The missing piece was an **orchestrator** method: `adapter.write(path, value)` plus `onWrite` on the factory. NC's `durable_write` tool now calls `onDurableWrite`, then `store.write`, then `store.set`.

**JSON-UI `JSONUIProvider.registry` was unused.** NC had to pass the same registry to `JSONUIProvider` and `Renderer`. The JSON-UI patch publishes registry via context so `Renderer` can omit the prop. NC CI still pins the old SHA, so NC keeps passing both until that pin moves.

**`ComponentRenderer` rejected memoized host components.** NC's inputs only declare `{element, children}`. TypeScript treats `ComponentType<Props>` as contravariant, which forced six `as ComponentRenderer` casts (audit NC-066). The JSON-UI patch uses a bivariant call signature.

**`Catalog<Specific>` is not assignable to `Catalog`.** Method variance. NC now exports `AnyCatalog` as the alias. The JSON-UI patch exports the same name from `@json-ui/core`.

**React dedup is a consumer issue.** `@json-ui/react` is a `file:` symlink. If JSON-UI's workspace has its own `node_modules/react`, Node walks into it and NC tests get two dispatchers. `vitest.config.ts` aliases stay load-bearing. That is not an API change.

**`useUIStream` is HTTP.** The NC handler is in-process. Do not invent an HTTP server inside NC so the two look the same. Hosts with a patch endpoint keep `useCommittedTree`.

## Patches

- [`docs/patches/2026-08-29-json-ui-nc-api-surface.patch`](../patches/2026-08-29-json-ui-nc-api-surface.patch) — apply on JSON-UI at `0a81ae8` (branch `cursor/nc-api-surface-1bce`).
- [`docs/patches/2026-08-29-memoryjs-adapter-write.patch`](../patches/2026-08-29-memoryjs-adapter-write.patch) — apply on MemoryJS at `541d42d` (branch `cursor/nc-api-surface-1bce`).

After those merge, bump `.github/workflows/ci.yml` sibling refs and drop the dual registry pass plus the `as ComponentRenderer` casts.

## What this is not

Not a memoryjs graph mutation DSL. `onWrite` still receives `{path, value}`; the host maps that onto `entityManager` / `withTransaction`.
