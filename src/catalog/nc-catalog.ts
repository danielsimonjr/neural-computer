// SPDX-License-Identifier: Apache-2.0

import { createCatalog } from "@json-ui/core";
import { z } from "zod";
import { asNCCatalogVersion } from "../types";
import { ncFieldIdSchema } from "./field-id";
import {
  NC_ACTION_PARAM_MAX_KEYS,
  NC_RESERVED_FIELD_IDS,
  NC_SELECT_MAX_OPTIONS,
  NC_STRING_MAX_LENGTH,
  NC_STARTER_ACTIONS,
} from "./limits";

/**
 * Version string threaded through every emitted IntentEvent.catalog_version
 * field so the orchestrator can validate LLM tree emissions against the
 * catalog version in effect at emission time. Bump this string whenever
 * the catalog's public shape changes.
 */
export const NC_CATALOG_VERSION = asNCCatalogVersion("nc-starter-0.3");

const jsonPrimitive = z.union([
  z.string().max(NC_STRING_MAX_LENGTH),
  z.number(),
  z.boolean(),
  z.null(),
]);

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    jsonPrimitive,
    z.array(jsonValue),
    z.record(z.string().max(128), jsonValue),
  ]),
);

const actionParamsSchema = z
  .record(z.string().min(1).max(128), jsonValue)
  .refine((obj) => Object.keys(obj).length <= NC_ACTION_PARAM_MAX_KEYS, {
    message: `action.params supports at most ${NC_ACTION_PARAM_MAX_KEYS} keys`,
  })
  .refine(
    (obj) => Object.keys(obj).every((k) => !NC_RESERVED_FIELD_IDS.has(k)),
    {
      message:
        "action.params cannot use reserved keys (__proto__, constructor, prototype)",
    },
  )
  .optional();

const visibleProp = z.boolean().optional();

/**
 * Prompt-facing contract the LLM must keep: "accepting" input means
 * emitting a tree that no longer contains those field IDs. Anchored
 * here so generateCatalogPrompt / createLlmIntentHandler can
 * include it without a second source of truth (spec Risk 1).
 */
export const NC_LLM_ACCEPTANCE_CONTRACT =
  "To accept submitted field values, persist them to durable state and emit a new UI tree that omits those input field ids. To reject, re-emit the same field ids (optionally with error props). Never reuse a field id with a different component type. Typing does not invoke you; only catalog actions do.";

/**
 * The NC starter catalog: six components (two display, four input) and
 * two actions. Every input component carries a required field-id prop,
 * which keys the staging buffer (NC Invariant 2). Duplicate IDs
 * across the tree are rejected by catalog.validateTree via the
 * validateUniqueFieldIds check that core runs automatically after Zod
 * parsing (NC Invariant 8).
 */
export const ncStarterCatalog = createCatalog({
  name: "nc-starter",
  components: {
    Container: {
      props: z.object({
        direction: z.enum(["column", "row"]).optional(),
        visible: visibleProp,
      }),
      hasChildren: true,
      description:
        "Holds other components. direction=column (default) or row uses flex layout. Optional visible=false hides the subtree.",
    },
    Text: {
      props: z.object({
        content: z.string().max(NC_STRING_MAX_LENGTH),
        visible: visibleProp,
      }),
      description: "Renders plain text from props.content.",
    },
    TextField: {
      props: z.object({
        id: ncFieldIdSchema,
        label: z.string().max(NC_STRING_MAX_LENGTH),
        placeholder: z.string().max(NC_STRING_MAX_LENGTH).optional(),
        error: z.string().max(NC_STRING_MAX_LENGTH).optional(),
        multiline: z.boolean().optional(),
        inputType: z.enum(["text", "email", "password", "number"]).optional(),
        visible: visibleProp,
      }),
      description:
        "Text input bound to staging buffer by props.id. Set multiline for a textarea. inputType defaults to text.",
    },
    Checkbox: {
      props: z.object({
        id: ncFieldIdSchema,
        label: z.string().max(NC_STRING_MAX_LENGTH),
        visible: visibleProp,
      }),
      description: "Boolean input bound to staging buffer by props.id.",
    },
    Select: {
      props: z.object({
        id: ncFieldIdSchema,
        label: z.string().max(NC_STRING_MAX_LENGTH),
        options: z
          .array(z.string().min(1).max(NC_STRING_MAX_LENGTH))
          .min(1)
          .max(NC_SELECT_MAX_OPTIONS),
        error: z.string().max(NC_STRING_MAX_LENGTH).optional(),
        visible: visibleProp,
      }),
      description:
        "Single-select bound to staging by props.id. options is a non-empty list of string values (the option label is the value). Layout is a native select; there is no tokenized spacing system.",
    },
    Button: {
      props: z.object({
        label: z.string().max(NC_STRING_MAX_LENGTH),
        visible: visibleProp,
        action: z
          .object({
            name: z.enum(NC_STARTER_ACTIONS),
            params: actionParamsSchema,
          })
          .optional(),
      }),
      description:
        "Fires a catalog action via ActionProvider. action.name must be submit_form or cancel.",
    },
  },
  actions: {
    submit_form: {
      description:
        "Flush the current staging buffer as an intent event. " +
        NC_LLM_ACCEPTANCE_CONTRACT,
    },
    cancel: {
      description:
        "Cancel the current intent. The runtime discards staging buffer entries after the IntentEvent is built (the event still carries the snapshot).",
    },
  },
});
