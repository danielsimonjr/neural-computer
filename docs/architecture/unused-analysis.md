# Unused Files and Exports Analysis

Stale graph; run `npm run docs:deps` after install.

**Hand-updated**: 2026-08-29. The 2026-04-16 generator marked public barrel types as unused because it did not follow `src/index.ts` re-exports, and it claimed `src/types/nc-types.ts` was an unused file. That file is imported by the types barrel and is the source of `NCRuntime`.

## Current tree (not unused)

Every non-test file under `src/` is reachable from `src/index.ts`, `src/core.ts`, or `src/react.ts`, except that `field-id-stability.ts` helpers are also imported by `NCRenderer` directly. Public types (`NCAppProps`, `NCProjectedData`, `CreateNCRuntimeOptions`, and so on) are part of the package API even when no other module in `src/` imports them by name.

## What the generator used to report (historical)

On 2026-04-16 it listed one "unused file" (`src/types/nc-types.ts`) and eight "unused exports" that were all public interface types. Treat that list as a false-positive of the graph tool, not as a deletion candidate.
