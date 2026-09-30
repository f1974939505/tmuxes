"""Foreground completion evidence; no daemon, terminal scraping or agent control.

Hook pairs retain outstanding work. A bounded transcript tail confirms that Stop
actually ended the turn (another Stop hook may instead request continuation).
The transcript is an optional, version-sensitive signal: fail closed on changes.
Only identifiers/status/path metadata are persisted, never prompts/tool output.
"""
import json
from pathlib import Path

TAIL_BYTES = 256 * 1024


def evidence(path):
    """Read bounded, complete rows; never retain conversation/tool text."""
    if not isinstance(path, str) or not Path(path).is_absolute():
        return None
    try:
        with open(path, "rb") as stream:
            stream.seek(0, 2)
            size = stream.tell()
            stream.seek(max(0, size - TAIL_BYTES))
            tail = stream.read(TAIL_BYTES)
            if size > TAIL_BYTES:
                tail = tail.partition(b"\n")[2]  # discard a possibly partial first row
        if not tail.endswith(b"\n"):
            return None  # writer has not finished; retry on the normal refresh
        latest = None
        failed_launches = {}
        current_turn = None
        for line in tail.splitlines():
            row = json.loads(line)
            if row.get("type") == "event_msg":
                event = row.get("payload", {})
                if event.get("type") in ("task_started", "task_complete", "turn_aborted"):
                    latest = event
                    current_turn = event.get("turn_id")
            elif row.get("type") == "response_item":
                item = row.get("payload", {})
                output = item.get("output")
                # Unified exec can fail before spawning a process. Codex then
                # writes a result but emits no PostToolUse. This exact runtime
                # envelope is NOT a background/yielded command's output.
                if (item.get("type") == "function_call_output"
                        and isinstance(output, str)
                        and output.startswith(("exec_command failed: CreateProcess { message:",
                                               "Command blocked by PreToolUse hook:"))):
                    metadata = item.get("internal_chat_message_metadata_passthrough") or {}
                    turn = metadata.get("turn_id") or current_turn
                    if item.get("call_id") and turn:
                        failed_launches[item["call_id"]] = turn
        return {"latest": latest, "failed_launches": failed_launches}
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def completed(path, turn=None):
    observed = evidence(path)
    latest = observed.get("latest") if observed else None
    return bool(latest and latest.get("type") == "task_complete"
                and latest.get("turn_id") and (turn is None or latest["turn_id"] == turn))


def hook(record, state, p):
    event = p.get("hook_event_name")
    tracker = record.setdefault("foreground", {"tracked": False, "children": {}})
    tools = tracker.setdefault("tools", {})
    if isinstance(p.get("transcript_path"), str):
        tracker["transcript"] = p["transcript_path"]
    tool = str(p.get("tool_name", "")).removeprefix("functions.")
    call = p.get("tool_use_id")
    task = "tool:" + str(call)
    if event == "SessionStart":
        if p.get("source") != "compact":
            state.apply({"type": "reset"})
            tracker.update(tracked=True, children={}, tools={})
            record.pop("candidate", None)
            record.pop("turn", None)
    elif event == "UserPromptSubmit":
        state.apply({"type": "start"})
        record["turn"] = p.get("turn_id")
        record.pop("candidate", None)
    elif event == "PreToolUse":
        record.pop("candidate", None)
        state.apply({"type": "activity"})
        if call:
            state.apply({"type": "task.start", "id": task})
            tools[str(call)] = {"name": tool, "turn": p.get("turn_id")}
        else:
            tracker["tracked"] = False
        if tool == "request_user_input":
            state.apply({"type": "decision.open", "id": str(call)})
        if tool in ("create_goal", "get_goal", "update_goal"):
            state.apply({"type": "task.start", "id": "goal"})
    elif event == "PostToolUse":
        if call:
            state.apply({"type": "task.end", "id": task})
            state.apply({"type": "decision.close", "id": str(call)})
            tools.pop(str(call), None)
        if tool in ("create_goal", "get_goal", "update_goal"):
            result = p.get("tool_response")
            if isinstance(result, str):
                try:
                    result = json.loads(result)
                except ValueError:
                    result = None
            if isinstance(result, dict) and not result.get("error"):
                goal = result.get("goal", result)
                status = goal.get("status") if isinstance(goal, dict) else None
                if status in ("complete", "completed") or ("goal" in result and goal is None):
                    state.apply({"type": "task.end", "id": "goal"})
                    state.apply({"type": "decision.close", "id": "goal"})
                elif status in ("blocked", "budgetLimited", "usageLimited"):
                    state.apply({"type": "decision.open", "id": "goal"})
                # Active, paused or unrecognized goals never count as complete.
    elif event == "SubagentStart":
        child = str(p.get("agent_id"))
        tracker["children"].pop(child, None)
        state.apply({"type": "task.start", "id": "child:" + child})
    elif event == "SubagentStop":
        child = str(p.get("agent_id"))
        state.apply({"type": "task.start", "id": "child:" + child})
        tracker["children"][child] = p.get("agent_transcript_path")
        # SubagentStop itself can be blocked by another hook too.
    elif event == "Stop":
        record["candidate"] = p.get("turn_id")
        state.apply({"type": "stop", "known": False, "preserveRequests": True})
    elif event in ("Interrupt", "SessionEnd"):
        record.pop("candidate", None)
        state.apply({"type": "interrupted"})


def inspect(record, state):
    tracker = record.get("foreground", {})
    observed = evidence(tracker.get("transcript"))
    if observed:
        for call, turn in observed["failed_launches"].items():
            tool = tracker.get("tools", {}).get(call)
            if tool and tool.get("name") in ("Bash", "exec_command") and tool.get("turn") == turn:
                state.apply({"type": "task.end", "id": "tool:" + call})
                tracker["tools"].pop(call, None)
    for child, path in tracker.get("children", {}).items():
        if completed(path):
            state.apply({"type": "task.end", "id": "child:" + child})
    candidate = record.get("candidate")
    latest = observed.get("latest") if observed else None
    if (candidate and tracker.get("tracked") and not state.running
            and latest and latest.get("type") == "task_complete" and latest.get("turn_id") == candidate):
        state.apply({"type": "stop", "known": True, "preserveRequests": True})
    return state
