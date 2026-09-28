"""Passive native events: bounded metadata files, no agent control or proxy.

Hooks only write observations. Snapshot reads happen during tmuxes' existing
refresh, on the target host. Missing capabilities never imply completion.
"""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import time

from claude import Claude
from state import State
from websocket import WebSocket

KINDS = ("claude", "codex", "opencode", "hermes")
STORE = Path.home() / ".cache/tmuxes/observations"
LIMIT = 256 * 1024
KEYS = ("hook_event_name", "session_id", "agent_id", "source", "turn_id",
        "tool_name", "tool_use_id", "notification_type", "stop_hook_active",
        "background_tasks", "session_crons")


def clean(payload):
    data = {k: payload[k] for k in KEYS if k in payload}
    for field in ("background_tasks", "session_crons"):
        if isinstance(data.get(field), list):
            data[field] = [{k: item[k] for k in ("id", "type", "status") if k in item}
                           for item in data[field] if isinstance(item, dict)]
    return data


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as f:
        json.dump(data, f, ensure_ascii=True)
    os.replace(f.name, path)


def key_for(kind, sid, scope):
    return hashlib.sha256(json.dumps([kind, sid, scope]).encode()).hexdigest()


@contextlib.contextmanager
def locked():
    import fcntl
    STORE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STORE / ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def command(argv):
    return subprocess.check_output(argv, text=True, stderr=subprocess.DEVNULL, timeout=2).strip()


def process(pid):
    try:
        fields = command(["ps", "-o", "ppid=", "-o", "lstart=", "-p", str(int(pid))]).split(None, 1)
        return int(fields[0]), fields[1]
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        return None


def binding():
    """Require real process ancestry; inherited daemon TMUX_PANE is not proof."""
    pane, tmux_env = os.environ.get("TMUX_PANE", ""), os.environ.get("TMUX", "")
    if not re.fullmatch(r"%\d+", pane) or not tmux_env:
        return None
    sock = tmux_env.rsplit(",", 2)[0]
    try:
        shell_pid = int(command(["tmux", "-S", sock, "display-message", "-p", "-t", pane, "#{pane_pid}"]))
        pid = os.getppid()
        for _ in range(32):
            info = process(pid)
            if not info or pid <= 1:
                break
            parent, stamp = info
            if parent == shell_pid or pid == shell_pid:
                return {"socket": sock, "pane": pane, "pid": pid, "stamp": stamp}
            pid = parent
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return None


def alive(bound):
    info = process(bound.get("pid", 0)) if bound else None
    return bool(info and info[1] == bound.get("stamp"))


def restore(data):
    state = State(time.time)
    for field in ("running", "error", "known", "complete_at", "event", "revision"):
        if field in data:
            setattr(state, field, data[field])
    state.tasks = set(data.get("tasks", []))
    state.requests = set(data.get("requests", []))
    return state


def save_state(state):
    return {k: sorted(v) if isinstance(v, set) else v for k, v in vars(state).items() if k != "clock"}


