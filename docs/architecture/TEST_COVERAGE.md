# Test Coverage Analysis

**Generated**: 2026-08-29

## Summary

| Metric                     | Count |
| -------------------------- | ----- |
| Total Source Files         | 29    |
| Total Test Files           | 15    |
| Source Files with Tests    | 21    |
| Source Files without Tests | 8     |
| Coverage                   | 72.4% |

---

## Source Files Without Test Coverage

Barrels (`**/index.ts`), package entries (`src/core.ts`, `src/react.ts`), and Vitest setup (`src/test-setup.ts`) are not expected to have dedicated test files. Coverage for those symbols lives in the colocated tests that import through the barrels.

### app/

- `src/app/index.ts` → Expected test: `tests/unit/app/index.test.ts`

### root/

- `src/core.ts` → Expected test: `tests/unit/root/core.test.ts`
- `src/index.ts` → Expected test: `tests/unit/root/index.test.ts`
- `src/react.ts` → Expected test: `tests/unit/root/react.test.ts`
- `src/test-setup.ts` → Expected test: `tests/unit/root/test-setup.test.ts`

### memory/

- `src/memory/index.ts` → Expected test: `tests/unit/memory/index.test.ts`

### observer/

- `src/observer/index.ts` → Expected test: `tests/unit/observer/index.test.ts`

### renderer/

- `src/renderer/intent-flight-context.ts` → Expected test: `tests/unit/renderer/intent-flight-context.test.ts`

---

## Source Files With Test Coverage

| Source File                          | Test Files                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/nc-app.tsx`                     | `nc-app.test.tsx`                                                                                                                                     |
| `catalog/field-id.ts`                | `nc-app.test.tsx`, `field-id.test.ts`, `path-c.test.tsx`, `nc-observer.test.ts`, `handle-intent.test.ts`, `nc-renderer.test.tsx`, `context.test.ts`   |
| `catalog/index.ts`                   | `nc-app.test.tsx`, `path-c.test.tsx`, `nc-observer.test.ts`, `handle-intent.test.ts`, `nc-renderer.test.tsx`, `context.test.ts`                       |
| `catalog/limits.ts`                  | `nc-app.test.tsx`, `path-c.test.tsx`, `nc-observer.test.ts`, `handle-intent.test.ts`, `nc-renderer.test.tsx`, `context.test.ts`                       |
| `catalog/nc-catalog.ts`              | `nc-app.test.tsx`, `nc-catalog.test.ts`, `path-c.test.tsx`, `nc-observer.test.ts`, `handle-intent.test.ts`, `nc-renderer.test.tsx`, `context.test.ts` |
| `memory/projection.ts`               | `projection.test.ts`                                                                                                                                  |
| `observer/nc-headless-components.ts` | `nc-headless-components.test.ts`, `nc-observer.test.ts`                                                                                               |
| `observer/nc-observer.ts`            | `nc-observer.test.ts`                                                                                                                                 |
| `orchestrator/handle-intent.ts`      | `nc-app.test.tsx`, `handle-intent.test.ts`                                                                                                            |
| `orchestrator/index.ts`              | `nc-app.test.tsx`                                                                                                                                     |
| `renderer/error-boundary.tsx`        | `path-c.test.tsx`                                                                                                                                     |
| `renderer/field-id-stability.ts`     | `path-c.test.tsx`, `field-id-stability.test.ts`                                                                                                       |
| `renderer/index.ts`                  | `path-c.test.tsx`                                                                                                                                     |
| `renderer/input-components.tsx`      | `path-c.test.tsx`, `input-components.test.tsx`                                                                                                        |
| `renderer/nc-renderer.tsx`           | `path-c.test.tsx`, `nc-renderer.test.tsx`                                                                                                             |
| `renderer/use-committed-tree.ts`     | `path-c.test.tsx`, `use-committed-tree.test.tsx`                                                                                                      |
| `runtime/context.ts`                 | `nc-app.test.tsx`, `path-c.test.tsx`, `nc-renderer.test.tsx`, `context.test.ts`                                                                       |
| `runtime/freeze.ts`                  | `nc-app.test.tsx`, `path-c.test.tsx`, `nc-renderer.test.tsx`                                                                                          |
| `runtime/index.ts`                   | `nc-app.test.tsx`, `path-c.test.tsx`, `nc-renderer.test.tsx`                                                                                          |
| `types/index.ts`                     | `field-id.test.ts`                                                                                                                                    |
| `types/nc-types.ts`                  | `field-id.test.ts`, `nc-types.test.ts`                                                                                                                |

---

## Test File Details

| Test File                                 | Imports from Source |
| ----------------------------------------- | ------------------- |
| `app/nc-app.test.tsx`                     | 10 files            |
| `catalog/field-id.test.ts`                | 3 files             |
| `catalog/nc-catalog.test.ts`              | 1 files             |
| `integration/path-c.test.tsx`             | 13 files            |
| `memory/projection.test.ts`               | 1 files             |
| `observer/nc-headless-components.test.ts` | 1 files             |
| `observer/nc-observer.test.ts`            | 6 files             |
| `orchestrator/buffer-isolation.test.ts`   | 0 files             |
| `orchestrator/handle-intent.test.ts`      | 5 files             |
| `renderer/field-id-stability.test.ts`     | 1 files             |
| `renderer/input-components.test.tsx`      | 1 files             |
| `renderer/nc-renderer.test.tsx`           | 8 files             |
| `renderer/use-committed-tree.test.tsx`    | 1 files             |
| `runtime/context.test.ts`                 | 5 files             |
| `types/nc-types.test.ts`                  | 1 files             |
