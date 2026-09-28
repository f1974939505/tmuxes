"""Small, fail-open hook sender. Does not persist prompts or tool output."""
import json
import os
import socket
import sys


def send(payload):
    path = os.environ.get("TMUXES_EVENT_SOCKET")
    if not path:
        return
    try:
        data = json.dumps(payload, ensure_ascii=True).encode() + b"\n"
        if len(data) > 1024 * 1024:
            data = b'{"type":"unknown","event":"OversizeHook"}\n'
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            sock.connect(path)
            sock.sendall(data)
    except (OSError, TypeError, ValueError):
        pass


if __name__ == "__main__":
    try:
        payload = json.load(sys.stdin)
        # Retain only metadata needed for status, never transcript/prompt text.
        keys = ("hook_event_name", "session_id", "agent_id", "tool_name",
                "tool_use_id", "notification_type", "background_tasks", "session_crons", "stop_hook_active")
        data = {k: payload[k] for k in keys if k in payload}
        for field in ("background_tasks", "session_crons"):
            if isinstance(data.get(field), list):
                data[field] = [{k: item[k] for k in ("id", "type", "status") if k in item}
                               for item in data[field] if isinstance(item, dict)]
        send({"adapter": "claude", "payload": data})
    except (ValueError, TypeError):
        send({"type": "unknown", "event": "InvalidHookPayload"})
