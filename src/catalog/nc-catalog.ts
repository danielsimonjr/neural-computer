import { createCatalog } from "@json-ui/core";
import { z } from "zod";
import type { NCCatalogVersion } from "../types";

/**
 * Version string threaded through every emitted IntentEvent.catalog_version
 * field so the orchestrator can validate LLM tree emissions against the
 * catalog version in effect at emission time. Bump this string whenever
 * the catalog's public shape changes.
 */
export const NC_CATALOG_VERSION = "nc-starter-0.1" as NCCatalogVersion;

/**
 * The NC starter catalog: five components (two display, three input) and
 * two actions. Every input component carries a required `id: z.string()`
 * prop, which keys the staging buffer (NC Invariant 2). Duplicate IDs
 * across the tree are rejected by catalog.validateTree via the
 * validateUniqueFieldIds check that core runs automatically after Zod
 * parsing (NC Invariant 8).
 */
export const ncStarterCatalog = createCatalog({
  name: "nc-starter",
  components: {
    Container: {
      props: z.object({}),
      hasChildren: true,
      description: "Holds other components. Only layout semantics.",
    },
    Text: {
      props: z.object({
        content: z.string(),
      }),
      description: "Renders plain text from props.content.",
    },
    TextField: {
      props: z.object({
        id: z.string(),
        label: z.string(),
        placeholder: z.string().optional(),
        error: z.string().optional(),
      }),
      description:
        "Single-line text input bound to staging buffer by props.id.",
    },
    Checkbox: {
      props: z.object({
        id: z.string(),
        label: z.string(),
      }),
      description: "Boolean input bound to staging buffer by props.id.",
    },
    Button: {
      props: z.object({
        label: z.string(),
        // Action declaration. NC's Button fires ActionProvider.execute
        // with this action when clicked. The name must match an entry
        // in the catalog's `actions` map. Params are optional and may
        // contain DynamicValue literals ({path: "..."}) that the
        // staging-aware resolver will substitute at dispatch time.
        action: z
          .object({
            name: z.string(),
            params: z.record(z.string(), z.unknown()).optional(),
          })
          .optional(),
      }),
      description:
        "Fires a catalog action via ActionProvider. Action declared via props.action.",
    },
  },
  actions: {
    submit_form: {
      description: "Flush the current staging buffer as an intent event.",
    },
    cancel: {
      description: "Cancel the current intent (discards staging snapshot).",
    },
  },
});
