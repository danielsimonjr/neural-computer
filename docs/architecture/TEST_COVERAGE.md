# Test Coverage Analysis

Stale graph; run `npm run docs:deps` after install.

**Hand-updated**: 2026-08-29. The 2026-04-16 generator omitted `src/observer/` and later files. Counts below match `find src`.

## Summary

| Metric | Count |
|--------|-------|
| Total source files (non-test) | 28 |
| Total test files | 15 |
| `it` / `test` cases | 84 |
| Coverage tool | `@vitest/coverage-v8` via `bun run test:coverage` |

Barrel re-exports (`**/index.ts`, `core.ts`, `react.ts`) have no dedicated test files; they are exercised by importers. `intent-flight-context.ts` and `error-boundary.tsx` are covered through `NCRenderer` / `NCApp` tests rather than colocated files. `freeze.ts` is covered through observer and projection tests.

## Test files (`src/**/*.test.*`)

| Test file | Exercises |
|-----------|-----------|
| `src/app/nc-app.test.tsx` | NCApp mount, handler wiring, extraRegistry plumbing |
| `src/catalog/nc-catalog.test.ts` | Catalog shape, validateTree, action enum, field ids |
| `src/catalog/field-id.test.ts` | `isSafeFieldId` / `ncFieldIdSchema` |
| `src/memory/projection.test.ts` | Grouping, relations, null-prototype maps, duplicates |
| `src/observer/nc-observer.test.ts` | Invariants 12–13, freeze, serialize |
| `src/observer/nc-headless-components.test.ts` | Headless registry / currentValue |
| `src/orchestrator/buffer-isolation.test.ts` | Invariant 7 including `../observer` |
| `src/orchestrator/handle-intent.test.ts` | Stub catalog validation, throwing nextTree |
| `src/renderer/nc-renderer.test.tsx` | Last-good tree, reconcile, observer.render, Zod strip |
| `src/renderer/input-components.test.tsx` | Inputs, NCButton execute/params, in-flight disable |
| `src/renderer/field-id-stability.test.ts` | Same id, different type |
| `src/renderer/use-committed-tree.test.tsx` | Atomic commit mode |
| `src/runtime/context.test.ts` | emitIntent, backpressure, cancel, destroy, in-flight flag |
| `src/types/nc-types.test.ts` | Brand, observer field on NCRuntime |
| `src/integration.test.tsx` | Path C end-to-end |

## Source files without a colocated `*.test.*`

These are expected (barrels or helpers covered elsewhere):

- `src/index.ts`, `src/core.ts`, `src/react.ts`
- `src/app/index.ts`, `src/catalog/index.ts`, `src/memory/index.ts`, `src/observer/index.ts`, `src/orchestrator/index.ts`, `src/renderer/index.ts`, `src/runtime/index.ts`, `src/types/index.ts`
- `src/catalog/limits.ts` (imported by catalog and field-id tests)
- `src/runtime/freeze.ts` (observer + projection)
- `src/renderer/error-boundary.tsx`, `src/renderer/intent-flight-context.ts` (renderer tests)
