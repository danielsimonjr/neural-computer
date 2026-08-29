import { describe, it, expect, vi } from "vitest";
import { createAnthropicTransport } from "./anthropic-transport";
import { NC_DEFAULT_ANTHROPIC_MODEL } from "./limits";

describe("createAnthropicTransport", () => {
  it("maps NC tools and messages onto Anthropic params", async () => {
    const send = vi.fn(async (params: { model: string }) => {
      expect(params.model).toBe(NC_DEFAULT_ANTHROPIC_MODEL);
      return {
        content: [
          {
            type: "tool_use" as const,
            id: "t1",
            name: "commit_ui_tree",
            input: { tree: { root: "r", elements: {} } },
          },
        ],
      };
    });
    const transport = createAnthropicTransport({
      send: send as unknown as NonNullable<
        Parameters<typeof createAnthropicTransport>[0]
      >["send"],
    });
    const result = await transport.complete({
      system: "sys",
      messages: [{ role: "user", content: [{ type: "text", text: "{}" }] }],
      tools: [
        {
          name: "commit_ui_tree",
          description: "commit",
          input_schema: { type: "object", properties: {} },
        },
      ],
    });
    expect(send).toHaveBeenCalledTimes(1);
    const params = send.mock.calls[0]![0] as unknown as {
      system: string;
      tools: Array<{ name: string }>;
    };
    expect(params.system).toBe("sys");
    expect(params.tools[0]?.name).toBe("commit_ui_tree");
    expect(result.content[0]).toMatchObject({
      type: "tool_use",
      name: "commit_ui_tree",
    });
  });
});
