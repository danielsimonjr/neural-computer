# Neural Computer - File Inventory

This document gives every area of the tree, the disposition of the files in
it, and the counts. It answers "what is in this repository, and what is each
file for". `COMPONENTS.md` describes what each module does.

---

## Per-area counts

| Area      | Files  | Lines of code | What it holds                                              |
| --------- | ------ | ------------- | ---------------------------------------------------------- |
| `src`     | 41     | 3825          | The runtime, without test files                            |
| `tests`   | 22     | 4025          | The `.test.ts` and `.test.tsx` files                       |
| `tools`   | 1      | 1778          | `tools/create-dependency-graph/create-dependency-graph.ts` |
| `config`  | 2      | 66            | Build and test configuration                               |
| **Total** | **66** | **9694**      | —                                                          |

Source: `file-inventory.json` (`byArea`, and the `loc` of each file). The line total is the same figure
as `totalLinesOfCode` in `dependency-graph.json`.

The tree has 41 source files, 22 test files, 1 tool file and 2 configuration files. Together they make 66 files.

---

## Disposition

| Disposition   | Files | Meaning                                                       |
| ------------- | ----- | ------------------------------------------------------------- |
| `reachable`   | 37    | An entry root reaches the file through imports                |
| `build-entry` | 3     | An entry point: `src/index.ts`, `src/core.ts`, `src/react.ts` |
| `orphan`      | 1     | No importer found by static analysis                          |
| `test`        | 22    | A `.test.ts` or `.test.tsx` file                              |
| `tool`        | 1     | Developer tooling, not shipped                                |
| `config`      | 2     | Build and test configuration                                  |
| `test-only`   | 0     | Reached only from a test                                      |
| `bench`       | 0     | This repository has no benchmark area                         |
| `example`     | 0     | Examples live outside the mapped tree                         |

Source: `file-inventory.json` (`byDisposition`).

## A disposition count is not a list of files to delete

One file carries the `orphan` disposition and `noImporterFileCount` is 1. That
is a static-analysis result, and it is not a deletion list. The file is
`src/test-setup.ts`. `vitest.config.ts` loads it in `setupFiles`, and no import reaches it.

- A static parser cannot see a dynamic `import()`, so a file that only such an
  import reaches looks orphaned.
- A barrel file exists to be imported by a consumer, not by this tree.
- An export that nothing here uses can still be public API. Removing such an
  export from an entry point or a barrel is a **breaking change**.

`unused-analysis.md` lists the files and the exports and carries the same
caveats. Triage each entry against the source before acting on it.

---

## Related documentation

- [`OVERVIEW.md`](./OVERVIEW.md) — the project summary and the key metrics
- [`COMPONENTS.md`](./COMPONENTS.md) — what each module does
- [`DEPENDENCY_GRAPH.md`](./DEPENDENCY_GRAPH.md) — who imports whom (generated)
- [`unused-analysis.md`](./unused-analysis.md) — files and exports with no importer (generated)

---

## Verification

Generated 2026-10-16 by `repo-tools map`.
Regenerate: `repo-tools map <repo> --out=<dir>` · Check: `repo-tools check <repo> --docs=docs/architecture`

| Claim                | Value | Source                |
| -------------------- | ----- | --------------------- |
| totalFiles           | 66    | file-inventory.json   |
| totalSourceFiles     | 66    | dependency-graph.json |
| totalTypeScriptFiles | 66    | dependency-graph.json |
| totalLinesOfCode     | 9694  | dependency-graph.json |
| entryRoots           | 3     | dependency-graph.json |
| reachableFiles       | 40    | dependency-graph.json |
| orphanedFiles        | 1     | dependency-graph.json |
| dormantFiles         | 1     | dependency-graph.json |
| testOnlyFiles        | 0     | dependency-graph.json |
| noImporterFileCount  | 1     | unused-analysis.json  |

`reachableFiles` is 40 and the `reachable` disposition is 37. The two count
different sets: the reachability figure includes the 3 entry roots, which the
disposition table files separately as `build-entry`. 37 + 3 = 40.
