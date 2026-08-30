// SPDX-License-Identifier: Apache-2.0

import type { JSONValue, ObservableDataModel } from "@json-ui/core";

/**
 * React DataProvider must not mutate durable state. Built-in NC inputs
 * only write the staging buffer; extraRegistry components still get
 * `useData()` from JSON-UI. This wrapper keeps reads live and throws
 * on set/delete/write so the intent handler remains the write seam.
 */
export function readOnlyDurableStore(
  store: ObservableDataModel,
): ObservableDataModel {
  return {
    get: (path) => store.get(path),
    snapshot: () => store.snapshot(),
    subscribe: (callback) => store.subscribe(callback),
    set(path: string, _value: JSONValue): void {
      throw new Error(
        `[NC] DataProvider cannot write durable state at ${JSON.stringify(path)}; use the intent handler (durable_write / onDurableWrite).`,
      );
    },
    delete(path: string): void {
      throw new Error(
        `[NC] DataProvider cannot delete durable state at ${JSON.stringify(path)}; use the intent handler.`,
      );
    },
    write(path: string, _value: JSONValue): void {
      throw new Error(
        `[NC] DataProvider cannot write durable state at ${JSON.stringify(path)}; use the intent handler.`,
      );
    },
  };
}
