// SPDX-License-Identifier: Apache-2.0

export {
  ncStarterCatalog,
  NC_CATALOG_VERSION,
  NC_LLM_ACCEPTANCE_CONTRACT,
} from "./nc-catalog";
export { ncFieldIdSchema, isSafeFieldId } from "./field-id";
export { isSafeDurablePath } from "./durable-path";
export {
  NC_FIELD_ID_MAX_LENGTH,
  NC_STRING_MAX_LENGTH,
  NC_ACTION_PARAM_MAX_KEYS,
  NC_STAGING_MAX_FIELDS,
  NC_SNAPSHOT_MAX_BYTES,
  NC_SELECT_MAX_OPTIONS,
  NC_DURABLE_PATH_MAX_LENGTH,
  NC_DURABLE_PATH_MAX_SEGMENTS,
  NC_DURABLE_VALUE_MAX_BYTES,
  NC_OBSERVER_STALE_THRESHOLD,
  NC_STARTER_ACTIONS,
  NC_RESERVED_FIELD_IDS,
  type NCStarterActionName,
} from "./limits";
