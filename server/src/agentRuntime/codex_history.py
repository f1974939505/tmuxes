"""Bounded metadata reconciliation for unmatched Codex foreground hooks.

Reads only the explicitly associated local rollout. Never stores command text,
output or prompts, connects to a daemon, or executes a command.
"""
import datetime
import json
from pathlib import Path
import time
import uuid

BLOCK = 256 * 1024
PASS_BYTES = 8 * 1024 * 1024
MAX_ROW = 8 * 1024 * 1024
TERMINAL = ("completed", "failed", "declined")


def item_state(row):
    event = row.get("payload", {})
    if row.get("type") == "event_msg" and event.get("type") in ("exec_command_begin", "exec_command_end"):
        ended = event["type"] == "exec_command_end" and type(event.get("exit_code")) is int
        if isinstance(event.get("call_id"), str):
            return {"id": event["call_id"], "turn": event.get("turn_id"),
                "status": "completed" if ended else "in_progress", "ended": ended}
    if row.get("type") != "event_msg" or event.get("type") not in ("item_started", "item_completed"):
        return None
    item = event.get("item", {})
    kind = item.get("type")
    if kind not in ("CommandExecution", "FileChange", "ImageView") or not isinstance(item.get("id"), str):
        return None
    status = item.get("status")
    ended = event["type"] == "item_completed" and (status in TERMINAL or kind == "ImageView")
    if kind == "CommandExecution" and status == "completed" and type(item.get("exit_code")) is not int:
        ended = False
    return {"id": item["id"], "turn": event.get("turn_id"), "status": status, "ended": ended,
        "process": item.get("process_id"), "exitCode": item.get("exit_code")}


def identity(path, stat):
    return [str(path), stat.st_dev, stat.st_ino, 3]


def resolve_tools(record, state, deadline):
    tracker = record.get("foreground", {})
    pending = sorted(task[5:] for task in state.tasks if task.startswith("tool:"))
    path = Path(tracker.get("transcript") or "")
    if not pending or not path.is_absolute():
        tracker.pop("toolScan", None)
        return
    try:
        stat = path.stat()
        # New completion rows take precedence over a historical backfill. A
        # yielded/in-progress item never resolves a pending shell.
        with path.open("rb") as stream:
            stream.seek(max(0, stat.st_size - BLOCK))
            tail = stream.read(BLOCK)
        tail_seen = set()
        tail_states = {}
        for line in reversed(tail.splitlines()):
            try:
                item = item_state(json.loads(line))
            except (ValueError, TypeError, AttributeError):
                continue
            if not item or item["id"] not in pending or item["id"] in tail_seen:
                continue
            tail_seen.add(item["id"])
            tail_states[item["id"]] = item
            tool = tracker.get("tools", {}).get(item["id"])
            if item["ended"] and (not tool or not tool.get("turn") or tool["turn"] == item["turn"]):
                state.apply({"type": "task.end", "id": "tool:" + item["id"]})
                tracker.get("tools", {}).pop(item["id"], None)
        pending = sorted(task[5:] for task in state.tasks if task.startswith("tool:"))
        if not pending:
            tracker.pop("toolScan", None)
            return
        scan = tracker.setdefault("toolScan", {})
        signature = [identity(path, stat), pending]
        previous = scan.get("signature", [None, []])
        if (previous[0] != signature[0] or not set(pending) <= set(previous[1])
                or scan.get("offset", 0) > stat.st_size):
            scan.clear()
            scan.update(signature=signature, offset=stat.st_size, seen=[], size=stat.st_size, states={})
        elif scan.get("size") != stat.st_size and (scan["offset"] == 0 or set(pending) <= set(scan["seen"])):
            scan.update(offset=stat.st_size, seen=[], size=stat.st_size)
        scan["signature"] = signature  # resolving another tool must not restart old backfill
        seen = set(scan["seen"]) | tail_seen
        scan.setdefault("states", {}).update(tail_states)
        if set(pending) <= seen:
            scan["seen"] = sorted(seen)
            return
        read = 0
        with path.open("rb") as stream:
            while scan["offset"] > 0 and read < PASS_BYTES and time.monotonic() < deadline:
                end = scan["offset"]
                start = max(0, end - PASS_BYTES)
                stream.seek(start)
                raw = stream.read(end - start)
                read += len(raw)
                if start:
                    boundary = raw.find(b"\n")
                    if boundary < 0:
                        scan["offset"] = start
                        continue  # oversized row provides no evidence
                    start += boundary + 1
                    raw = raw[boundary + 1:]
                scan["offset"] = start
                for line in reversed(raw.splitlines()):
                    try:
                        item = item_state(json.loads(line))
                    except (ValueError, TypeError, AttributeError):
                        continue
                    if not item or item["id"] not in pending or item["id"] in seen:
                        continue
                    seen.add(item["id"])
                    scan["states"][item["id"]] = item
                    tool = tracker.get("tools", {}).get(item["id"])
                    if item["ended"] and (not tool or not tool.get("turn") or tool["turn"] == item["turn"]):
                        state.apply({"type": "task.end", "id": "tool:" + item["id"]})
                        tracker.get("tools", {}).pop(item["id"], None)
                if set(pending) <= seen:
                    break
        scan["seen"] = sorted(seen)
    except (OSError, ValueError, TypeError):
        return


