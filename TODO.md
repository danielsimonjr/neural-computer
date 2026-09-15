# TODO

Work tracker for this repo. Per-repo tasks live here; workspace-level initiatives live in
`~/Github/TODO.md`. File a task as `- [ ]` BEFORE starting it, tick `- [x]` when it lands, and
record what changed and why in `CHANGELOG.md`.

## In progress

- [ ] **MemoryJS 4.2.0 verification** — PR #26 (`chore/verify-memoryjs-4.2.0`), open, build check green.
      This package is private and consumes MemoryJS through `file:../memoryjs`, so there is no version
      range to bump; the work is proving the code is correct against 4.x and clearing both doc gates.

## Landed in PR #26 (awaiting merge)

- [x] **CI was building against the WRONG MemoryJS major.** `.github/workflows/ci.yml` pinned the
      sibling checkout to `af11456` (v3.4.0) while every local run resolved `file:../memoryjs` to the
      4.2.0 clone. That pin is the only place a MemoryJS version is written down in this repo, so a
      green CI proved nothing about 4.x. Now pinned to `2e10299` (v4.2.0). _Found mid-flight, by the
      first CI run on the branch — not plannable in advance._
- [x] **The format gate held generated files to a hand-written style.** `.prettierignore` excluded the
      four generated JSON/YAML artifacts but not the three generated markdown reports that
      `bun run docs:deps` owns byte for byte, so every regeneration broke CI until someone ran
      `bun run format` — and the next regeneration broke it again. The three reports are now ignored
      for the same reason their JSON siblings already were. Hand-written docs stay in the gate.
      _Found mid-flight: it is what failed the first push._
- [x] **Both doc gates driven to exit 0** (were: 9 architecture findings, 46 code-docs MUST).
      code-docs now reports 72/72 exported symbols documented.
- [x] **Personal attribution and hand-maintained doc stamps removed.** Repos are products written for
      a general reader; a maintainer footer is not in the narrow exception set (LICENSE/copyright,
      package.json author, git authorship, org name in URLs).

## Deliberately left

- [ ] **90 non-gated code-docs `SHOULD` findings.** A separate writing pass, far larger than this
      verification warranted. Not a defect; the gate is at 0 MUST.
- [ ] **No CI step runs either doc gate.** `ci.yml` runs typecheck, lint, test and build only, so
      architecture and code docs drift unwatched between manual runs. This is the root cause of the
      9 findings this PR cleared, and it will recur. The same gap exists in `librarian-mcp`.
      The fix is a CI step running both gates; it needs a decision on where that job lives.

## Five-axis pass — 2026-09-15 (MemoryJS 4.2.0 verification)

- **Speed:** not assessed. No hot path touched.
- **Stability:** improved — CI now builds against the MemoryJS version this repo actually consumes,
  so CI results mean something again. The format gate no longer fails on its own generated output.
- **Reliability:** verified rather than changed. This repo never calls `loadGraph()`; it consumes
  MemoryJS through types plus an adapter that owns the load, so 4.x's read-only borrowed view does
  not reach it. No call site needed changing.
- **Security:** unchanged and confirmed unchanged. The Python REPL surface (`compute/worker.py`,
  `compute/python-repl.ts`) gained documentation only — zero non-comment additions, zero deletions
  anywhere in `src/`.
- **Maintainability:** improved — both doc gates at 0, attribution and stale stamps gone.
- **LEFT:** the missing CI doc-gate step, above. Recorded rather than done.
