# Neural Computer - File Inventory

**Version**: 0.1.0

This document gives every area of the tree, the disposition of the files in
it, and the counts. It answers "what is in this repository, and what is each
file for". `COMPONENTS.md` describes what each module does.

---

## Per-area counts

| Area      | Files  | Lines of code | What it holds                                                     |
| --------- | ------ | ------------- | ----------------------------------------------------------------- |
| `src`     | 46     | —             | The runtime, plus the five `.tsx` test files (see the scope note) |
| `tests`   | 17     | —             | The `.test.ts` files                                              |
| `tools`   | 1      | —             | `tools/create-dependency-graph/create-dependency-graph.ts`        |
| `config`  | 2      | —             | Build and test configuration                                      |
| **Total** | **66** | **9694**      | —                                                                 |

Source: `file-inventory.json` (`byArea`) and `dependency-graph.json`
(`totalLinesOfCode`). The line count is repo-wide; `repo_map` does not split
it per area, so this table gives no per-area line figure rather than an
estimate.

### The scope note that makes these numbers agree

`file-inventory.json` files a `.tsx` test under the `src` area, not under
`tests`. Area `tests` therefore counts only `.test.ts` and reads 17, while
the tree holds 22 test files. The five `.tsx` test files are the difference:

- `src/app/nc-app.test.tsx`
- `src/integration/path-c.test.tsx`
- `src/renderer/input-components.test.tsx`
- `src/renderer/nc-renderer.test.tsx`
- `src/renderer/use-committed-tree.test.tsx`

Read either way, the tree sums to 66 files: 41 non-test source + 22 test +
1 tool + 2 config. Give the scope whenever you quote one of these counts. A
count of 17 and a count of 22 are both correct and describe different sets.

---

## Disposition

| Disposition   | Files | Meaning                                                       |
| ------------- | ----- | ------------------------------------------------------------- |
| `reachable`   | 37    | An entry root reaches the file through imports                |
| `build-entry` | 3     | An entry point: `src/index.ts`, `src/core.ts`, `src/react.ts` |
| `orphan`      | 6     | No importer found by static analysis                          |
| `test`        | 17    | A `.test.ts` file                                             |
| `tool`        | 1     | Developer tooling, not shipped                                |
| `config`      | 2     | Build and test configuration                                  |
| `test-only`   | 0     | Reached only from a test                                      |
| `bench`       | 0     | This repository has no benchmark area                         |
| `example`     | 0     | Examples live outside the mapped tree                         |

Source: `file-inventory.json` (`byDisposition`).

## A disposition count is not a list of files to delete

Six files carry the `orphan` disposition and `noImporterFileCount` is 6. That
is a static-analysis result, and it is not a deletion list.

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

Generated 2026-09-15 by `repo_map.py map`.
Regenerate: `python repo_map.py map . --out <dir>` · Check: `python repo_map.py check . --docs docs/architecture`

| Claim                | Value | Source                |
| -------------------- | ----- | --------------------- |
| totalFiles           | 66    | file-inventory.json   |
| totalSourceFiles     | 66    | dependency-graph.json |
| totalTypeScriptFiles | 66    | dependency-graph.json |
| totalLinesOfCode     | 9694  | dependency-graph.json |
| entryRoots           | 3     | dependency-graph.json |
| reachableFiles       | 40    | dependency-graph.json |
| orphanedFiles        | 6     | dependency-graph.json |
| dormantFiles         | 6     | dependency-graph.json |
| testOnlyFiles        | 0     | dependency-graph.json |
| noImporterFileCount  | 6     | unused-analysis.json  |

`reachableFiles` is 40 and the `reachable` disposition is 37. The two count
different sets: the reachability figure includes the 3 entry roots, which the
disposition table files separately as `build-entry`. 37 + 3 = 40.
