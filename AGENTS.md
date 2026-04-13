# AGENTS.md

Instructions for AI coding agents working with this repository.

## Code Style

- Do not use emojis in code, comments, commit messages, or documentation output.
- Prefer plain prose over heavy bullet lists in documentation.
- Keep comments focused on *why*, not *what* — let well-named identifiers describe *what*.

## Workflow

- Run `npm run typecheck` after each turn to ensure type safety.
- Run `npm test` after changes that touch logic or tests.
- Local development requires the sibling `JSON-UI` repo at `../JSON-UI` (see README).

## Architecture References

All design decisions live in `docs/`. Read the relevant spec before implementing anything.

- **Active spec:** `docs/2026-04-11-ephemeral-ui-state-design.md` — the staging buffer pattern for in-progress user input, including the five state surfaces, the four staging-buffer rules, failure modes, and the `DynamicValue` resolution path. Read this before touching anything under `src/renderer/`.

## Dependency Notes

- `@json-ui/core` and `@json-ui/react` — not yet published. Sibling repo at `../JSON-UI`. Use `npm link` or `file:` deps for local dev.
- `@danielsimonjr/memoryjs` — published on npm. Sibling repo at `../memoryjs` for reference.
- `@anthropic-ai/sdk` — Anthropic's official TypeScript SDK. Use for LLM calls.
- JSON-UI ships no built-in input components; the NC runtime implements `TextField`, `Checkbox`, etc. in its own registry and wires them to the staging buffer.

## What Not to Do

- Do not modify JSON-UI from this repo. JSON-UI is a dependency. If a change is needed there, it is a separate upstream contribution.
- Do not invent new state categories beyond the five named in the active spec.
- Do not call the LLM on every keystroke. Intents are the only flush boundary.
