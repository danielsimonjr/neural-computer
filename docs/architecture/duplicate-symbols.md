# Neural Computer - Duplicate Symbols

**Version**: 0.1.0

This document answers one question: does any exported name get defined by more
than one source file? A duplicated name is not always a defect, but it is
always worth knowing about, because two definitions of one name make an import
ambiguous to a reader and make a rename unsafe to automate.

---

## Result

**No duplicate symbols.** The tree owns 104 exported symbol names across the
`src` area and each name is defined once.

| Metric | Value |
| --- | --- |
| Duplicate name groups | 0 |
| Symbol names examined | 104 |

Source: `duplicate-symbols.json` (`summary`).

## What the check covers, and what it does not

The check groups names that two or more `src` files **own-export**, by name
alone. Three limits follow from that, and each one matters when reading a
non-zero result:

- It compares names, never bodies. It cannot tell a true duplicate from an
  alias that delegates to one implementation.
- It does not classify an entry or mark it public. A non-empty result is a
  list for human triage, never a pre-sorted verdict.
- A re-export (`export { X as Y } from "./a"`) is a disclosed gap in the
  underlying parse. A barrel file can therefore be counted as a second
  definer of a name it only forwards.

The count is 0 here, so none of the three limits changes the conclusion. They
are recorded because they govern how to read this document the first time the
count is not 0.

## Why this stays at 0

The three entry points (`src/index.ts`, `src/core.ts`, `src/react.ts`) are
barrels: they re-export, and they define nothing of their own. Each module
owns its names, and `COMPONENTS.md` gives the owner of each. A new symbol that
collides with an existing name shows up here as a group of 2.

---

## Related documentation

- [`COMPONENTS.md`](./COMPONENTS.md) — the owning module for each symbol
- [`API.md`](./API.md) — the public surface of the three entry points
- [`FILE_INVENTORY.md`](./FILE_INVENTORY.md) — every file and its disposition

---

## Verification

Generated 2026-09-15 by `repo_map.py map`.
Regenerate: `python repo_map.py map . --out <dir>` · Check: `python repo_map.py check . --docs docs/architecture`

| Claim | Value | Source |
|---|---|---|
| duplicateCount | 0 | duplicate-symbols.json |
| totalSymbols | 104 | duplicate-symbols.json |
| totalExports | 361 | dependency-graph.json |
| totalFiles | 66 | file-inventory.json |

`totalSymbols` (104) and `totalExports` (361) count different things and must
not be compared as one number. `totalSymbols` is the set of distinct
own-exported names in the `src` area that this check examines. `totalExports`
counts every export in every file of the repository, tests included.
