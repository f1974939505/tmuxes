"""Foreground completion evidence; no daemon, terminal scraping or agent control.

Hook pairs retain outstanding work. A bounded transcript tail confirms that Stop
actually ended the turn (another Stop hook may instead request continuation).
The transcript is an optional, version-sensitive signal: fail closed on changes.
Only identifiers/status/path metadata are persisted, never prompts/tool output.
"""
import json
from pathlib import Path

TAIL_BYTES = 256 * 1024


def completed(path, turn=None):
    if not isinstance(path, str) or not Path(path).is_absolute():
        return False
    try:
        with open(path, "rb") as stream:
            stream.seek(0, 2)
            size = stream.tell()
            stream.seek(max(0, size - TAIL_BYTES))
            if size > TAIL_BYTES:
                stream.readline()  # discard a possibly partial first row
            tail = stream.read(TAIL_BYTES)
        if not tail.endswith(b"\n"):
            return False  # writer has not finished; retry on the normal refresh
        latest = None
        for line in tail.splitlines():
            row = json.loads(line)
            if row.get("type") == "event_msg":
                event = row.get("payload", {})
                if event.get("type") in ("task_started", "task_complete", "turn_aborted"):
                    latest = event
        return bool(latest and latest.get("type") == "task_complete"
                    and latest.get("turn_id") and (turn is None or latest["turn_id"] == turn))
    except (OSError, ValueError, TypeError, AttributeError):
        return False


def hook(record, state, p):
    event = p.get("hook_event_name")
    tracker = record.setdefault("foreground", {"tracked": False, "children": {}})
    if isinstance(p.get("transcript_path"), str):
        tracker["transcript"] = p["transcript_path"]
    tool = str(p.get("tool_name", "")).removeprefix("functions.")
    call = p.get("tool_use_id")
    task = "tool:" + str(call)
    if event == "SessionStart":
        if p.get("source") != "compact":
            state.apply({"type": "reset"})
            tracker.update(tracked=True, children={})
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
    for child, path in tracker.get("children", {}).items():
        if completed(path):
            state.apply({"type": "task.end", "id": "child:" + child})
    candidate = record.get("candidate")
    if (candidate and tracker.get("tracked") and not state.running
            and completed(tracker.get("transcript"), candidate)):
        state.apply({"type": "stop", "known": True, "preserveRequests": True})
    return state
