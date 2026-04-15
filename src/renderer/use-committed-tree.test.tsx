import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { UITree } from "@json-ui/core";
import { useCommittedTree } from "./use-committed-tree";

function makeStreamBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]!));
      i += 1;
    },
  });
}

function mockFetchOnce(body: ReadableStream<Uint8Array>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, body } as Response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const patches = [
  `{"op":"set","path":"/root","value":"r"}\n`,
  `{"op":"set","path":"/elements/r","value":{"key":"r","type":"Text","props":{"content":"hi"}}}\n`,
];

describe("useCommittedTree", () => {
  it("returns null before send is called", () => {
    const { result } = renderHook(() => useCommittedTree({ api: "/mock" }));
    expect(result.current.tree).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });

  it("only commits the tree after the stream completes (atomic mode)", async () => {
    mockFetchOnce(makeStreamBody(patches));
    const { result } = renderHook(() => useCommittedTree({ api: "/mock" }));

    await act(async () => {
      await result.current.send("draw");
    });

    expect(result.current.tree).not.toBeNull();
    expect((result.current.tree as UITree).root).toBe("r");
    expect(result.current.isStreaming).toBe(false);
  });

  it("leaves tree unchanged on stream error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const { result } = renderHook(() => useCommittedTree({ api: "/mock" }));
    await act(async () => {
      await result.current.send("draw");
    });
    expect(result.current.tree).toBeNull();
    expect(result.current.error?.message).toBe("network down");
  });
});
