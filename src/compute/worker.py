# SPDX-License-Identifier: Apache-2.0
"""Neural Computer RLM-pattern Python REPL worker.

JSON-lines protocol on stdin/stdout. Not a security sandbox: the host
enforces timeout-and-kill. Restricted builtins reduce accidents; they
are not a jail.
"""

from __future__ import annotations

import io
import json
import math
import re
import sys
import traceback
from typing import Any

PROTOCOL_VERSION = 1

REAL_STDIN = sys.stdin
REAL_STDOUT = sys.stdout
REAL_STDERR = sys.stderr

DEFAULT_MAX_STDOUT = 64 * 1024
DEFAULT_MAX_VALUE = 256 * 1024

IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
RESERVED_NAMES = frozenset(
    {
        "llm_query",
        "json",
        "math",
        "re",
        "__builtins__",
        "__name__",
        "__doc__",
        "True",
        "False",
        "None",
    }
)

SAFE_BUILTINS: dict[str, Any] = {
    "abs": abs,
    "all": all,
    "any": any,
    "bin": bin,
    "bool": bool,
    "chr": chr,
    "dict": dict,
    "divmod": divmod,
    "enumerate": enumerate,
    "filter": filter,
    "float": float,
    "format": format,
    "frozenset": frozenset,
    "hash": hash,
    "hex": hex,
    "int": int,
    "isinstance": isinstance,
    "issubclass": issubclass,
    "iter": iter,
    "len": len,
    "list": list,
    "map": map,
    "max": max,
    "min": min,
    "oct": oct,
    "ord": ord,
    "pow": pow,
    "print": print,
    "range": range,
    "repr": repr,
    "reversed": reversed,
    "round": round,
    "set": set,
    "slice": slice,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
    "Exception": Exception,
    "ArithmeticError": ArithmeticError,
    "AssertionError": AssertionError,
    "AttributeError": AttributeError,
    "IndexError": IndexError,
    "KeyError": KeyError,
    "LookupError": LookupError,
    "NameError": NameError,
    "RuntimeError": RuntimeError,
    "StopIteration": StopIteration,
    "TypeError": TypeError,
    "ValueError": ValueError,
    "ZeroDivisionError": ZeroDivisionError,
    "True": True,
    "False": False,
    "None": None,
}


def write_msg(obj: dict[str, Any]) -> None:
    REAL_STDOUT.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")
    REAL_STDOUT.flush()


def llm_query(prompt: object) -> str:
    if not isinstance(prompt, str):
        raise TypeError("llm_query prompt must be a str")
    write_msg({"op": "llm_query", "prompt": prompt})
    line = REAL_STDIN.readline()
    if not line:
        raise RuntimeError("host closed during llm_query")
    reply = json.loads(line)
    if not isinstance(reply, dict) or reply.get("op") != "llm_reply":
        raise RuntimeError("expected llm_reply from host")
    if reply.get("ok") is False:
        raise RuntimeError(str(reply.get("error") or "llm_query failed"))
    text = reply.get("text")
    if not isinstance(text, str):
        raise TypeError("llm_reply text must be a str")
    return text


def make_namespace() -> dict[str, Any]:
    return {
        "__builtins__": dict(SAFE_BUILTINS),
        "json": json,
        "math": math,
        "re": re,
        "llm_query": llm_query,
    }


def valid_ident(name: object) -> str:
    if not isinstance(name, str):
        raise ValueError("name must be a str")
    if not (1 <= len(name) <= 64) or not IDENT_RE.match(name):
        raise ValueError("invalid identifier")
    if name.startswith("__") or name in RESERVED_NAMES:
        raise ValueError("reserved identifier")
    return name


def truncate(s: str, limit: int) -> tuple[str, bool]:
    raw = s.encode("utf-8")
    if len(raw) <= limit:
        return s, False
    cut = raw[:limit]
    while cut and (cut[-1] & 0xC0) == 0x80:
        cut = cut[:-1]
    return cut.decode("utf-8", errors="ignore"), True


def handle_exec(ns: dict[str, Any], msg: dict[str, Any]) -> None:
    code = msg.get("code")
    if not isinstance(code, str):
        write_msg(
            {
                "id": msg.get("id"),
                "op": "result",
                "ok": False,
                "error": {"type": "TypeError", "message": "code must be a str"},
            }
        )
        return
    max_stdout = int(msg.get("maxStdoutBytes") or DEFAULT_MAX_STDOUT)
    out = io.StringIO()
    err = io.StringIO()
    ok = True
    err_obj = None
    try:
        sys.stdout = out
        sys.stderr = err
        try:
            exec(code, ns, ns)  # this is the REPL
        except Exception as exc:
            ok = False
            err_obj = {"type": type(exc).__name__, "message": str(exc)}
            traceback.print_exc(file=err)
    finally:
        sys.stdout = REAL_STDOUT
        sys.stderr = REAL_STDERR
    stdout, t1 = truncate(out.getvalue(), max_stdout)
    stderr, t2 = truncate(err.getvalue(), max_stdout)
    result: dict[str, Any] = {
        "id": msg.get("id"),
        "op": "result",
        "ok": ok,
        "stdout": stdout,
        "stderr": stderr,
        "truncated": t1 or t2,
    }
    if err_obj is not None:
        result["error"] = err_obj
    write_msg(result)


def main() -> None:
    ns = make_namespace()
    write_msg({"op": "ready", "version": PROTOCOL_VERSION})
    while True:
        line = REAL_STDIN.readline()
        if not line:
            break
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as exc:
            write_msg(
                {
                    "op": "result",
                    "ok": False,
                    "error": {"type": "ProtocolError", "message": str(exc)},
                }
            )
            continue
        if not isinstance(msg, dict):
            write_msg(
                {
                    "op": "result",
                    "ok": False,
                    "error": {"type": "ProtocolError", "message": "expected object"},
                }
            )
            continue
        op = msg.get("op")
        req_id = msg.get("id")
        try:
            if op == "exec":
                handle_exec(ns, msg)
            elif op == "set":
                name = valid_ident(msg.get("name"))
                ns[name] = msg.get("value")
                write_msg({"id": req_id, "op": "result", "ok": True})
            elif op == "get":
                name = valid_ident(msg.get("name"))
                if name not in ns:
                    raise NameError(name)
                value = ns[name]
                dumped = json.dumps(value, ensure_ascii=False)
                max_value = int(msg.get("maxValueBytes") or DEFAULT_MAX_VALUE)
                if len(dumped.encode("utf-8")) > max_value:
                    write_msg(
                        {
                            "id": req_id,
                            "op": "result",
                            "ok": False,
                            "truncated": True,
                            "error": {
                                "type": "LimitError",
                                "message": f"value exceeds {max_value} bytes",
                            },
                        }
                    )
                    continue
                write_msg(
                    {
                        "id": req_id,
                        "op": "result",
                        "ok": True,
                        "value": json.loads(dumped),
                        "truncated": False,
                    }
                )
            elif op == "reset":
                ns = make_namespace()
                write_msg({"id": req_id, "op": "result", "ok": True})
            elif op == "ping":
                write_msg({"id": req_id, "op": "result", "ok": True})
            else:
                write_msg(
                    {
                        "id": req_id,
                        "op": "result",
                        "ok": False,
                        "error": {
                            "type": "ProtocolError",
                            "message": f"unknown op {op}",
                        },
                    }
                )
        except Exception as exc:
            write_msg(
                {
                    "id": req_id,
                    "op": "result",
                    "ok": False,
                    "error": {"type": type(exc).__name__, "message": str(exc)},
                }
            )


if __name__ == "__main__":
    main()
