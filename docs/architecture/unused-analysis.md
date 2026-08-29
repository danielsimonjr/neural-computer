# Unused Files and Exports Analysis

**Generated**: 2026-08-29

## Summary

- **Potentially unused files**: 3
- **Potentially unused exports**: 15

## Potentially Unused Files

These files are not imported by any other file in the codebase. That is expected for package entry points (`src/core.ts`, `src/react.ts`) and for Vitest setup (`src/test-setup.ts`).

- `src/core.ts` — `neural-computer/core` tsup entry
- `src/react.ts` — `neural-computer/react` tsup entry
- `src/test-setup.ts` — vitest `setupFiles` (RTL `cleanup`)

## Potentially Unused Exports

These exports are not imported by any other file in the codebase:

### `src/app/nc-app.tsx`

- `NCAppProps` (interface)

### `src/catalog/limits.ts`

- `NCStarterActionName` (type)

### `src/memory/projection.ts`

- `NCProjectedRelation` (interface)
- `NCProjectedData` (interface)
- `NCProjectedEntity` (interface)

### `src/observer/nc-observer.ts`

- `CreateNCObserverOptions` (interface)

### `src/orchestrator/handle-intent.ts`

- `CreateStubIntentHandlerOptions` (interface)

### `src/renderer/input-components.tsx`

- `NCComponentProps` (interface)

### `src/renderer/nc-renderer.tsx`

- `NCRendererProps` (interface)

### `src/renderer/use-committed-tree.ts`

- `UseCommittedTreeOptions` (type)

### `src/runtime/context.ts`

- `CreateNCRuntimeOptions` (interface)

### `src/types/nc-types.ts`

- `NCObserver` (interface)
- `NCRuntime` (interface)
- `NCIntentHandler` (type)
- `NCCatalogVersion` (type)
