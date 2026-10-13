"""Codex 0.160 foreground work ledger, rebuilt incrementally from native records.

Only status/identity metadata survives a scan. No daemon, execution, terminal
scraping, or inactivity heuristic. Unknown layouts cannot certify completion.
"""
import json
from pathlib import Path
import re
import sqlite3
import time

from codex_history import BLOCK, PASS_BYTES, MAX_ROW, find_child, identity, item_state


def metadata(path):
    try:
        with Path(path).open("rb") as stream:
            row = json.loads(stream.readline(BLOCK))
        return row["payload"] if row.get("type") == "session_meta" else {}
    except (OSError, ValueError, TypeError, KeyError):
        return {}


def supported(path, thread):
    meta = metadata(path)
    return meta.get("id") == thread and str(meta.get("cli_version", "")).startswith("0.160.")


def output_header(output):
    if isinstance(output, str):
        return output.split("\n", 1)[0]
    if isinstance(output, list) and output and isinstance(output[0], dict):
        return str(output[0].get("text", "")).split("\n", 1)[0]
    return ""


def large_row_header(raw):
    """Project a large image/message row's leading metadata, not its body.

    raw_decode checks actual JSON keys/values; words inside tool output never
    become events. The caller consumes the rest through the newline before
    applying the projection. Unsupported large work records remain unknown.
    """
    decoder = json.JSONDecoder()
    text = raw[:BLOCK].decode("utf-8", errors="replace")
    def fields(position):
        if text[position] != "{":
            raise ValueError("not an object")
        position += 1
        while True:
            while text[position].isspace() or text[position] == ",": position += 1
            if text[position] == "}": return
            key, position = decoder.raw_decode(text, position)
            while text[position].isspace(): position += 1
            if text[position] != ":": raise ValueError("missing colon")
            position += 1
            while text[position].isspace(): position += 1
            yield key, position
            _, position = decoder.raw_decode(text, position)
    try:
        row, payload = {}, {}
        for key, position in fields(text.index("{")):
            if key == "payload":
                for name, start in fields(position):
                    if name == "output" and payload.get("type") in ("custom_tool_call_output", "function_call_output"):
                        if text[start] == "[":
                            start += 1
                            while text[start].isspace(): start += 1
                            part, _ = decoder.raw_decode(text, start)
                            header = output_header([part])
                        else:
                            value, _ = decoder.raw_decode(text, start)
                            header = output_header(value)
                        if header in ("Script completed", "Script failed", "Script terminated") or header.startswith("Script running with cell ID "):
                            return {"type": row.get("type"), "payload": {**payload, "output": header}}
                        return None
                    if name in ("type", "call_id", "id"):
                        payload[name], _ = decoder.raw_decode(text, start)
                        if name == "type" and row.get("type") == "response_item" and payload[name] in ("message", "reasoning", "agent_message"):
                            return {"type": "ignored"}
            elif key == "type":
                row[key], _ = decoder.raw_decode(text, position)
        return None
    except (ValueError, IndexError, TypeError):
        return None


def passive_poll(code):
    """Recognize only a single read-only write_stdin call plus printing its result.

    This is transport, not an independent monitor. General JS, loops, timers,
    additional tools and nonempty stdin deliberately receive no such proof.
    """
    value = r"(?:[0-9]+|\"\"|'')"
    pair = r"(?:session_id|chars|yield_time_ms|max_output_tokens)\s*:\s*" + value
    args = r"(?P<args>\{\s*" + pair + r"(?:\s*,\s*" + pair + r")*\s*,?\s*\})"
    call = r"await\s+tools\.write_stdin\(\s*" + args + r"\s*\)"
    patterns = [r"\s*text\(\s*" + call + r"\s*\)\s*;?\s*",
                r"\s*const\s+(?P<var>[A-Za-z_$][\w$]*)\s*=\s*" + call
                + r"\s*;\s*text\(\s*(?:JSON\.stringify\(\s*(?P=var)\s*\)|(?P=var))\s*\)\s*;?\s*"]
    for pattern in patterns:
        match = re.fullmatch(pattern, code)
        if not match:
            continue
        fields = re.findall(r"(\w+)\s*:\s*(" + value + r")", match["args"])
        values = dict(fields)
        if len(values) != len(fields) or values.get("chars", '""') not in ('""', "''"):
            return None
        if str(values.get("session_id", "")).isdigit():
            return str(int(values["session_id"]))
    return None


