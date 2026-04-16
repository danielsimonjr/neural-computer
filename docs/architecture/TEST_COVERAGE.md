# Test Coverage Analysis

**Generated**: 2026-04-16

## Summary

| Metric | Count |
|--------|-------|
| Total Source Files | 17 |
| Total Test Files | 11 |
| Source Files with Tests | 13 |
| Source Files without Tests | 4 |
| Coverage | 76.5% |

---

## Source Files Without Test Coverage

The following 4 source files are not directly imported by any test file:

### app/

- `src/app/index.ts` → Expected test: `tests/unit/app/index.test.ts`

### root/

- `src/index.ts` → Expected test: `tests/unit/root/index.test.ts`

### memory/

- `src/memory/index.ts` → Expected test: `tests/unit/memory/index.test.ts`

### types/

- `src/types/index.ts` → Expected test: `tests/unit/types/index.test.ts`

---

## Source Files With Test Coverage

| Source File | Test Files |
|-------------|------------|
| `app/nc-app.tsx` | `nc-app.test.tsx` |
| `catalog/index.ts` | `nc-app.test.tsx`, `integration.test.tsx`, `nc-renderer.test.tsx` |
| `catalog/nc-catalog.ts` | `nc-app.test.tsx`, `nc-catalog.test.ts`, `integration.test.tsx`, `nc-renderer.test.tsx` |
| `memory/projection.ts` | `projection.test.ts` |
| `orchestrator/handle-intent.ts` | `nc-app.test.tsx`, `handle-intent.test.ts` |
| `orchestrator/index.ts` | `nc-app.test.tsx` |
| `renderer/index.ts` | `integration.test.tsx` |
| `renderer/input-components.tsx` | `integration.test.tsx`, `input-components.test.tsx` |
| `renderer/nc-renderer.tsx` | `integration.test.tsx`, `nc-renderer.test.tsx` |
| `renderer/use-committed-tree.ts` | `integration.test.tsx`, `use-committed-tree.test.tsx` |
| `runtime/context.ts` | `nc-app.test.tsx`, `integration.test.tsx`, `nc-renderer.test.tsx`, `context.test.ts` |
| `runtime/index.ts` | `nc-app.test.tsx`, `integration.test.tsx`, `nc-renderer.test.tsx` |
| `types/nc-types.ts` | `nc-types.test.ts` |

---

## Test File Details

| Test File | Imports from Source |
|-----------|---------------------|
| `app/nc-app.test.tsx` | 7 files |
| `catalog/nc-catalog.test.ts` | 1 files |
| `src/integration.test.tsx` | 8 files |
| `memory/projection.test.ts` | 1 files |
| `orchestrator/buffer-isolation.test.ts` | 0 files |
| `orchestrator/handle-intent.test.ts` | 1 files |
| `renderer/input-components.test.tsx` | 1 files |
| `renderer/nc-renderer.test.tsx` | 5 files |
| `renderer/use-committed-tree.test.tsx` | 1 files |
| `runtime/context.test.ts` | 1 files |
| `types/nc-types.test.ts` | 1 files |
