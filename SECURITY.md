# Security

## Trust boundary

Neural Computer renders **untrusted UI trees** (LLM output) and sends **user staging snapshots** back to an orchestrator that will eventually call an LLM.

Treat every `UITree` as untrusted structured data. The starter catalog does not include `href`, `src`, or raw HTML. Do not add those via `extraRegistry` without sanitizing. React text escaping covers `NCText` content; it does not cover a custom component that assigns `innerHTML`.

## `serialize("html")`

`runtime.observer.serialize("html")` is diagnostic only. It may contain user input (`currentValue`) and LLM-emitted strings. **Do not** assign it to `innerHTML` or `dangerouslySetInnerHTML`.

## DynamicValue paths

`{ path: "email" }` (no `/`) resolves from the staging buffer. Multi-segment paths walk the durable store. Do not put secrets in durable-store paths that an LLM-authored action can name; those values are copied into `IntentEvent.action_params`.

## Action allowlist

`ncStarterCatalog` only permits `submit_form` and `cancel` as `Button.action.name`. Custom catalogs must constrain `action.name` the same way. The runtime does not execute shell commands; a future LLM handler must still allowlist `action_name` against the catalog.

## Staging payload size

Text inputs are capped at 8192 characters (`NC_STRING_MAX_LENGTH`). Field ids cannot be empty, path-like, or `__proto__` / `constructor` / `prototype`.

## Prototype pollution

`defaultNCProjection` uses null-prototype maps so entity names cannot pollute `Object.prototype`. Duplicate entity names log a warning; last write wins.

## Typecheck

`tsconfig.json` still sets `"skipLibCheck": true`. That hides some sibling `.d.ts` drift (audit NC-042 / NC-066). It has not been flipped.

## Reporting

This package is private `0.x`. Report issues through the GitHub repository.
