# Sibling API surface — plan

**Goal:** Name the JSON-UI / memoryjs seams that blocked a clean NC handler, land the sibling APIs, and consume them in NC without local shims.

**Spec:** [`docs/specs/2026-08-29-sibling-api-surface.md`](../specs/2026-08-29-sibling-api-surface.md)

## Done in NC

- Re-export `AnyCatalog` from `@json-ui/core`
- `durable_write` always advertised; `onDurableWrite` then `store.write` then `store.set` (no local write-probe type)
- `NCRenderer` passes `registry` only to `JSONUIProvider`; no `as ComponentRenderer` casts
- CI pins JSON-UI `6fa0f69` (v0.2.0 + #3) and memoryjs `af11456` (v3.4.0 + #114)
- Historical patches under `docs/patches/`