def report(kind, payload):
    if kind not in KINDS or not isinstance(payload, dict):
        return
    sid = payload.get("session_id")
    if not isinstance(sid, str) or not sid or len(sid) > 256:
        return
    if payload.get("agent_id") and payload.get("hook_event_name") not in ("SubagentStart", "SubagentStop"):
        return
    scope = str(Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))).resolve()) if kind == "codex" else ""
    key = key_for(kind, sid, scope)
    path = STORE / (key + ".json")
    bound = binding()
    with locked():
        record = json.loads(path.read_text()) if path.exists() else {
            "key": key, "kind": kind, "id": sid, "scope": scope, "since": time.time(), "state": {}}
        state = restore(record["state"])
        event = payload.get("hook_event_name")
        starting = event == "SessionStart" or payload.get("type") == "start"
        if bound and (not record.get("binding") or starting or event == "UserPromptSubmit"):
            record["binding"] = bound
        if starting:
            record["since"] = time.time()
            if not bound:
                record.pop("binding", None)
        if kind == "claude":
            observer = Claude(state.apply)
            observer.root = None if event == "SessionStart" else sid
            if event == "SessionStart":
                state.apply({"type": "reset"})
            observer.children = {x[6:] for x in state.tasks if x.startswith("child:")}
            observer.handle(clean(payload))
        elif kind == "codex":
            if event == "SessionStart":
                state.apply({"type": "reset"})
                record.pop("candidate", None)
                record.pop("turn", None)
            elif event == "UserPromptSubmit":
                state.apply({"type": "start"})
                record["turn"] = payload.get("turn_id")
                record.pop("candidate", None)
            elif event == "PreToolUse":
                state.apply({"type": "activity"})
                if payload.get("tool_name") == "request_user_input":
                    state.apply({"type": "decision.open", "id": str(payload.get("tool_use_id"))})
            elif event == "PostToolUse":
                state.apply({"type": "decision.close", "id": str(payload.get("tool_use_id"))})
            elif event == "Stop":
                record["candidate"] = payload.get("turn_id")
                state.apply({"type": "stop", "known": False})
            elif event in ("Interrupt", "SessionEnd"):
                record.pop("candidate", None)
                state.apply({"type": "interrupted"})
            elif event in ("SubagentStart", "SubagentStop"):
                state.apply({"type": "task.start" if event == "SubagentStart" else "task.end",
                             "id": "child:" + str(payload.get("agent_id"))})
        else:
            # In-process native plugins have already normalized their events.
            data = {k: payload[k] for k in ("type", "id", "ids", "known", "willRetry") if k in payload}
            data["event"] = "NativePlugin"
            state.apply(data)
        record["state"], record["updated"] = save_state(state), time.time()
        atomic(path, record)


class ReadOnlyCodex:
    """Connect only to an existing daemon. No start/resume/approval operations."""
    METHODS = {"thread/read", "thread/turns/list", "thread/goal/get",
               "thread/list", "thread/backgroundTerminals/list"}

    def __init__(self, home, deadline=None):
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.ws = WebSocket(sock, client=True)
        self.counter = 0
        self.deadline = deadline or time.monotonic() + 3
        try:
            sock.settimeout(0.5)
            sock.connect(str(Path(home) / "app-server-control/app-server-control.sock"))
            self.ws.handshake(timeout=0.5)
            sock.settimeout(0.5)
            self._request("initialize", {"clientInfo": {"name": "tmuxes-observer", "version": "1"},
                                         "capabilities": {"experimentalApi": True}})
            self.ws.send({"method": "initialized", "params": {}})
        except Exception:
            self.close()
            raise

    def _request(self, method, params):
        if time.monotonic() >= self.deadline:
            raise ValueError("Observation budget exceeded")
        self.counter += 1
        key = "observe-" + str(self.counter)
        self.ws.send({"id": key, "method": method, "params": params})
        for _ in range(100):
            msg = self.ws.receive()
            if msg.get("id") == key and not msg.get("method"):
                if "error" in msg or not isinstance(msg.get("result"), dict):
                    raise ValueError("Read-only method unavailable")
                return msg["result"]
        raise ValueError("No bounded read response")

    def request(self, method, params):
        if method not in self.METHODS:
            raise ValueError("Not a read-only method")
        return self._request(method, params)

    def close(self):
        self.ws.close()
        self.ws.file.close()


