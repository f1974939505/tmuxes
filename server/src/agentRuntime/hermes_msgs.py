"""Hermes transcript reader for tmuxes (read-only SQLite, bounded pages).

Hermes agent hooks run in the gateway daemon, which carries no tmux
environment, so transcripts are read from ~/.hermes/state.db by session id
rather than from a JSONL path. Nothing here writes to the database or logs
conversation text.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sqlite3
from pathlib import Path

PAGE = 50
TEXT_LIMIT = 1024 * 1024
DB = Path(os.environ.get("HERMES_HOME") or (Path.home() / ".hermes")) / "state.db"


def _conn() -> sqlite3.Connection:
    return sqlite3.connect("file:%s?mode=ro" % DB, uri=True, timeout=2.0)


def session_meta(sid: str) -> dict:
    """cwd + start time for one Hermes session; {} when unknown."""
    try:
        con = _conn()
        try:
            row = con.execute("select cwd, started_at from sessions where id=?", (sid,)).fetchone()
        finally:
            con.close()
        if not row:
            return {}
        return {"cwd": row[0] or "", "started_at": float(row[1] or 0)}
    except (sqlite3.Error, OSError, ValueError, TypeError):
        return {}


def _text(content: str) -> str:
    """Flatten a Hermes message payload (JSON parts or plain text)."""
    try:
        data = json.loads(content)
    except (ValueError, TypeError):
        return content or ""
    if isinstance(data, str):
        return data
    if isinstance(data, list):
        parts = [x if isinstance(x, str) else x.get("text", "") for x in data if isinstance(x, (str, dict))]
        return "\n\n".join(p for p in parts if isinstance(p, str) and p.strip())
    if isinstance(data, dict):
        text = data.get("text")
        return text if isinstance(text, str) else ""
    return ""


def _encode(value: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).decode().rstrip("=")


def _decode(raw: str):
    try:
        if len(raw) > 2048:
            return None
        data = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
        if not isinstance(data, dict) or type(data.get("id")) is not int:
            return None
        return data
    except (ValueError, TypeError):
        return None


def _cursor(source: str, row_id: int) -> str:
    return _encode({"source": source, "id": row_id})


def page(sid: str, raw: str = "", direction: str = "newer") -> dict:
    """One bounded page of user/assistant messages, newest first by default."""
    source = "hermes-db:" + hashlib.sha256(sid.encode()).hexdigest()[:16]
    result = {"availability": "ready", "source": source, "messages": [],
              "reset": False, "before": None, "after": None, "limited": False, "oversized": False}
    token = _decode(raw) if raw else None
    reset = bool(raw and (not token or token.get("source") != source))
    if reset:
        token = None
    try:
        con = _conn()
        try:
            if token is None:
                rows = con.execute(
                    "select id, role, content from messages where session_id=? and role in ('user','assistant') "
                    "order by id desc limit ?", (sid, PAGE)).fetchall()
                rows.reverse()
            elif direction == "older":
                rows = con.execute(
                    "select id, role, content from messages where session_id=? and role in ('user','assistant') "
                    "and id < ? order by id desc limit ?", (sid, token["id"], PAGE)).fetchall()
                rows.reverse()
            else:
                rows = con.execute(
                    "select id, role, content from messages where session_id=? and role in ('user','assistant') "
                    "and id > ? order by id asc limit ?", (sid, token["id"], PAGE)).fetchall()
        finally:
            con.close()
    except (sqlite3.Error, OSError) as error:
        return {"availability": "unavailable", "source": None, "messages": [],
                "reset": False, "before": None, "after": None, "limited": False,
                "oversized": False, "error": str(error)[:200]}
    used = 0
    messages = []
    for row_id, role, content in rows:
        text = _text(content)
        if not text.strip():
            continue
        if messages and used + len(text.encode()) > TEXT_LIMIT:
            result["limited"] = True
            break
        used += len(text.encode())
        messages.append({"id": str(row_id), "role": role, "markdown": text,
                         "before": _cursor(source, row_id), "after": _cursor(source, row_id)})
    result["messages"] = messages
    if messages:
        result["before"] = _cursor(source, int(messages[0]["id"]))
        result["after"] = _cursor(source, int(messages[-1]["id"]))
    result["reset"] = reset
    return result
