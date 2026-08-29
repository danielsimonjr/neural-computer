// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPythonRepl,
  NC_REPL_CONTEXT_NAME,
  NCReplError,
  resolveWorkerPath,
  type NCPythonRepl,
} from "./index";

function pythonAvailable(): boolean {
  const result = spawnSync("python3", ["-c", "raise SystemExit(0)"], {
    encoding: "utf8",
  });
  return result.status === 0;
}

async function expectReplError(
  fn: () => Promise<unknown>,
  code: NCReplError["code"],
): Promise<NCReplError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(NCReplError);
    expect((err as NCReplError).code).toBe(code);
    return err as NCReplError;
  }
  throw new Error(`expected NCReplError(${code})`);
}

const describeRepl = pythonAvailable() ? describe : describe.skip;

describe("resolveWorkerPath", () => {
  it("finds worker.py next to the compute module", () => {
    expect(existsSync(resolveWorkerPath())).toBe(true);
    expect(resolveWorkerPath().endsWith("worker.py")).toBe(true);
  });
});

describe("createPythonRepl missing interpreter", () => {
  it("throws spawn when pythonPath does not exist", async () => {
    const err = await expectReplError(
      () =>
        createPythonRepl({
          pythonPath: "/nonexistent/python3-neural-computer",
          timeoutMs: 1000,
        }),
      "spawn",
    );
    expect(err.message).toMatch(/not found/);
    expect(err.message).toMatch(/pythonPath/);
  });
});

describeRepl("createPythonRepl", () => {
  let repl: NCPythonRepl | undefined;

  afterEach(async () => {
    const current = repl;
    repl = undefined;
    await current?.destroy();
  });

  async function boot(
    options?: Parameters<typeof createPythonRepl>[0],
  ): Promise<NCPythonRepl> {
    repl = await createPythonRepl(options);
    return repl;
  }

  it("exec prints to stdout", async () => {
    const r = await boot();
    const result = await r.exec("print('hello')");
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("hello\n");
    expect(result.truncated).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("keeps namespace across exec calls", async () => {
    const r = await boot();
    await r.exec("x = 21");
    const result = await r.exec("print(x * 2)");
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("42\n");
  });

  it("set/get round-trips JSON values", async () => {
    const r = await boot();
    await r.set("payload", { n: 3, flags: [true, null] });
    expect(await r.get("payload")).toEqual({ n: 3, flags: [true, null] });
  });

  it("loadContext writes the RLM context variable", async () => {
    const r = await boot();
    await r.loadContext("the prompt");
    expect(await r.get(NC_REPL_CONTEXT_NAME)).toBe("the prompt");
    const result = await r.exec("print(context[:3])");
    expect(result.stdout).toBe("the\n");
  });

  it("reset clears user bindings", async () => {
    const r = await boot();
    await r.set("payload", 1);
    await r.reset();
    await expectReplError(() => r.get("payload"), "python");
  });

  it("returns ok:false for syntax errors without throwing", async () => {
    const r = await boot();
    const result = await r.exec("def (");
    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("SyntaxError");
  });

  it("returns ok:false for runtime errors", async () => {
    const r = await boot();
    const result = await r.exec("print(missing)");
    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("NameError");
  });

  it("timeout kills the worker and respawns with an empty namespace", async () => {
    const r = await boot({ timeoutMs: 800 });
    await r.set("payload", "keep-me");
    await expectReplError(() => r.exec("while True:\n    pass\n"), "timeout");
    expect(r.isBusy()).toBe(false);
    await expectReplError(() => r.get("payload"), "python");
    const result = await r.exec("print(1)");
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("1\n");
  });

  it("truncates oversized stdout", async () => {
    const r = await boot({ maxStdoutBytes: 32 });
    const result = await r.exec("print('x' * 200)");
    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(32);
  });

  it("rejects a second operation while one is in flight", async () => {
    const r = await boot({ timeoutMs: 2000 });
    const first = r.exec("while True:\n    pass\n");
    await expectReplError(() => r.exec("print(1)"), "busy");
    expect(r.isBusy()).toBe(true);
    await expectReplError(() => first, "timeout");
  });

  it("destroy is idempotent and later exec throws destroyed", async () => {
    const r = await boot();
    await r.destroy();
    await r.destroy();
    await expectReplError(() => r.exec("print(1)"), "destroyed");
  });

  it("rejects dunder and reserved identifiers", async () => {
    const r = await boot();
    await expectReplError(() => r.set("__secret", 1), "limit");
    await expectReplError(() => r.set("llm_query", 1), "limit");
    await expectReplError(() => r.set("has-dash", 1), "limit");
  });

  it("rejects oversized code before talking to the worker", async () => {
    const r = await boot({ maxCodeBytes: 8 });
    await expectReplError(() => r.exec("print(12345)"), "limit");
  });

  it("routes llm_query through the host callback", async () => {
    const r = await boot({
      llmQuery: async (prompt) => `echo:${prompt}`,
    });
    const result = await r.exec("print(llm_query('hi'))");
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("echo:hi\n");
  });

  it("does not leak llm_query protocol traffic into stdout", async () => {
    const r = await boot({
      llmQuery: async () => "secret-reply",
    });
    const result = await r.exec("print('visible'); llm_query('p')");
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("visible\n");
    expect(result.stdout).not.toMatch(/llm_query|secret-reply/);
  });

  it("raises inside exec when llm_query is not configured", async () => {
    const r = await boot();
    const result = await r.exec("print(llm_query('x'))");
    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("RuntimeError");
  });

  it("exposes json, math, and re in the namespace", async () => {
    const r = await boot();
    const result = await r.exec(
      "print(json.dumps({'a': 1})); print(int(math.floor(3.7))); print(bool(re.match('a+', 'aaa')))",
    );
    expect(result.ok).toBe(true);
    expect(result.stdout.split("\n")).toEqual(['{"a": 1}', "3", "True", ""]);
  });

  it("does not provide open or __import__ in user builtins", async () => {
    const r = await boot();
    const noOpen = await r.exec("open('/etc/passwd')");
    expect(noOpen.ok).toBe(false);
    const noImport = await r.exec("import os");
    expect(noImport.ok).toBe(false);
  });
});