def inspect_codex(record, client):
    state = restore(record["state"])
    tid = record["id"]
    thread = client.request("thread/read", {"threadId": tid})["thread"]
    status = thread.get("status", {})
    if status.get("type") == "active":
        state.apply({"type": "start"})
        if "waitingOnUserInput" in status.get("activeFlags", []):
            state.apply({"type": "decision.open", "id": "runtime"})
        elif "waitingOnApproval" in status.get("activeFlags", []):
            # Runtime flags do not identify the reviewer. Automatic review can
            # last many seconds: debounce alone cannot prove a human is needed.
            state.apply({"type": "unknown"})
    elif status.get("type") == "systemError":
        state.apply({"type": "error"})
    elif status.get("type") == "idle":
        if not record.get("turn") and not record.get("candidate"):
            state.apply({"type": "reset"})
            return state
        turns = client.request("thread/turns/list", {"threadId": tid, "limit": 1, "sortDirection": "desc", "itemsView": "notLoaded"})["data"]
        latest = turns[0] if turns else {}
        if latest.get("id") == record.get("turn") and latest.get("status") == "failed":
            state.apply({"type": "error"})
        elif record.get("candidate") and latest.get("id") == record["candidate"] and latest.get("status") == "completed":
            goal = client.request("thread/goal/get", {"threadId": tid})["goal"]
            children = client.request("thread/list", {"ancestorThreadId": tid, "limit": 100,
                                                      "sourceKinds": ["subAgent", "subAgentReview", "subAgentCompact",
                                                                      "subAgentThreadSpawn", "subAgentOther"]})
            if children.get("nextCursor"):
                raise ValueError("Incomplete descendants")
            tasks = []
            for child in children["data"]:
                if child.get("status", {}).get("type") == "active":
                    tasks.append("child:" + child["id"])
                elif child.get("status", {}).get("type") not in ("idle", "notLoaded"):
                    raise ValueError("Unknown child state")
            for node in [thread] + children["data"]:
                terms = client.request("thread/backgroundTerminals/list", {"threadId": node["id"], "limit": 100})
                if terms.get("nextCursor"):
                    raise ValueError("Incomplete background terminals")
                tasks += ["terminal:" + node["id"] + ":" + str(p["processId"]) for p in terms["data"]]
            if goal and goal.get("status") not in ("active", "complete", "completed", "paused", "blocked", "budgetLimited", "usageLimited"):
                raise ValueError("Unknown goal state")
            if goal and goal.get("status") == "active":
                tasks.append("goal")
            if goal and goal.get("status") == "paused":
                raise ValueError("Paused goal is not completion")
            check = client.request("thread/read", {"threadId": tid})["thread"]
            if check.get("status", {}).get("type") != "idle":
                raise ValueError("Root changed during observation")
            state.apply({"type": "tasks", "ids": tasks, "known": True})
            state.apply({"type": "stop", "known": True})
            if goal and goal.get("status") in ("blocked", "budgetLimited", "usageLimited"):
                state.apply({"type": "decision.open", "id": "goal"})
        else:
            state.apply({"type": "unknown"})
    else:
        state.apply({"type": "unknown"})
    return state


