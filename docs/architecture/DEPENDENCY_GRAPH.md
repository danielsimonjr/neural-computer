# neural-computer - Dependency Graph

**Version**: 0.1.0 | **Last Updated**: 2026-08-29

This document provides a comprehensive dependency graph of all files, components, imports, functions, and variables in the codebase.

---

## Table of Contents

1. [Overview](#overview)
2. [App Dependencies](#app-dependencies)
3. [Catalog Dependencies](#catalog-dependencies)
4. [Compute Dependencies](#compute-dependencies)
5. [Root Dependencies](#root-dependencies)
6. [Entry Dependencies](#entry-dependencies)
7. [Memory Dependencies](#memory-dependencies)
8. [Observer Dependencies](#observer-dependencies)
9. [Orchestrator Dependencies](#orchestrator-dependencies)
10. [Renderer Dependencies](#renderer-dependencies)
11. [Runtime Dependencies](#runtime-dependencies)
12. [Types Dependencies](#types-dependencies)
13. [Dependency Matrix](#dependency-matrix)
14. [Circular Dependency Analysis](#circular-dependency-analysis)
15. [Visual Dependency Graph](#visual-dependency-graph)
16. [Summary Statistics](#summary-statistics)

---

## Overview

The codebase is organized into the following modules:

- **app**: 2 files
- **catalog**: 4 files
- **compute**: 5 files
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

## Compute Dependencies

### `src/compute/index.ts` - SPDX-License-Identifier: Apache-2.0

**Internal Dependencies:**

| File            | Imports                                                                                                                                                                                                   | Type      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `./limits`      | `NC_REPL_CONTEXT_NAME, NC_REPL_DEFAULT_PYTHON, NC_REPL_DEFAULT_TIMEOUT_MS, NC_REPL_MAX_CODE_BYTES, NC_REPL_MAX_IDENT_LENGTH, NC_REPL_MAX_STDOUT_BYTES, NC_REPL_MAX_VALUE_BYTES, NC_REPL_PROTOCOL_VERSION` | Re-export |
| `./types`       | `NCReplError, type NCReplErrorCode`                                                                                                                                                                       | Re-export |
| `./python-repl` | `createPythonRepl`                                                                                                                                                                                        | Re-export |
| `./worker-path` | `resolveWorkerPath`                                                                                                                                                                                       | Re-export |

**Exports:**

- Re-exports: `NC_REPL_CONTEXT_NAME`, `NC_REPL_DEFAULT_PYTHON`, `NC_REPL_DEFAULT_TIMEOUT_MS`, `NC_REPL_MAX_CODE_BYTES`, `NC_REPL_MAX_IDENT_LENGTH`, `NC_REPL_MAX_STDOUT_BYTES`, `NC_REPL_MAX_VALUE_BYTES`, `NC_REPL_PROTOCOL_VERSION`, `NCReplError`, `type NCReplErrorCode`, `createPythonRepl`, `resolveWorkerPath`

---

### `src/compute/limits.ts` - Caps for the Python REPL worker. Unbounded snippets and prints would

**Exports:**

- Constants: `NC_REPL_DEFAULT_TIMEOUT_MS`, `NC_REPL_MAX_CODE_BYTES`, `NC_REPL_MAX_STDOUT_BYTES`, `NC_REPL_MAX_VALUE_BYTES`, `NC_REPL_MAX_IDENT_LENGTH`, `NC_REPL_PROTOCOL_VERSION`, `NC_REPL_CONTEXT_NAME`, `NC_REPL_DEFAULT_PYTHON`

---

### `src/compute/python-repl.ts` - SPDX-License-Identifier: Apache-2.0

**Node.js Built-in Dependencies:**

| Module          | Import                |
| --------------- | --------------------- |
| `child_process` | `spawn, ChildProcess` |
| `crypto`        | `randomUUID`          |

**Internal Dependencies:**

| File            | Imports                                                                                                                                                                                                   | Type   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `./limits`      | `NC_REPL_CONTEXT_NAME, NC_REPL_DEFAULT_PYTHON, NC_REPL_DEFAULT_TIMEOUT_MS, NC_REPL_MAX_CODE_BYTES, NC_REPL_MAX_IDENT_LENGTH, NC_REPL_MAX_STDOUT_BYTES, NC_REPL_MAX_VALUE_BYTES, NC_REPL_PROTOCOL_VERSION` | Import |
| `./types`       | `NCReplError, CreatePythonReplOptions, NCPythonRepl, NCReplExecResult`                                                                                                                                    | Import |
| `./worker-path` | `resolveWorkerPath`                                                                                                                                                                                       | Import |

**Exports:**

- Classes: `PythonRepl`
- Functions: `createPythonRepl`

---

### `src/compute/types.ts` - Host implementation of the in-REPL `llm_query(prompt)` helper.

**Exports:**

- Classes: `NCReplError`
- Interfaces: `CreatePythonReplOptions`, `NCReplExecResult`, `NCPythonRepl`

---

### `src/compute/worker-path.ts` - Locate worker.py next to this module (source tree) or next to the

**Node.js Built-in Dependencies:**

| Module | Import          |
| ------ | --------------- |
| `fs`   | `existsSync`    |
| `path` | `dirname, join` |
| `url`  | `fileURLToPath` |

**Internal Dependencies:**

| File      | Imports       | Type   |
| --------- | ------------- | ------ |
| `./types` | `NCReplError` | Import |

**Exports:**

- Functions: `resolveWorkerPath`

---

## Root Dependencies

### `src/core.ts` - React-free entry for Node / orchestrator processes.

**Internal Dependencies:**

| File             | Imports                                                                                                                                                                                                                                                                                                                                                   | Type      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `./catalog`      | `ncStarterCatalog, NC_CATALOG_VERSION, NC_LLM_ACCEPTANCE_CONTRACT, ncFieldIdSchema, isSafeFieldId, NC_FIELD_ID_MAX_LENGTH, NC_STRING_MAX_LENGTH, NC_STAGING_MAX_FIELDS, NC_SNAPSHOT_MAX_BYTES, NC_STARTER_ACTIONS`                                                                                                                                        | Re-export |
| `./types`        | `asNCCatalogVersion, isNCCatalogVersion`                                                                                                                                                                                                                                                                                                                  | Re-export |
| `./runtime`      | `createNCRuntime, type CreateNCRuntimeOptions`                                                                                                                                                                                                                                                                                                            | Re-export |
| `./memory`       | `defaultNCProjection, type NCProjectedData, type NCProjectedEntity, type NCProjectedRelation`                                                                                                                                                                                                                                                             | Re-export |
| `./orchestrator` | `createStubIntentHandler, submittedFieldsStillPresent, type CreateStubIntentHandlerOptions`                                                                                                                                                                                                                                                               | Re-export |
| `./observer`     | `createNCObserver, ncHeadlessRegistry, type CreateNCObserverOptions`                                                                                                                                                                                                                                                                                      | Re-export |
| `./compute`      | `createPythonRepl, resolveWorkerPath, NCReplError, NC_REPL_CONTEXT_NAME, NC_REPL_DEFAULT_PYTHON, NC_REPL_DEFAULT_TIMEOUT_MS, NC_REPL_MAX_CODE_BYTES, NC_REPL_MAX_IDENT_LENGTH, NC_REPL_MAX_STDOUT_BYTES, NC_REPL_MAX_VALUE_BYTES, NC_REPL_PROTOCOL_VERSION, type CreatePythonReplOptions, type NCPythonRepl, type NCReplExecResult, type NCReplErrorCode` | Re-export |

**Exports:**

- Re-exports: `ncStarterCatalog`, `NC_CATALOG_VERSION`, `NC_LLM_ACCEPTANCE_CONTRACT`, `ncFieldIdSchema`, `isSafeFieldId`, `NC_FIELD_ID_MAX_LENGTH`, `NC_STRING_MAX_LENGTH`, `NC_STAGING_MAX_FIELDS`, `NC_SNAPSHOT_MAX_BYTES`, `NC_STARTER_ACTIONS`, `asNCCatalogVersion`, `isNCCatalogVersion`, `createNCRuntime`, `type CreateNCRuntimeOptions`, `defaultNCProjection`, `type NCProjectedData`, `type NCProjectedEntity`, `type NCProjectedRelation`, `createStubIntentHandler`, `submittedFieldsStillPresent`, `type CreateStubIntentHandlerOptions`, `createNCObserver`, `ncHeadlessRegistry`, `type CreateNCObserverOptions`, `createPythonRepl`, `resolveWorkerPath`, `NCReplError`, `NC_REPL_CONTEXT_NAME`, `NC_REPL_DEFAULT_PYTHON`, `NC_REPL_DEFAULT_TIMEOUT_MS`, `NC_REPL_MAX_CODE_BYTES`, `NC_REPL_MAX_IDENT_LENGTH`, `NC_REPL_MAX_STDOUT_BYTES`, `NC_REPL_MAX_VALUE_BYTES`, `NC_REPL_PROTOCOL_VERSION`, `type CreatePythonReplOptions`, `type NCPythonRepl`, `type NCReplExecResult`, `type NCReplErrorCode`

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

| File             | Imports                                                                                                                                                                                                                                                                                                                                                   | Type      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `./catalog`      | `ncStarterCatalog, NC_CATALOG_VERSION, NC_LLM_ACCEPTANCE_CONTRACT, ncFieldIdSchema, isSafeFieldId, NC_FIELD_ID_MAX_LENGTH, NC_STRING_MAX_LENGTH, NC_STAGING_MAX_FIELDS, NC_SNAPSHOT_MAX_BYTES, NC_STARTER_ACTIONS`                                                                                                                                        | Re-export |
| `./types`        | `asNCCatalogVersion, isNCCatalogVersion`                                                                                                                                                                                                                                                                                                                  | Re-export |
| `./runtime`      | `createNCRuntime, type CreateNCRuntimeOptions`                                                                                                                                                                                                                                                                                                            | Re-export |
| `./memory`       | `defaultNCProjection, type NCProjectedData, type NCProjectedEntity, type NCProjectedRelation`                                                                                                                                                                                                                                                             | Re-export |
| `./renderer`     | `NCRenderer, NCContainer, NCText, NCTextField, NCCheckbox, NCSelect, NCButton, useCommittedTree, NCErrorBoundary, type NCRendererProps, type NCComponentProps, type UseCommittedTreeOptions`                                                                                                                                                              | Re-export |
| `./orchestrator` | `createStubIntentHandler, submittedFieldsStillPresent, type CreateStubIntentHandlerOptions`                                                                                                                                                                                                                                                               | Re-export |
| `./app`          | `NCApp, type NCAppProps`                                                                                                                                                                                                                                                                                                                                  | Re-export |
| `./observer`     | `createNCObserver, ncHeadlessRegistry, type CreateNCObserverOptions`                                                                                                                                                                                                                                                                                      | Re-export |
| `./compute`      | `createPythonRepl, resolveWorkerPath, NCReplError, NC_REPL_CONTEXT_NAME, NC_REPL_DEFAULT_PYTHON, NC_REPL_DEFAULT_TIMEOUT_MS, NC_REPL_MAX_CODE_BYTES, NC_REPL_MAX_IDENT_LENGTH, NC_REPL_MAX_STDOUT_BYTES, NC_REPL_MAX_VALUE_BYTES, NC_REPL_PROTOCOL_VERSION, type CreatePythonReplOptions, type NCPythonRepl, type NCReplExecResult, type NCReplErrorCode` | Re-export |

**Exports:**

- Re-exports: `ncStarterCatalog`, `NC_CATALOG_VERSION`, `NC_LLM_ACCEPTANCE_CONTRACT`, `ncFieldIdSchema`, `isSafeFieldId`, `NC_FIELD_ID_MAX_LENGTH`, `NC_STRING_MAX_LENGTH`, `NC_STAGING_MAX_FIELDS`, `NC_SNAPSHOT_MAX_BYTES`, `NC_STARTER_ACTIONS`, `asNCCatalogVersion`, `isNCCatalogVersion`, `createNCRuntime`, `type CreateNCRuntimeOptions`, `defaultNCProjection`, `type NCProjectedData`, `type NCProjectedEntity`, `type NCProjectedRelation`, `NCRenderer`, `NCContainer`, `NCText`, `NCTextField`, `NCCheckbox`, `NCSelect`, `NCButton`, `useCommittedTree`, `NCErrorBoundary`, `type NCRendererProps`, `type NCComponentProps`, `type UseCommittedTreeOptions`, `createStubIntentHandler`, `submittedFieldsStillPresent`, `type CreateStubIntentHandlerOptions`, `NCApp`, `type NCAppProps`, `createNCObserver`, `ncHeadlessRegistry`, `type CreateNCObserverOptions`, `createPythonRepl`, `resolveWorkerPath`, `NCReplError`, `NC_REPL_CONTEXT_NAME`, `NC_REPL_DEFAULT_PYTHON`, `NC_REPL_DEFAULT_TIMEOUT_MS`, `NC_REPL_MAX_CODE_BYTES`, `NC_REPL_MAX_IDENT_LENGTH`, `NC_REPL_MAX_STDOUT_BYTES`, `NC_REPL_MAX_VALUE_BYTES`, `NC_REPL_PROTOCOL_VERSION`, `type CreatePythonReplOptions`, `type NCPythonRepl`, `type NCReplExecResult`, `type NCReplErrorCode`

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
| `index`                  | 4 files      | 2 files    |
| `limits`                 | 0 files      | 2 files    |
| `python-repl`            | 3 files      | 1 files    |
| `types`                  | 0 files      | 3 files    |
| `worker-path`            | 1 files      | 2 files    |
| `core`                   | 7 files      | 0 files    |
| `index`                  | 9 files      | 0 files    |
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

    subgraph Compute
        N6[index]
        N7[limits]
        N8[python-repl]
        N9[types]
        N10[worker-path]
    end

    subgraph Root
        N11[core]
        N12[react]
        N13[test-setup]
    end

    subgraph Entry
        N14[index]
    end

    subgraph Memory
        N15[index]
        N16[projection]
    end

    subgraph Observer
        N17[index]
        N18[nc-headless-components]
        N19[nc-observer]
    end

    subgraph Orchestrator
        N20[handle-intent]
        N21[index]
    end

    subgraph Renderer
        N22[error-boundary]
        N23[field-id-stability]
        N24[index]
        N25[input-components]
        N26[intent-flight-context]
        N27[...2 more]
    end

    subgraph Runtime
        N28[context]
        N29[freeze]
        N30[index]
    end

    subgraph Types
        N31[index]
        N32[nc-types]
    end

    N0 --> N1
    N1 --> N31
    N2 --> N4
    N3 --> N5
    N3 --> N2
    N3 --> N4
    N5 --> N31
    N5 --> N2
    N5 --> N4
    N6 --> N7
    N6 --> N9
    N6 --> N8
    N6 --> N10
    N8 --> N7
    N8 --> N9
    N8 --> N10
    N10 --> N9
    N11 --> N3
    N11 --> N31
    N11 --> N30
    N11 --> N15
    N11 --> N21
    N11 --> N17
    N11 --> N6
    N14 --> N3
    N14 --> N31
    N14 --> N30
    N14 --> N15
    N14 --> N24
    N14 --> N21
```

---

## Summary Statistics

| Category                | Count |
| ----------------------- | ----- |
| Total TypeScript Files  | 34    |
| Total Modules           | 11    |
| Total Lines of Code     | 2694  |
| Total Exports           | 218   |
| Total Re-exports        | 166   |
| Total Classes           | 4     |
| Total Interfaces        | 14    |
| Total Functions         | 17    |
| Total Type Guards       | 2     |
| Total Enums             | 0     |
| Type-only Imports       | 5     |
| Runtime Circular Deps   | 0     |
| Type-only Circular Deps | 0     |

---

_Last Updated_: 2026-08-29
_Version_: 0.1.0
