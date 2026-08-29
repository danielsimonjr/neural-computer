// SPDX-License-Identifier: Apache-2.0

import {
  createHeadlessRenderer,
  JsonStringSerializer,
  createHtmlSerializer,
  type HeadlessRegistry,
  type NormalizedNode,
} from "@json-ui/headless";
import type { ObservableDataModel, StagingBuffer, UITree } from "@json-ui/core";
import { ncHeadlessRegistry } from "./nc-headless-components";
import { NC_OBSERVER_STALE_THRESHOLD } from "../catalog/limits";
import { freezeDeep } from "../runtime/freeze";
import type { AnyCatalog, NCObserver } from "../types";

export interface CreateNCObserverOptions {
  // Catalog is required per HeadlessRendererOptions (renderer.ts:27 in
  // @json-ui/headless). Bound once at construction — HeadlessRenderer.render
  // takes only the tree.
  catalog: AnyCatalog;
  staging: StagingBuffer;
  data: ObservableDataModel;
  catalogVersion?: string;
  /**
   * Additional headless components merged under ncHeadlessRegistry.
   * Builtin names cannot be overridden (same rule as extraRegistry on
   * NCRenderer) so Invariant 12 cannot be broken by replacing Button.
   */
  extraRegistry?: HeadlessRegistry;
  onStale?: (consecutiveFailures: number, lastPassId: number) => void;
}

/**
 * Factory options including the test-only `registry` override. Not
 * re-exported from the public barrel; tests import createNCObserver
 * from this module and pass `registry` as an extra property.
 */
interface ObserverFactoryOptions extends CreateNCObserverOptions {
  registry?: HeadlessRegistry;
}

export function createNCObserver(options: ObserverFactoryOptions): NCObserver {
  const builtinKeys = new Set(Object.keys(ncHeadlessRegistry));
  if (options.extraRegistry) {
    for (const key of Object.keys(options.extraRegistry)) {
      if (builtinKeys.has(key)) {
        console.warn(
          `[NC] extraHeadlessRegistry attempted to override built-in "${key}"; ignored.`,
        );
      }
    }
  }
  const registry: HeadlessRegistry =
    options.registry ??
    ({
      ...(options.extraRegistry ?? {}),
      ...ncHeadlessRegistry,
    } as HeadlessRegistry);

  const renderer = createHeadlessRenderer({
    catalog: options.catalog,
    registry,
    staging: options.staging,
    data: options.data,
    catalogVersion: options.catalogVersion,
  });

  const htmlSerializer = createHtmlSerializer({ emitters: {} });

  let lastRender: NormalizedNode | null = null;
  let lastPassId = 0;
  let consecutiveFailures = 0;
  let destroyed = false;
  let staleSignaled = false;

  return {
    render(tree: UITree) {
      if (destroyed) return;
      try {
        lastRender = freezeDeep(renderer.render(tree));
        lastPassId += 1;
        consecutiveFailures = 0;
        staleSignaled = false;
      } catch (err) {
        consecutiveFailures += 1;
        console.warn(
          `[NC] Observer render threw (failure #${consecutiveFailures}); ` +
            `keeping last good cache:`,
          err,
        );
        if (
          consecutiveFailures >= NC_OBSERVER_STALE_THRESHOLD &&
          !staleSignaled
        ) {
          staleSignaled = true;
          console.error(
            `[NC] Observer stale: ${consecutiveFailures} consecutive failures; last good passId=${lastPassId}`,
          );
          options.onStale?.(consecutiveFailures, lastPassId);
        }
      }
    },
    getLastRender() {
      return lastRender;
    },
    getLastRenderPassId() {
      return lastPassId;
    },
    getConsecutiveFailures() {
      return consecutiveFailures;
    },
    serialize(format) {
      if (lastRender === null) return null;
      if (format === "json-string")
        return JsonStringSerializer.serialize(lastRender);
      if (format === "html") return htmlSerializer.serialize(lastRender);
      return null;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      renderer.destroy();
    },
  };
}
