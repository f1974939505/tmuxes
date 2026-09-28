"""tmuxes observer: no tools, prompts, policy decisions, or network access."""
import json
import os
import socket
import threading
from pathlib import Path


def register(ctx):
    if os.environ.get("TMUXES_HERMES_PLUGIN") != Path(__file__).parent.name:
        return
    path = os.environ.get("TMUXES_EVENT_SOCKET")
    if not path:
        return
    root = [None]
    children = set()
    lock = threading.RLock()

    def emit(kind, **data):
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
                sock.settimeout(0.5)
                sock.connect(path)
                sock.sendall((json.dumps({"type": kind, "event": "HermesPlugin", **data}) + "\n").encode())
        except OSError:
            pass

    def start(session_id=None, parent_session_id=None, **kwargs):
        if parent_session_id:
            return
        root[0] = session_id
        emit("start")

    def child_start(child_session_id=None, **kwargs):
        with lock:
            children.add(str(child_session_id))
        emit("task.start", id="child:" + str(child_session_id))

    def child_stop(child_session_id=None, **kwargs):
        with lock:
            children.discard(str(child_session_id))
        emit("task.end", id="child:" + str(child_session_id))

    def end(session_id=None, completed=False, interrupted=False, **kwargs):
        if session_id != root[0]:
            return
        if interrupted:
            emit("interrupted")
        elif not completed:
            emit("error")
        else:
            # A read-only, in-process count. Never poll/consume process results:
            # doing that can suppress Hermes' own background wakeups.
            known = False
            count = 0
            try:
                from tools.process_registry import process_registry
                count = process_registry.count_running()
                known = isinstance(count, int) and count >= 0
            except (ImportError, AttributeError, TypeError):
                pass
            with lock:
                ids = ["child:" + x for x in children]
            ids += ["process:" + str(i) for i in range(count)]
            emit("tasks", ids=ids, known=known)
            emit("stop", known=known)

    def request(surface=None, tool_call_id=None, pattern_key=None, session_key=None, **kwargs):
        if surface == "smart":
            return
        if surface == "cli":
            emit("decision.open", id=str(tool_call_id or (str(session_key) + ':' + str(pattern_key))))

    def resolved(surface=None, tool_call_id=None, pattern_key=None, session_key=None, **kwargs):
        if surface == "cli":
            emit("decision.close", id=str(tool_call_id or (str(session_key) + ':' + str(pattern_key))))

    def pre_tool(tool_name=None, session_id=None, tool_call_id=None, **kwargs):
        if session_id == root[0]:
            emit("activity")
        if tool_name == "clarify":
            emit("decision.open", id=str(tool_call_id or "clarify"))

    def post_tool(tool_name=None, tool_call_id=None, **kwargs):
        if tool_name == "clarify":
            emit("decision.close", id=str(tool_call_id or "clarify"))

    for name, callback in (("pre_llm_call", start), ("on_session_end", end),
                           ("subagent_start", child_start), ("subagent_stop", child_stop),
                           ("pre_approval_request", request), ("post_approval_response", resolved),
                           ("pre_tool_call", pre_tool), ("post_tool_call", post_tool)):
        ctx.register_hook(name, callback)