def find_child(home, child, parent):
    """Look up one hook-provided UUID in its dated directories, not all history."""
    try:
        parsed = uuid.UUID(child)
        if parsed.version != 7 or str(parsed) != child:
            return None
        date = datetime.datetime.fromtimestamp(int(parsed.hex[:12], 16) / 1000, datetime.timezone.utc)
        matches = []
        for delta in (-1, 0, 1):  # rollout filenames follow the target's timezone
            directory = Path(home) / "sessions" / (date + datetime.timedelta(days=delta)).strftime("%Y/%m/%d")
            for path in directory.glob("rollout-*-" + child + ".jsonl"):
                with path.open("rb") as stream:
                    row = json.loads(stream.readline(BLOCK))
                meta = row.get("payload", {})
                source = meta.get("source", {})
                spawn = source.get("subagent", {}).get("thread_spawn", {}) if isinstance(source, dict) else {}
                if row.get("type") == "session_meta" and meta.get("id") == child and spawn.get("parent_thread_id") == parent:
                    matches.append(str(path))
        return matches[0] if len(matches) == 1 else None
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def child_stopped(path, child, tracker, deadline):
    """An aborted child is stopped only after its complete command ledger is idle."""
    if not isinstance(path, str) or not Path(path).is_absolute():
        return False
    try:
        source = Path(path)
        stat = source.stat()
        scans = tracker.setdefault("childScans", {})
        scan = scans.setdefault(child, {})
        key = identity(source, stat)
        if scan.get("identity") != key or scan.get("offset", 0) > stat.st_size:
            scan.clear()
            scan.update(identity=key, offset=0, pending=[], latest=None, unknown=False, abortSupported=False,
                goalCalls={}, goalPending=False)
        pending = set(scan["pending"])
        read = 0
        with source.open("rb") as stream:
            stream.seek(scan["offset"])
            while stream.tell() < stat.st_size and read < PASS_BYTES and time.monotonic() < deadline:
                position = stream.tell()
                cap = min(MAX_ROW + 1, PASS_BYTES - read + 1)
                line = stream.readline(cap)
                read += len(line)
                if not line.endswith(b"\n"):
                    if cap < MAX_ROW + 1 and len(line) == cap:
                        scan["offset"] = position  # resume this row next pass
                    elif len(line) > MAX_ROW:
                        scan["unknown"] = True
                        scan["offset"] = stream.tell()
                    else:
                        scan["offset"] = position  # retry a partially written row
                    break
                scan["offset"] = stream.tell()
                try:
                    row = json.loads(line)
                    event = row.get("payload", {})
                    if row.get("type") == "session_meta":
                        scan["abortSupported"] = event.get("id") == child and str(event.get("cli_version", "")).startswith(("0.159.", "0.160."))
                    if row.get("type") == "event_msg":
                        if event.get("type") in ("task_started", "task_complete", "turn_aborted"):
                            scan["latest"] = {"type": event["type"], "turn": event.get("turn_id")}
                        item = item_state(row)
                        if item:
                            (pending.discard if item["ended"] else pending.add)(item["id"])
                        elif event.get("type") in ("item_started", "item_completed") and str(event.get("item", {}).get("type", "")).startswith("Collab"):
                            item = event["item"]
                            # 0.160 wait_agent emits an empty-target wait item.
                            # It observes existing work and cannot create a child.
                            if not (item.get("type") == "CollabAgentToolCall"
                                    and item.get("tool") == "wait"
                                    and item.get("receiver_thread_ids") == []
                                    and item.get("agents_states") == {}):
                                scan["unknown"] = True  # nested work needs its own evidence
                    if row.get("type") == "response_item":
                        if event.get("type") == "function_call" and event.get("name", "").removeprefix("functions.") in ("create_goal", "get_goal", "update_goal"):
                            scan["goalCalls"][event.get("call_id")] = True
                            scan["goalPending"] = True
                        elif event.get("type") == "function_call_output" and event.get("call_id") in scan["goalCalls"]:
                            result = event.get("output")
                            if isinstance(result, str):
                                try:
                                    result = json.loads(result)
                                except ValueError:
                                    result = None
                            if isinstance(result, dict) and not result.get("error"):
                                goal = result.get("goal", result)
                                scan["goalPending"] = not (("goal" in result and goal is None)
                                    or (isinstance(goal, dict) and goal.get("status") in ("complete", "completed")))
                            scan["goalCalls"].pop(event.get("call_id"), None)
                except (ValueError, TypeError, AttributeError):
                    scan["unknown"] = True
        scan["pending"] = sorted(pending)
        latest = scan.get("latest") or {}
        return (scan["offset"] == source.stat().st_size and not pending and not scan["unknown"]
                and not scan["goalPending"] and not scan["goalCalls"]
                and latest.get("turn") and (latest.get("type") == "task_complete"
                    or (latest.get("type") == "turn_aborted" and scan["abortSupported"])))
    except (OSError, ValueError, TypeError):
        return False
