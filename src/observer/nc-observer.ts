import {
  createHeadlessRenderer,
  JsonStringSerializer,
  createHtmlSerializer,
  type HeadlessRegistry,
  type NormalizedNode,
} from "@json-ui/headless";
import type {
  Catalog,
  ObservableDataModel,
  StagingBuffer,
  UITree,
} from "@json-ui/core";
import { ncHeadlessRegistry } from "./nc-headless-components";
import type { NCObserver } from "../types";

export interface CreateNCObserverOptions {
  // Catalog is required per HeadlessRendererOptions (renderer.ts:27 in
  // @json-ui/headless). Bound once at construction — HeadlessRenderer.render
  // takes only the tree.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catalog: Catalog<any, any, any>;
  staging: StagingBuffer;
  data: ObservableDataModel;
  catalogVersion?: string;
  /**
   * Optional registry override. Defaults to ncHeadlessRegistry. Exposed so
   * tests can inject a throwing component to exercise Invariant 13's
   * "observer catches the exception and preserves last good cache" path.
   * Production callers should use the default.
   */
  registry?: HeadlessRegistry;
}

// Fallback-only HTML serializer for diagnostic output. `emitters: {}` means
// every node falls through to the default <div data-type="..."> wrapper
// (see html.ts:41-42 in @json-ui/headless). Production HTML rendering
// (with per-type emitters) belongs to a separate spec if ever needed.
const ncHtmlSerializer = createHtmlSerializer({ emitters: {} });

export function createNCObserver(
  options: CreateNCObserverOptions,
): NCObserver {
  const renderer = createHeadlessRenderer({
    catalog: options.catalog,
    registry: options.registry ?? ncHeadlessRegistry,
    staging: options.staging,
    data: options.data,
    catalogVersion: options.catalogVersion,
  });

  let lastRender: NormalizedNode | null = null;
  let lastPassId = 0;
  let consecutiveFailures = 0;
  let destroyed = false;

  return {
    render(tree: UITree) {
      if (destroyed) return;
      try {
        lastRender = renderer.render(tree);
        lastPassId += 1;
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures += 1;
        console.warn(
          `[NC] Observer render threw (failure #${consecutiveFailures}); ` +
            `keeping last good cache:`,
          err,
        );
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
      if (format === "html") return ncHtmlSerializer.serialize(lastRender);
      throw new Error(`[NC] Unknown serialize format: ${format as string}`);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      renderer.destroy();
    },
  };
}
