import { describe, it, expect, vi } from "vitest";
import { createObservableDataModel, type UITree } from "@json-ui/core";
import { ncStarterCatalog, NC_CATALOG_VERSION } from "../catalog";
import { createNCRuntime } from "../runtime";
import { createLlmIntentHandler } from "./llm-handler";
import {
  NCLlmError,
  type NCLlmContent,
  type NCLlmTransport,
} from "./llm-transport";
import type { NCPythonRepl } from "../compute";

const validTree: UITree = {
  root: "r",
  elements: {
    r: { key: "r", type: "Text", props: { content: "hello" } },
  },
};

const invalidTree = {
  root: "r",
  elements: {
    r: { key: "r", type: "TextField", props: {} },
  },
} as unknown as UITree;

function commitUse(id: string, tree: unknown) {
  return {
    type: "tool_use" as const,
    id,
    name: "commit_ui_tree",
    input: { tree },
  };
}

function scripted(
  responses: Array<{ content: NCLlmContent[] }>,
): NCLlmTransport {
  let i = 0;
  return {
    async complete() {
      const next = responses[i++];
      if (!next) throw new Error("script exhausted");
      return next;
    },
  };
}

describe("createLlmIntentHandler", () => {
  it("commits a catalog-valid tree from commit_ui_tree", async () => {
    const runtime = createNCRuntime({
      durableStore: createObservableDataModel({ n: 1 }),
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    const onTreeCommit = vi.fn();
    const transport = scripted([{ content: [commitUse("1", validTree)] }]);
    const handler = createLlmIntentHandler({
      runtime,
      catalog: ncStarterCatalog,
      onTreeCommit,
      transport,
    });
    await handler({
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: { email: "a@b.c" },
      catalog_version: NC_CATALOG_VERSION,
      timestamp: 0,
    });
    expect(onTreeCommit).toHaveBeenCalledTimes(1);
    const tree = onTreeCommit.mock.calls[0]![0] as UITree;
    expect(tree.root).toBe("r");
    runtime.destroy();
  });

  it("returns a tool error for an invalid tree and commits on retry", async () => {
    const runtime = createNCRuntime({
      durableStore: createObservableDataModel({}),
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    const onTreeCommit = vi.fn();
    const transport = scripted([
      { content: [commitUse("1", invalidTree)] },
      { content: [commitUse("2", validTree)] },
    ]);
    const handler = createLlmIntentHandler({
      runtime,
      catalog: ncStarterCatalog,
      onTreeCommit,
      transport,
    });
    await handler({
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: {},
      timestamp: 0,
    });
    expect(onTreeCommit).toHaveBeenCalledTimes(1);
    runtime.destroy();
  });

  it("rejects when maxRounds pass without a valid commit", async () => {
    const runtime = createNCRuntime({
      durableStore: createObservableDataModel({}),
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    const onTreeCommit = vi.fn();
    const transport = scripted([
      { content: [{ type: "text", text: "thinking" }] },
      { content: [{ type: "text", text: "still thinking" }] },
    ]);
    const handler = createLlmIntentHandler({
      runtime,
      catalog: ncStarterCatalog,
      onTreeCommit,
      transport,
      maxRounds: 2,
    });
    await expect(
      handler({
        action_name: "submit_form",
        action_params: {},
        staging_snapshot: {},
        timestamp: 0,
      }),
    ).rejects.toMatchObject({ name: "NCLlmError", code: "round_limit" });
    expect(onTreeCommit).not.toHaveBeenCalled();
    runtime.destroy();
  });

  it("wraps transport failures as NCLlmError", async () => {
    const runtime = createNCRuntime({
      durableStore: createObservableDataModel({}),
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    const handler = createLlmIntentHandler({
      runtime,
      catalog: ncStarterCatalog,
      onTreeCommit: vi.fn(),
      transport: {
        complete: async () => {
          throw new Error("network down");
        },
      },
    });
    await expect(
      handler({
        action_name: "submit_form",
        action_params: {},
        staging_snapshot: {},
        timestamp: 0,
      }),
    ).rejects.toBeInstanceOf(NCLlmError);
    runtime.destroy();
  });

  it("calls python_exec on the provided REPL then commits", async () => {
    const runtime = createNCRuntime({
      durableStore: createObservableDataModel({}),
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    const repl: NCPythonRepl = {
      exec: vi.fn(async () => ({
        ok: true,
        stdout: "3\n",
        stderr: "",
        truncated: false,
      })),
      set: vi.fn(async () => {}),
      get: vi.fn(async () => undefined),
      loadContext: vi.fn(async () => {}),
      reset: vi.fn(async () => {}),
      isBusy: () => false,
      destroy: vi.fn(async () => {}),
    };
    const transport = scripted([
      {
        content: [
          {
            type: "tool_use",
            id: "p",
            name: "python_exec",
            input: { code: "print(1+2)" },
          },
        ],
      },
      { content: [commitUse("c", validTree)] },
    ]);
    const handler = createLlmIntentHandler({
      runtime,
      catalog: ncStarterCatalog,
      onTreeCommit: vi.fn(),
      transport,
      repl,
    });
    await handler({
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: {},
      timestamp: 0,
    });
    expect(repl.exec).toHaveBeenCalledWith("print(1+2)");
    runtime.destroy();
  });

  it("calls onDurableWrite for durable_write tools", async () => {
    const runtime = createNCRuntime({
      durableStore: createObservableDataModel({}),
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    const onDurableWrite = vi.fn(async () => {});
    const transport = scripted([
      {
        content: [
          {
            type: "tool_use",
            id: "d",
            name: "durable_write",
            input: { path: "/note", value: "hi" },
          },
        ],
      },
      { content: [commitUse("c", validTree)] },
    ]);
    const handler = createLlmIntentHandler({
      runtime,
      catalog: ncStarterCatalog,
      onTreeCommit: vi.fn(),
      transport,
      onDurableWrite,
    });
    await handler({
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: {},
      timestamp: 0,
    });
    expect(onDurableWrite).toHaveBeenCalledWith({ path: "/note", value: "hi" });
    runtime.destroy();
  });

  it("writes through durableStore.write when onDurableWrite is omitted", async () => {
    const runtime = createNCRuntime({
      durableStore: createObservableDataModel({}),
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    const transport = scripted([
      {
        content: [
          {
            type: "tool_use",
            id: "d",
            name: "durable_write",
            input: { path: "note", value: "via-store" },
          },
        ],
      },
      { content: [commitUse("c", validTree)] },
    ]);
    const handler = createLlmIntentHandler({
      runtime,
      catalog: ncStarterCatalog,
      onTreeCommit: vi.fn(),
      transport,
    });
    await handler({
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: {},
      timestamp: 0,
    });
    expect(runtime.durableStore.get("note")).toBe("via-store");
    runtime.destroy();
  });

  it("calls python_load_context and python_reset then commits", async () => {
    const runtime = createNCRuntime({
      durableStore: createObservableDataModel({}),
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    const repl: NCPythonRepl = {
      exec: vi.fn(async () => ({
        ok: true,
        stdout: "",
        stderr: "",
        truncated: false,
      })),
      set: vi.fn(async () => {}),
      get: vi.fn(async () => undefined),
      loadContext: vi.fn(async () => {}),
      reset: vi.fn(async () => {}),
      isBusy: () => false,
      destroy: vi.fn(async () => {}),
    };
    const transport = scripted([
      {
        content: [
          {
            type: "tool_use",
            id: "l",
            name: "python_load_context",
            input: { text: "prompt" },
          },
        ],
      },
      {
        content: [
          { type: "tool_use", id: "r", name: "python_reset", input: {} },
        ],
      },
      { content: [commitUse("c", validTree)] },
    ]);
    const handler = createLlmIntentHandler({
      runtime,
      catalog: ncStarterCatalog,
      onTreeCommit: vi.fn(),
      transport,
      repl,
    });
    await handler({
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: {},
      timestamp: 0,
    });
    expect(repl.loadContext).toHaveBeenCalledWith("prompt");
    expect(repl.reset).toHaveBeenCalledTimes(1);
    runtime.destroy();
  });

  it("returns a tool error when onDurableWrite throws, then commits", async () => {
    const runtime = createNCRuntime({
      durableStore: createObservableDataModel({}),
      catalog: ncStarterCatalog,
      catalogVersion: NC_CATALOG_VERSION,
    });
    const onTreeCommit = vi.fn();
    const transport = scripted([
      {
        content: [
          {
            type: "tool_use",
            id: "d",
            name: "durable_write",
            input: { path: "/x", value: 1 },
          },
        ],
      },
      { content: [commitUse("c", validTree)] },
    ]);
    const handler = createLlmIntentHandler({
      runtime,
      catalog: ncStarterCatalog,
      onTreeCommit,
      transport,
      onDurableWrite: async () => {
        throw new Error("graph write failed");
      },
    });
    await handler({
      action_name: "submit_form",
      action_params: {},
      staging_snapshot: {},
      timestamp: 0,
    });
    expect(onTreeCommit).toHaveBeenCalledTimes(1);
    runtime.destroy();
  });
});
