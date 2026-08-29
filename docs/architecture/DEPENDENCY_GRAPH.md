# neural-computer - Dependency Graph

**Version**: 0.1.0 | **Last Updated**: 2026-08-29

This document provides a comprehensive dependency graph of all files, components, imports, functions, and variables in the codebase.

---

## Table of Contents

1. [Overview](#overview)
2. [App Dependencies](#app-dependencies)
3. [Catalog Dependencies](#catalog-dependencies)
4. [Root Dependencies](#root-dependencies)
5. [Entry Dependencies](#entry-dependencies)
6. [Memory Dependencies](#memory-dependencies)
7. [Observer Dependencies](#observer-dependencies)
8. [Orchestrator Dependencies](#orchestrator-dependencies)
9. [Renderer Dependencies](#renderer-dependencies)
10. [Runtime Dependencies](#runtime-dependencies)
11. [Types Dependencies](#types-dependencies)
12. [Dependency Matrix](#dependency-matrix)
13. [Circular Dependency Analysis](#circular-dependency-analysis)
14. [Visual Dependency Graph](#visual-dependency-graph)
15. [Summary Statistics](#summary-statistics)

---

## Overview

The codebase is organized into the following modules:

- **app**: 2 files
- **catalog**: 4 files
- **root**: 3 files
- **entry**: 1 file
- **memory**: 2 files
- **observer**: 3 files
- **orchestrator**: 2 files
- **renderer**: 7 files
- **runtime**: 3 files
- **types**: 2 files

---

## App Dependencies

### `src/app/index.ts` - SPDX-License-Identifier: Apache-2.0

**Internal Dependencies:**

| File       | Imports                  | Type      |
| ---------- | ------------------------ | --------- |
| `./nc-app` | `NCApp, type NCAppProps` | Re-export |

**Exports:**

- Re-exports: `NCApp`, `type NCAppProps`

---

### `src/app/nc-app.tsx` - Tree shown before any intent commits a replacement. Changing this

**External Dependencies:**

| Package          | Import              |
| ---------------- | ------------------- |
| `react`          | `React`             |
| `@json-ui/core`  | `Catalog, UITree`   |
| `@json-ui/react` | `ComponentRegistry` |

**Internal Dependencies:**

| File                      | Imports                                        | Type               |
| ------------------------- | ---------------------------------------------- | ------------------ |
| `../renderer/nc-renderer` | `NCRenderer`                                   | Import             |
| `../types`                | `NCRuntime, NCCatalogVersion, NCIntentHandler` | Import (type-only) |

**Exports:**

- Interfaces: `NCAppProps`
- Functions: `NCApp`

---

## Catalog Dependencies

### `src/catalog/field-id.ts` - Field IDs key the staging buffer. They must be non-empty, not a

**External Dependencies:**

| Package | Import |
| ------- | ------ |
| `zod`   | `z`    |

**Internal Dependencies:**

| File       | Imports                                         | Type   |
| ---------- | ----------------------------------------------- | ------ |
| `./limits` | `NC_FIELD_ID_MAX_LENGTH, NC_RESERVED_FIELD_IDS` | Import |

**Exports:**

- Functions: `isSafeFieldId`
- Constants: `ncFieldIdSchema`

---

### `src/catalog/index.ts` - SPDX-License-Identifier: Apache-2.0

**Internal Dependencies:**

| File           | Imports                                                                                                                                                                                                                                         | Type      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `./nc-catalog` | `ncStarterCatalog, NC_CATALOG_VERSION, NC_LLM_ACCEPTANCE_CONTRACT`                                                                                                                                                                              | Re-export |
| `./field-id`   | `ncFieldIdSchema, isSafeFieldId`                                                                                                                                                                                                                | Re-export |
| `./limits`     | `NC_FIELD_ID_MAX_LENGTH, NC_STRING_MAX_LENGTH, NC_ACTION_PARAM_MAX_KEYS, NC_STAGING_MAX_FIELDS, NC_SNAPSHOT_MAX_BYTES, NC_SELECT_MAX_OPTIONS, NC_OBSERVER_STALE_THRESHOLD, NC_STARTER_ACTIONS, NC_RESERVED_FIELD_IDS, type NCStarterActionName` | Re-export |

**Exports:**

- Re-exports: `ncStarterCatalog`, `NC_CATALOG_VERSION`, `NC_LLM_ACCEPTANCE_CONTRACT`, `ncFieldIdSchema`, `isSafeFieldId`, `NC_FIELD_ID_MAX_LENGTH`, `NC_STRING_MAX_LENGTH`, `NC_ACTION_PARAM_MAX_KEYS`, `NC_STAGING_MAX_FIELDS`, `NC_SNAPSHOT_MAX_BYTES`, `NC_SELECT_MAX_OPTIONS`, `NC_OBSERVER_STALE_THRESHOLD`, `NC_STARTER_ACTIONS`, `NC_RESERVED_FIELD_IDS`, `type NCStarterActionName`

---

### `src/catalog/limits.ts` - Caps for catalog strings and staging-bound input. Unbounded LLM-emitted

**Exports:**

- Constants: `NC_FIELD_ID_MAX_LENGTH`, `NC_STRING_MAX_LENGTH`, `NC_ACTION_PARAM_MAX_KEYS`, `NC_STAGING_MAX_FIELDS`, `NC_SNAPSHOT_MAX_BYTES`, `NC_SELECT_MAX_OPTIONS`, `NC_OBSERVER_STALE_THRESHOLD`, `NC_STARTER_ACTIONS`, `NC_RESERVED_FIELD_IDS`

---

### `src/catalog/nc-catalog.ts` - Version string threaded through every emitted IntentEvent.catalog_version

**External Dependencies:**

| Package         | Import          |
| --------------- | --------------- |
| `@json-ui/core` | `createCatalog` |
| `zod`           | `z`             |

**Internal Dependencies:**

| File         | Imports                                                                                     | Type   |
| ------------ | ------------------------------------------------------------------------------------------- | ------ |
| `../types`   | `asNCCatalogVersion`                                                                        | Import |
| `./field-id` | `ncFieldIdSchema`                                                                           | Import |
| `./limits`   | `NC_ACTION_PARAM_MAX_KEYS, NC_SELECT_MAX_OPTIONS, NC_STRING_MAX_LENGTH, NC_STARTER_ACTIONS` | Import |

**Exports:**

- Constants: `NC_CATALOG_VERSION`, `NC_LLM_ACCEPTANCE_CONTRACT`, `ncStarterCatalog`

---

## Root Dependencies

### `src/core.ts` - React-free entry for Node / orchestrator processes.

**Internal Dependencies:**

| File             | Imports                                                                                                                                                                                                            | Type      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `./catalog`      | `ncStarterCatalog, NC_CATALOG_VERSION, NC_LLM_ACCEPTANCE_CONTRACT, ncFieldIdSchema, isSafeFieldId, NC_FIELD_ID_MAX_LENGTH, NC_STRING_MAX_LENGTH, NC_STAGING_MAX_FIELDS, NC_SNAPSHOT_MAX_BYTES, NC_STARTER_ACTIONS` | Re-export |
| `./types`        | `asNCCatalogVersion, isNCCatalogVersion`                                                                                                                                                                           | Re-export |
| `./runtime`      | `createNCRuntime, type CreateNCRuntimeOptions`                                                                                                                                                                     | Re-export |
| `./memory`       | `defaultNCProjection, type NCProjectedData, type NCProjectedEntity, type NCProjectedRelation`                                                                                                                      | Re-export |
| `./orchestrator` | `createStubIntentHandler, submittedFieldsStillPresent, type CreateStubIntentHandlerOptions`                                                                                                                        | Re-export |
| `./observer`     | `createNCObserver, ncHeadlessRegistry, type CreateNCObserverOptions`                                                                                                                                               | Re-export |

**Exports:**

- Re-exports: `ncStarterCatalog`, `NC_CATALOG_VERSION`, `NC_LLM_ACCEPTANCE_CONTRACT`, `ncFieldIdSchema`, `isSafeFieldId`, `NC_FIELD_ID_MAX_LENGTH`, `NC_STRING_MAX_LENGTH`, `NC_STAGING_MAX_FIELDS`, `NC_SNAPSHOT_MAX_BYTES`, `NC_STARTER_ACTIONS`, `asNCCatalogVersion`, `isNCCatalogVersion`, `createNCRuntime`, `type CreateNCRuntimeOptions`, `defaultNCProjection`, `type NCProjectedData`, `type NCProjectedEntity`, `type NCProjectedRelation`, `createStubIntentHandler`, `submittedFieldsStillPresent`, `type CreateStubIntentHandlerOptions`, `createNCObserver`, `ncHeadlessRegistry`, `type CreateNCObserverOptions`

---

### `src/react.ts` - SPDX-License-Identifier: Apache-2.0

**Internal Dependencies:**

| File         | Imports                                                                                                                                                                                      | Type      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `./renderer` | `NCRenderer, NCContainer, NCText, NCTextField, NCCheckbox, NCSelect, NCButton, useCommittedTree, NCErrorBoundary, type NCRendererProps, type NCComponentProps, type UseCommittedTreeOptions` | Re-export |
| `./app`      | `NCApp, type NCAppProps`                                                                                                                                                                     | Re-export |

**Exports:**

- Re-exports: `NCRenderer`, `NCContainer`, `NCText`, `NCTextField`, `NCCheckbox`, `NCSelect`, `NCButton`, `useCommittedTree`, `NCErrorBoundary`, `type NCRendererProps`, `type NCComponentProps`, `type UseCommittedTreeOptions`, `NCApp`, `type NCAppProps`

---

### `src/test-setup.ts` - SPDX-License-Identifier: Apache-2.0

**External Dependencies:**

| Package                  | Import      |
| ------------------------ | ----------- |
| `vitest`                 | `afterEach` |
| `@testing-library/react` | `cleanup`   |

---

## Entry Dependencies

### `src/index.ts` - Neural Computer — public entry point.

**Internal Dependencies:**

| File             | Imports                                                                                                                                                                                                            | Type      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `./catalog`      | `ncStarterCatalog, NC_CATALOG_VERSION, NC_LLM_ACCEPTANCE_CONTRACT, ncFieldIdSchema, isSafeFieldId, NC_FIELD_ID_MAX_LENGTH, NC_STRING_MAX_LENGTH, NC_STAGING_MAX_FIELDS, NC_SNAPSHOT_MAX_BYTES, NC_STARTER_ACTIONS` | Re-export |
| `./types`        | `asNCCatalogVersion, isNCCatalogVersion`                                                                                                                                                                           | Re-export |
| `./runtime`      | `createNCRuntime, type CreateNCRuntimeOptions`                                                                                                                                                                     | Re-export |
| `./memory`       | `defaultNCProjection, type NCProjectedData, type NCProjectedEntity, type NCProjectedRelation`                                                                                                                      | Re-export |
| `./renderer`     | `NCRenderer, NCContainer, NCText, NCTextField, NCCheckbox, NCSelect, NCButton, useCommittedTree, NCErrorBoundary, type NCRendererProps, type NCComponentProps, type UseCommittedTreeOptions`                       | Re-export |
| `./orchestrator` | `createStubIntentHandler, submittedFieldsStillPresent, type CreateStubIntentHandlerOptions`                                                                                                                        | Re-export |
| `./app`          | `NCApp, type NCAppProps`                                                                                                                                                                                           | Re-export |
| `./observer`     | `createNCObserver, ncHeadlessRegistry, type CreateNCObserverOptions`                                                                                                                                               | Re-export |

**Exports:**

- Re-exports: `ncStarterCatalog`, `NC_CATALOG_VERSION`, `NC_LLM_ACCEPTANCE_CONTRACT`, `ncFieldIdSchema`, `isSafeFieldId`, `NC_FIELD_ID_MAX_LENGTH`, `NC_STRING_MAX_LENGTH`, `NC_STAGING_MAX_FIELDS`, `NC_SNAPSHOT_MAX_BYTES`, `NC_STARTER_ACTIONS`, `asNCCatalogVersion`, `isNCCatalogVersion`, `createNCRuntime`, `type CreateNCRuntimeOptions`, `defaultNCProjection`, `type NCProjectedData`, `type NCProjectedEntity`, `type NCProjectedRelation`, `NCRenderer`, `NCContainer`, `NCText`, `NCTextField`, `NCCheckbox`, `NCSelect`, `NCButton`, `useCommittedTree`, `NCErrorBoundary`, `type NCRendererProps`, `type NCComponentProps`, `type UseCommittedTreeOptions`, `createStubIntentHandler`, `submittedFieldsStillPresent`, `type CreateStubIntentHandlerOptions`, `NCApp`, `type NCAppProps`, `createNCObserver`, `ncHeadlessRegistry`, `type CreateNCObserverOptions`

---

## Memory Dependencies

### `src/memory/index.ts` - SPDX-License-Identifier: Apache-2.0

**Internal Dependencies:**

| File           | Imports                                                                                       | Type      |
| -------------- | --------------------------------------------------------------------------------------------- | --------- |
| `./projection` | `defaultNCProjection, type NCProjectedData, type NCProjectedEntity, type NCProjectedRelation` | Re-export |

**Exports:**

- Re-exports: `defaultNCProjection`, `type NCProjectedData`, `type NCProjectedEntity`, `type NCProjectedRelation`

---

### `src/memory/projection.ts` - The flat view NC exposes to @json-ui/react's DataProvider via the

**External Dependencies:**

| Package                   | Import                                         |
| ------------------------- | ---------------------------------------------- |
| `@danielsimonjr/memoryjs` | `Entity, Relation, GraphProjection, JSONValue` |

**Internal Dependencies:**

| File                | Imports | Type   |
| ------------------- | ------- | ------ |
| `../runtime/freeze` | `dict`  | Import |

**Exports:**

- Interfaces: `NCProjectedRelation`, `NCProjectedData`, `NCProjectedEntity`
- Constants: `defaultNCProjection`

---

## Observer Dependencies

### `src/observer/index.ts` - SPDX-License-Identifier: Apache-2.0

**Internal Dependencies:**

| File                       | Imports                                          | Type      |
| -------------------------- | ------------------------------------------------ | --------- |
| `./nc-observer`            | `createNCObserver, type CreateNCObserverOptions` | Re-export |
| `./nc-headless-components` | `ncHeadlessRegistry`                             | Re-export |

**Exports:**

- Re-exports: `createNCObserver`, `type CreateNCObserverOptions`, `ncHeadlessRegistry`

---

### `src/observer/nc-headless-components.ts` - Six headless components mirroring NC's React input-components surface.

**External Dependencies:**

| Package             | Import                                |
| ------------------- | ------------------------------------- |
| `@json-ui/headless` | `HeadlessComponent, HeadlessRegistry` |
| `@json-ui/core`     | `JSONValue, UIElement`                |

**Exports:**

- Constants: `ncHeadlessRegistry`

---

### `src/observer/nc-observer.ts` - Additional headless components merged under ncHeadlessRegistry.

**External Dependencies:**

| Package             | Import                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `@json-ui/headless` | `createHeadlessRenderer, JsonStringSerializer, createHtmlSerializer, HeadlessRegistry, NormalizedNode` |
| `@json-ui/core`     | `Catalog, ObservableDataModel, StagingBuffer, UITree`                                                  |

**Internal Dependencies:**

| File                       | Imports                       | Type               |
| -------------------------- | ----------------------------- | ------------------ |
| `./nc-headless-components` | `ncHeadlessRegistry`          | Import             |
| `../catalog/limits`        | `NC_OBSERVER_STALE_THRESHOLD` | Import             |
| `../runtime/freeze`        | `freezeDeep`                  | Import             |
| `../types`                 | `NCObserver`                  | Import (type-only) |

**Exports:**

- Interfaces: `CreateNCObserverOptions`
- Functions: `createNCObserver`

---

## Orchestrator Dependencies

### `src/orchestrator/handle-intent.ts` - Options for the stub intent handler. The stub is deterministic —

**External Dependencies:**

| Package         | Import                                          |
| --------------- | ----------------------------------------------- |
| `@json-ui/core` | `collectFieldIds, Catalog, IntentEvent, UITree` |

**Internal Dependencies:**

| File       | Imports           | Type               |
| ---------- | ----------------- | ------------------ |
| `../types` | `NCIntentHandler` | Import (type-only) |

**Exports:**

- Interfaces: `CreateStubIntentHandlerOptions`
- Functions: `createStubIntentHandler`, `submittedFieldsStillPresent`

---

### `src/orchestrator/index.ts` - SPDX-License-Identifier: Apache-2.0

**Internal Dependencies:**

| File              | Imports                                                                                     | Type      |
| ----------------- | ------------------------------------------------------------------------------------------- | --------- |
| `./handle-intent` | `createStubIntentHandler, submittedFieldsStillPresent, type CreateStubIntentHandlerOptions` | Re-export |

**Exports:**

- Re-exports: `createStubIntentHandler`, `submittedFieldsStillPresent`, `type CreateStubIntentHandlerOptions`

---

## Renderer Dependencies

### `src/renderer/error-boundary.tsx` - Catches render throws from NC components so a single bad cast cannot

**External Dependencies:**

| Package | Import  |
| ------- | ------- |
| `react` | `React` |

**Exports:**

- Classes: `NCErrorBoundary`

---

### `src/renderer/field-id-stability.ts` - SPDX-License-Identifier: Apache-2.0

**External Dependencies:**

| Package         | Import   |
| --------------- | -------- |
| `@json-ui/core` | `UITree` |

**Exports:**

- Classes: `FieldIdTypeChangeError`
- Functions: `collectFieldIdTypes`, `detectFieldIdTypeChanges`, `commitFieldIdTypes`

---

### `src/renderer/index.ts` - SPDX-License-Identifier: Apache-2.0

**Internal Dependencies:**

| File                   | Imports                                                                                   | Type      |
| ---------------------- | ----------------------------------------------------------------------------------------- | --------- |
| `./input-components`   | `NCContainer, NCText, NCTextField, NCCheckbox, NCSelect, NCButton, type NCComponentProps` | Re-export |
| `./nc-renderer`        | `NCRenderer, type NCRendererProps`                                                        | Re-export |
| `./use-committed-tree` | `useCommittedTree, type UseCommittedTreeOptions`                                          | Re-export |
| `./error-boundary`     | `NCErrorBoundary`                                                                         | Re-export |
| `./field-id-stability` | `collectFieldIdTypes, detectFieldIdTypeChanges, FieldIdTypeChangeError`                   | Re-export |

**Exports:**

- Re-exports: `NCContainer`, `NCText`, `NCTextField`, `NCCheckbox`, `NCSelect`, `NCButton`, `type NCComponentProps`, `NCRenderer`, `type NCRendererProps`, `useCommittedTree`, `type UseCommittedTreeOptions`, `NCErrorBoundary`, `collectFieldIdTypes`, `detectFieldIdTypeChanges`, `FieldIdTypeChangeError`

---

### `src/renderer/input-components.tsx` - Props shape used by all NC-authored React components. Matches the

**External Dependencies:**

| Package          | Import                        |
| ---------------- | ----------------------------- |
| `react`          | `React`                       |
| `@json-ui/react` | `useStagingField, useActions` |
| `@json-ui/core`  | `UIElement`                   |

**Internal Dependencies:**

| File                      | Imports                                  | Type   |
| ------------------------- | ---------------------------------------- | ------ |
| `../catalog/limits`       | `NC_STRING_MAX_LENGTH`                   | Import |
| `./intent-flight-context` | `FocusFieldContext, IntentFlightContext` | Import |

**Exports:**

- Interfaces: `NCComponentProps`
- Constants: `NCContainer`, `NCText`, `NCTextField`, `NCCheckbox`, `NCSelect`, `NCButton`

---

### `src/renderer/intent-flight-context.ts` - True while createNCRuntime is awaiting a handler. NCButton reads this

**External Dependencies:**

| Package | Import  |
| ------- | ------- |
| `react` | `React` |

**Exports:**

- Constants: `IntentFlightContext`, `FocusFieldContext`

---

### `src/renderer/nc-renderer.tsx` - The committed tree to render. Must come from a successful stream

**External Dependencies:**

| Package          | Import                                                           |
| ---------------- | ---------------------------------------------------------------- |
| `react`          | `React`                                                          |
| `@json-ui/react` | `JSONUIProvider, Renderer, ComponentRegistry, ComponentRenderer` |
| `@json-ui/core`  | `collectFieldIds, Catalog, IntentEvent, UITree`                  |

**Internal Dependencies:**

| File                      | Imports                                                             | Type               |
| ------------------------- | ------------------------------------------------------------------- | ------------------ |
| `./input-components`      | `NCContainer, NCText, NCTextField, NCCheckbox, NCSelect, NCButton`  | Import             |
| `../types`                | `NCRuntime, NCCatalogVersion`                                       | Import (type-only) |
| `./error-boundary`        | `NCErrorBoundary`                                                   | Import             |
| `./intent-flight-context` | `FocusFieldContext, IntentFlightContext`                            | Import             |
| `./field-id-stability`    | `collectFieldIdTypes, commitFieldIdTypes, detectFieldIdTypeChanges` | Import             |

**Exports:**

- Interfaces: `NCRendererProps`
- Functions: `NCRenderer`

---

### `src/renderer/use-committed-tree.ts` - Thin wrapper around @json-ui/react's useUIStream that pre-selects

**External Dependencies:**

| Package          | Import                            |
| ---------------- | --------------------------------- |
| `@json-ui/react` | `useUIStream, UseUIStreamOptions` |

**Exports:**

- Functions: `useCommittedTree`

---

## Runtime Dependencies

### `src/runtime/context.ts` - Options for createNCRuntime. The caller supplies an

**External Dependencies:**

| Package             | Import                                                           |
| ------------------- | ---------------------------------------------------------------- |
| `@json-ui/core`     | `createStagingBuffer, IntentEvent, ObservableDataModel, Catalog` |
| `@json-ui/headless` | `HeadlessRegistry`                                               |

**Internal Dependencies:**

| File                | Imports                                                                     | Type               |
| ------------------- | --------------------------------------------------------------------------- | ------------------ |
| `../observer`       | `createNCObserver`                                                          | Import             |
| `../catalog/limits` | `NC_OBSERVER_STALE_THRESHOLD, NC_SNAPSHOT_MAX_BYTES, NC_STAGING_MAX_FIELDS` | Import             |
| `../types`          | `asNCCatalogVersion`                                                        | Import             |
| `../types`          | `NCCatalogVersion, NCIntentHandler, NCRuntime`                              | Import (type-only) |
| `../catalog`        | `NC_CATALOG_VERSION`                                                        | Import             |

**Exports:**

- Interfaces: `CreateNCRuntimeOptions`
- Functions: `createNCRuntime`

---

### `src/runtime/freeze.ts` - SPDX-License-Identifier: Apache-2.0

**Exports:**

- Functions: `freezeDeep`, `dict`

---

### `src/runtime/index.ts` - SPDX-License-Identifier: Apache-2.0

**Internal Dependencies:**

| File        | Imports                                        | Type      |
| ----------- | ---------------------------------------------- | --------- |
| `./context` | `createNCRuntime, type CreateNCRuntimeOptions` | Re-export |
| `./freeze`  | `freezeDeep, dict`                             | Re-export |

**Exports:**

- Re-exports: `createNCRuntime`, `type CreateNCRuntimeOptions`, `freezeDeep`, `dict`

---

## Types Dependencies

### `src/types/index.ts` - SPDX-License-Identifier: Apache-2.0

**Internal Dependencies:**

| File         | Imports                                  | Type      |
| ------------ | ---------------------------------------- | --------- |
| `./nc-types` | `asNCCatalogVersion, isNCCatalogVersion` | Re-export |

**Exports:**

- Re-exports: `asNCCatalogVersion`, `isNCCatalogVersion`

---

### `src/types/nc-types.ts` - An NC intent handler receives a fully-formed IntentEvent from the

**External Dependencies:**

| Package             | Import                                                             |
| ------------------- | ------------------------------------------------------------------ |
| `@json-ui/core`     | `IntentEvent, StagingBuffer, ObservableDataModel, UITree, Catalog` |
| `@json-ui/headless` | `NormalizedNode`                                                   |

**Exports:**

- Interfaces: `NCObserver`, `NCRuntime`
- Functions: `isNCCatalogVersion`, `asNCCatalogVersion`

---

## Dependency Matrix

### File Import/Export Matrix

| File                     | Imports From | Exports To |
| ------------------------ | ------------ | ---------- |
| `index`                  | 1 files      | 2 files    |
| `nc-app`                 | 2 files      | 1 files    |
| `field-id`               | 1 files      | 2 files    |
| `index`                  | 3 files      | 3 files    |
| `limits`                 | 0 files      | 6 files    |
| `nc-catalog`             | 3 files      | 1 files    |
| `core`                   | 6 files      | 0 files    |
| `index`                  | 8 files      | 0 files    |
| `index`                  | 1 files      | 2 files    |
| `projection`             | 1 files      | 1 files    |
| `index`                  | 2 files      | 3 files    |
| `nc-headless-components` | 0 files      | 2 files    |
| `nc-observer`            | 4 files      | 1 files    |
| `handle-intent`          | 1 files      | 1 files    |
| `index`                  | 1 files      | 2 files    |
| `react`                  | 2 files      | 0 files    |
| `error-boundary`         | 0 files      | 2 files    |
| `field-id-stability`     | 0 files      | 2 files    |
| `index`                  | 5 files      | 2 files    |
| `input-components`       | 2 files      | 2 files    |
| `intent-flight-context`  | 0 files      | 2 files    |
| `nc-renderer`            | 5 files      | 2 files    |
| `use-committed-tree`     | 0 files      | 1 files    |
| `context`                | 4 files      | 1 files    |
| `freeze`                 | 0 files      | 3 files    |
| `index`                  | 2 files      | 2 files    |
| `test-setup`             | 0 files      | 0 files    |
| `index`                  | 1 files      | 8 files    |
| `nc-types`               | 0 files      | 1 files    |

---

## Circular Dependency Analysis

**No circular dependencies detected.**
---

## Visual Dependency Graph

```mermaid
graph TD
    subgraph App
        N0[index]
        N1[nc-app]
    end

    subgraph Catalog
        N2[field-id]
        N3[index]
        N4[limits]
        N5[nc-catalog]
    end

    subgraph Root
        N6[core]
        N7[react]
        N8[test-setup]
    end

    subgraph Entry
        N9[index]
    end

    subgraph Memory
        N10[index]
        N11[projection]
    end

    subgraph Observer
        N12[index]
        N13[nc-headless-components]
        N14[nc-observer]
    end

    subgraph Orchestrator
        N15[handle-intent]
        N16[index]
    end

    subgraph Renderer
        N17[error-boundary]
        N18[field-id-stability]
        N19[index]
        N20[input-components]
        N21[intent-flight-context]
        N22[...2 more]
    end

    subgraph Runtime
        N23[context]
        N24[freeze]
        N25[index]
    end

    subgraph Types
        N26[index]
        N27[nc-types]
    end

    N0 --> N1
    N1 --> N26
    N2 --> N4
    N3 --> N5
    N3 --> N2
    N3 --> N4
    N5 --> N26
    N5 --> N2
    N5 --> N4
    N6 --> N3
    N6 --> N26
    N6 --> N25
    N6 --> N10
    N6 --> N16
    N6 --> N12
    N9 --> N3
    N9 --> N26
    N9 --> N25
    N9 --> N10
    N9 --> N19
    N9 --> N16
    N9 --> N0
    N9 --> N12
    N10 --> N11
    N11 --> N24
    N12 --> N14
    N12 --> N13
    N14 --> N13
    N14 --> N4
    N14 --> N24
```

---

## Summary Statistics

| Category                | Count |
| ----------------------- | ----- |
| Total TypeScript Files  | 29    |
| Total Modules           | 10    |
| Total Lines of Code     | 2014  |
| Total Exports           | 164   |
| Total Re-exports        | 124   |
| Total Classes           | 2     |
| Total Interfaces        | 11    |
| Total Functions         | 15    |
| Total Type Guards       | 2     |
| Total Enums             | 0     |
| Type-only Imports       | 5     |
| Runtime Circular Deps   | 0     |
| Type-only Circular Deps | 0     |

---

_Last Updated_: 2026-08-29
_Version_: 0.1.0