def consume(scan, row):
    event = row.get("payload", {})
    kind = event.get("type")
    if row.get("type") == "event_msg":
        if kind in ("task_started", "task_complete", "turn_aborted"):
            scan["latest"] = {"type": kind, "turn": event.get("turn_id")}
            if kind == "task_started":
                scan["error"] = False
        elif kind == "error" and event.get("will_retry") is False:
            scan["error"] = True
        item = item_state(row)
        if item:
            if item["ended"]:
                scan["pending"].pop(item["id"], None)
                process = str(item.get("process"))
                scan["scripts"] = {call: script for call, script in scan["scripts"].items()
                                   if not script.get("poll") or script["poll"] != process}
            else:
                scan["pending"][item["id"]] = item
        detail = event.get("item", {})
        if kind in ("item_started", "item_completed"):
            if (detail.get("type") == "SubAgentActivity" and detail.get("kind") == "started"
                    and detail.get("agent_thread_id")):
                scan["children"][detail["agent_thread_id"]] = True
            elif str(detail.get("type", "")).startswith("Collab"):
                # Waiting/listening creates no new work. For calls with actual
                # receivers, inspect those threads rather than freezing unknown.
                if detail.get("type") != "CollabAgentToolCall":
                    scan["unknown"] = True
                else:
                    if detail.get("tool") in ("spawn", "spawnAgent"):
                        for child in detail.get("receiver_thread_ids", []):
                            scan["children"][child] = True
    if row.get("type") == "response_item":
        call = event.get("call_id")
        name = str(event.get("name", "")).removeprefix("functions.")
        if kind == "custom_tool_call" and name == "exec" and call:
            scan["scripts"][call] = {"cell": None, "poll": passive_poll(event.get("input", ""))}
        elif kind == "custom_tool_call_output" and call in scan["scripts"]:
            header = output_header(event.get("output"))
            # A yielded code-mode cell can outlive the root's final answer.
            running = re.fullmatch(r"Script running with cell ID (\S+)", header)
            if running:
                scan["scripts"][call]["cell"] = running[1]
            else:
                scan["scripts"].pop(call, None)
        elif kind == "function_call" and name == "wait" and call:
            args = json.loads(event.get("arguments", "{}"))
            if args.get("cell_id") is not None:
                scan["waits"][call] = str(args["cell_id"])
        elif kind == "function_call_output" and call in scan["waits"]:
            cell = scan["waits"].pop(call)
            if output_header(event.get("output")) in ("Script completed", "Script failed", "Script terminated"):
                scan["scripts"] = {key: value for key, value in scan["scripts"].items() if value.get("cell") != cell}


def scan_file(path, thread, scans, budget):
    """Share one byte/time budget across the root and all descendants."""
    source = Path(path)
    stat = source.stat()
    scan = scans.setdefault(thread, {})
    key = identity(source, stat) + [3]
    if (scan.get("identity") != key or scan.get("offset", 0) > stat.st_size
            or (scan.get("size") == stat.st_size and scan.get("mtime") != stat.st_mtime_ns)):
        scan.clear()
        scan.update(identity=key, offset=0, latest=None, pending={}, children={}, scripts={}, waits={}, unknown=False, error=False)
    with source.open("rb") as stream:
        stream.seek(scan["offset"])
        while stream.tell() < stat.st_size and budget["bytes"] > 0 and time.monotonic() < budget["deadline"]:
            position = stream.tell()
            if "largeRow" in scan:
                line = stream.readline(min(BLOCK, budget["bytes"]))
                budget["bytes"] -= len(line)
                scan["offset"] = stream.tell()
                if line.endswith(b"\n"):
                    projection = scan.pop("largeRow")
                    if projection is not None:
                        consume(scan, projection)
                continue
            cap = min(MAX_ROW + 1, budget["bytes"] + 1)
            line = stream.readline(cap)
            budget["bytes"] -= len(line)
            if not line.endswith(b"\n"):
                projection = large_row_header(line) if len(line) >= BLOCK else None
                if len(line) > MAX_ROW or (len(line) == cap and projection is not None):
                    scan["unknown"] = scan["unknown"] or projection is None
                    scan["largeRow"] = projection
                    scan["offset"] = stream.tell()
                else:
                    scan["offset"] = position
                break
            scan["offset"] = stream.tell()
            try:
                consume(scan, json.loads(line))
            except (ValueError, TypeError, AttributeError):
                scan["unknown"] = True
    final_stat = source.stat()
    scan["size"], scan["mtime"] = final_stat.st_size, final_stat.st_mtime_ns
    scan["caughtUp"] = scan["offset"] == scan["size"] and "largeRow" not in scan
    return scan


