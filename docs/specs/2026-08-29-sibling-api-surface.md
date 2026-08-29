# Sibling API surface for Neural Computer

**Status:** Landed (2026-08-29). JSON-UI #3 is on `main` (`6fa0f69`, v0.2.0). MemoryJS #114 is on `master` (`af11456`, v3.4.0). NC CI pins those SHAs.
**Date:** 2026-08-29

## What was actually wrong

These are the integration seams that showed up while wiring the LLM handler. None of them were NC bugs that could be fixed only in NC.

**memoryjs `set()` is sync and throws.** JSON-UI's `ObservableDataModel.set` is synchronous. memoryjs durable writes are async transactions. The adapter therefore throws `ReadOnlyMemoryGraphDataError` on `set()` / `delete()` so React `DataProvider` cannot pretend to mutate the graph. That is the right React boundary. The orchestrator method is `adapter.write(path, value)` plus `onWrite` on the factory. NC's `durable_write` tool calls `onDurableWrite`, then `store.write`, then `store.set`.

**JSON-UI `JSONUIProvider.registry` was unused.** NC had to pass the same registry to `JSONUIProvider` and `Renderer`. JSON-UI now publishes registry via context so `Renderer` can omit the prop. `NCRenderer` passes registry only to the provider.

**`ComponentRenderer` rejected memoized host components.** NC's inputs only declare `{element, children}`. TypeScript treats `ComponentType<Props>` as contravariant, which forced six `as ComponentRenderer` casts (audit NC-066). JSON-UI uses a bivariant call signature; NC no longer casts.

**`Catalog<Specific>` is not assignable to `Catalog`.** Method variance. `@json-ui/core` exports `AnyCatalog`. NC re-exports that type from its barrels so hosts keep importing from `neural-computer`.

**React dedup is a consumer issue.** `@json-ui/react` is a `file:` symlink. If JSON-UI's workspace has its own `node_modules/react`, Node walks into it and NC tests get two dispatchers. `vitest.config.ts` aliases stay load-bearing. That is not an API change.

**`useUIStream` is HTTP.** The NC handler is in-process. Do not invent an HTTP server inside NC so the two look the same. Hosts with a patch endpoint keep `useCommittedTree`.

## Patches (historical)

The apply-on-old-SHA patches remain under `docs/patches/` for the record. They landed as:

- JSON-UI `28817c9` — AnyCatalog, `store.write`, registry context (`#3`)
- MemoryJS `1fb7716` — `adapter.write` / `onWrite` (`#114`)

## What this is not

Not a memoryjs graph mutation DSL. `onWrite` still receives `{path, value}`; the host maps that onto `entityManager` / `withTransaction`.
