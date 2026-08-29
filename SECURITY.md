# Security

## Trust boundary

Neural Computer renders **untrusted UI trees** (LLM output) and sends **user staging snapshots** back to an orchestrator (`createLlmIntentHandler` or a host handler).

Treat every `UITree` as untrusted structured data. The starter catalog does not include `href`, `src`, or raw HTML. Do not add those via `extraRegistry` without sanitizing. React text escaping covers `NCText` content; it does not cover a custom component that assigns `innerHTML`.

## `serialize("html")`

`runtime.observer.serialize("html")` is diagnostic only. It may contain user input (`currentValue`) and LLM-emitted strings. **Do not** assign it to `innerHTML` or `dangerouslySetInnerHTML`.

## DynamicValue paths

`{ path: "email" }` (no `/`) resolves from the staging buffer. Multi-segment paths walk the durable store. Do not put secrets in durable-store paths that an LLM-authored action can name; those values are copied into `IntentEvent.action_params`.

## Action allowlist

`ncStarterCatalog` only permits `submit_form` and `cancel` as `Button.action.name`. Custom catalogs must constrain `action.name` the same way. The runtime does not execute shell commands. The LLM handler does not re-allowlist `action_name`; the catalog schema is the gate. The Python REPL is a separate subprocess (`createPythonRepl`); catalog actions do not spawn it. The handler may call `repl.exec` only when the host passed `repl`.

## Staging payload size

Text inputs are capped at 8192 characters (`NC_STRING_MAX_LENGTH`). Field ids cannot be empty, path-like, or `__proto__` / `constructor` / `prototype`.

## Python REPL

`createPythonRepl` spawns a CPython subprocess. Restricted `__builtins__` (no `eval`, `exec`, `open`, `__import__`) reduce accidents. They are **not** a jail. User code can still reach surprising objects through the remaining graph. The hard boundary is the host timeout: the worker is SIGKILL'd and replaced with an empty process. Production deployments that need isolation wrap `pythonPath` (container, seccomp, nsjail). Do not `set()` secrets into the REPL. `llm_query` sends the prompt to the host callback; treat that path like any other orchestrator-to-model channel.

## Prototype pollution

`defaultNCProjection` uses null-prototype maps so entity names cannot pollute `Object.prototype`. Duplicate entity names log a warning; last write wins.

## Typecheck

`tsconfig.json` sets `"skipLibCheck": false`. That is a deliberate choice so sibling `.d.ts` drift surfaces (audit NC-042 / NC-066). Zod is pinned to `4.4.3`.

## Reporting

This package is private `0.x`. Report issues through the GitHub repository.