def goal_database(home, owner=None):
    database = Path(home) / "goals_1.sqlite"
    # An already-open store identifies the effective sqlite_home even when a
    # profile or environment relocated it. Only inspect this bound Codex PID.
    if owner and type(owner.get("pid")) is int:
        directory = Path("/proc") / str(owner["pid"]) / "fd"
        candidates = set()
        if directory.is_dir():
            for link in directory.iterdir():
                try:
                    target = link.resolve(strict=True)
                    if target.name == "goals_1.sqlite":
                        candidates.add(target)
                except OSError:
                    pass
            if len(candidates) > 1:
                raise ValueError("Ambiguous goal store")
            if candidates:
                database = candidates.pop()
    return database


def goal_status(database, thread):
    """Read the 0.160 goal store without opening/creating a runtime connection."""
    if not database.exists():
        return None  # 0.160 creates this store lazily on the first goal.
    connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=0.05)
    try:
        connection.execute("PRAGMA query_only=ON")
        row = connection.execute("SELECT status FROM thread_goals WHERE thread_id = ?", (thread,)).fetchone()
        return row[0] if row else None
    finally:
        connection.close()


def inspect(record, deadline):
    tracker = record.get("foreground", {})
    path, root = tracker.get("transcript"), record.get("id")
    if not path or not root or not supported(path, root):
        return None
    scans = tracker.setdefault("workLedger", {})
    budget = {"bytes": PASS_BYTES, "deadline": deadline}
    queue = [(root, path)]
    visited = set()
    tasks, requests = set(), set()
    caught_up = True
    latest = None
    limited, failed = False, False
    try:
        database = goal_database(record["scope"], record.get("binding"))
        while queue:
            if time.monotonic() >= budget["deadline"]:
                caught_up = False
                break
            thread, path = queue.pop(0)
            if thread in visited:
                continue
            if len(visited) >= 64:
                caught_up, limited = False, True
                break
            visited.add(thread)
            if not supported(path, thread):
                caught_up, limited = False, True
                continue
            scan = scan_file(path, thread, scans, budget)
            caught_up = caught_up and scan["caughtUp"] and not scan["unknown"]
            limited = limited or scan["unknown"]
            end = scan.get("latest") or {}
            if thread == root:
                latest = end
                failed = scan.get("error", False)
            elif end.get("type") not in ("task_complete", "turn_aborted") or not end.get("turn"):
                tasks.add("child:" + thread)
            tasks.update("shell:" + thread + ":" + call for call in scan["pending"])
            tasks.update("script:" + thread + ":" + call for call in scan["scripts"])
            goal = goal_status(database, thread)
            if goal in ("blocked", "budget_limited", "usage_limited"):
                requests.add("goal:" + thread)
            elif goal in ("active", "paused"):
                tasks.add("goal:" + thread)
            elif goal not in (None, "complete"):
                caught_up, limited = False, True
            children = dict(scan["children"])
            if thread == root:
                children.update(tracker.get("children", {}))
            for child in children:
                child_path = find_child(record["scope"], child, thread)
                if child_path:
                    queue.append((child, child_path))
                else:
                    # A missing/foreign child must not disappear from the proof.
                    caught_up, limited = False, True
        # Appends during traversal invalidate this result; no copied old green.
        caught_up = caught_up and all(Path(scans[thread]["identity"][0]).stat().st_size == scans[thread]["size"]
                                      for thread in visited if thread in scans)
        return {"complete": bool(caught_up), "latest": latest, "tasks": sorted(tasks),
                "requests": sorted(requests), "threads": len(visited),
                "error": failed, "limited": bool(limited), "bytesRemaining": max(0, budget["bytes"])}
    except (OSError, ValueError, TypeError, KeyError, sqlite3.Error):
        return {"complete": False, "limited": True, "latest": latest, "tasks": sorted(tasks), "requests": sorted(requests)}
