# Sibling API surface — plan

**Goal:** Name the JSON-UI / memoryjs seams that block a clean NC handler, land compatible NC changes, and leave apply-able patches for the sibling repos (this environment cannot push them).

**Spec:** [`docs/specs/2026-08-29-sibling-api-surface.md`](../specs/2026-08-29-sibling-api-surface.md)

## Done in NC

- `AnyCatalog` alias on the NC types barrel
- `durable_write` always advertised; `onDurableWrite` then `store.write` then `store.set`
- Patches under `docs/patches/`

## After sibling merge

- Pin CI SHAs
- Drop dual `registry` pass and `as ComponentRenderer` casts
- Import `AnyCatalog` from `@json-ui/core`