def snapshot():
    sessions = []
    fmt = "#{session_windows}|#{session_attached}|#{session_created}|#{session_activity}|#{@tmuxes_agent}|#{session_name}"
    result = subprocess.run(["tmux", "list-sessions", "-F", fmt], capture_output=True, text=True, timeout=3)
    if result.returncode:
        if any(x in result.stderr for x in ("no server running", "no sessions", "error connecting")):
            return {"raw": "", "observers": []}
        raise ValueError(result.stderr.strip())
    panes = {}
    for row in command(["tmux", "list-panes", "-a", "-F", "#{pane_id}|#{socket_path}|#{session_name}"]).splitlines():
        pane, sock, name = row.split("|", 2)
        panes[(sock, pane)] = name
    records = []
    clients = {}
    deadline = time.monotonic() + 3
    try:
        paths = sorted(STORE.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        incomplete = len(paths) > 64
        for path in paths[:64]:
            try:
                record = json.loads(path.read_text())
                if time.time() - record.get("updated", 0) > 86400:
                    continue
                state = restore(record["state"])
                capability = "events"
                if record["kind"] == "codex":
                    try:
                        home = record["scope"]
                        if home not in clients:
                            clients[home] = None
                            clients[home] = ReadOnlyCodex(home, deadline)
                        if clients[home] is None:
                            raise ValueError("Daemon unavailable")
                        state = inspect_codex(record, clients[home])
                        capability = "read-only runtime"
                    except (OSError, ValueError, KeyError, TypeError, EOFError):
                        state.apply({"type": "reset"})
                        capability = "limited"
                bound = record.get("binding")
                session = panes.get((bound["socket"], bound["pane"])) if bound and alive(bound) else None
                phase, reason = state.snapshot()
                # Read verification must be stable across two refreshes before
                # announcing success; no process is kept alive just to settle.
                if phase == "settling" and record["kind"] == "codex":
                    marker = str(record.get("candidate"))
                    settled = record.get("verified")
                    if settled and settled.get("turn") == marker and time.time() - settled["at"] >= 1.5:
                        phase, reason = "idle", "done"
                    elif not settled or settled.get("turn") != marker:
                        record["verified"] = {"turn": marker, "at": time.time()}
                else:
                    record.pop("verified", None)
                if bound and not session:
                    phase, reason = "unknown", ""
                if incomplete and phase in ("idle", "settling"):
                    phase, reason, capability = "unknown", "", "limited"
                records.append({"key": record["key"], "kind": record["kind"], "id": record["id"],
                                "state": phase, "reason": reason, "session": session,
                                "since": record["since"], "updated": record["updated"],
                                "capability": capability, "bindingKey":
                                json.dumps(bound, sort_keys=True) if session else None})
                # Only verification metadata is written, and never over a newer event.
                with locked():
                    latest = json.loads(path.read_text())
                    if latest.get("updated") == record.get("updated"):
                        if "verified" in record:
                            latest["verified"] = record["verified"]
                        else:
                            latest.pop("verified", None)
                        atomic(path, latest)
                    else:
                        records[-1].update(state="unknown", reason="", capability="limited")
            except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
                continue
    finally:
        for client in clients.values():
            if client:
                client.close()
    # /resume and /new may leave old records for the same still-live TUI. Only
    # the latest session binding on that process can own a pane's badge.
    newest = {}
    for record in records:
        key = record.get("bindingKey")
        if key and (key not in newest or record["since"] > newest[key]["since"]):
            newest[key] = record
    records = [r for r in records if not r.get("bindingKey") or newest[r["bindingKey"]] is r]
    for record in records:
        record.pop("bindingKey", None)
    return {"raw": result.stdout, "observers": records}


def bind_record(key, session):
    if not re.fullmatch(r"[0-9a-f]{64}", key):
        raise ValueError("Invalid observation key")
    path = STORE / (key + ".json")
    record = json.loads(path.read_text())
    pane, sock, pid = command(["tmux", "display-message", "-p", "-t", session,
                              "#{pane_id}|#{socket_path}|#{pane_pid}"]).split("|", 2)
    rows = [row.split(None, 2) for row in command(["ps", "-eo", "pid=,ppid=,comm="]).splitlines()]
    descendants = {int(pid)}
    candidates = []
    for _ in range(8):
        children = {int(row[0]) for row in rows if len(row) == 3 and int(row[1]) in descendants}
        for row in rows:
            if len(row) == 3 and int(row[0]) in descendants | children and Path(row[2]).name == record["kind"]:
                candidates.append(int(row[0]))
        if candidates:
            break
        descendants |= children
    if len(set(candidates)) != 1:
        raise ValueError("Cannot identify one matching agent process in the active pane")
    owner = candidates[0]
    info = process(owner)
    if not info:
        raise ValueError("Agent process exited")
    with locked():
        record = json.loads(path.read_text())
        record["binding"] = {"socket": sock, "pane": pane, "pid": owner, "stamp": info[1]}
        record["since"] = time.time()
        atomic(path, record)
    print(json.dumps({"ok": True}))


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "snapshot":
        print("TMUXES_NATIVE_V1=" + json.dumps(snapshot(), ensure_ascii=True))
        return
    if len(sys.argv) == 4 and sys.argv[1] == "bind":
        bind_record(sys.argv[2], sys.argv[3])
        return
    # Hook failures are intentionally invisible to the agent. Never print
    # decisions, instructions, prompts or tool results.
    try:
        data = sys.stdin.buffer.read(LIMIT + 1)
        if len(data) <= LIMIT:
            report(sys.argv[1], json.loads(data))
    except Exception:
        pass
    if len(sys.argv) > 1 and sys.argv[1] == "codex":
        print("{}")


if __name__ == "__main__":
    main()
