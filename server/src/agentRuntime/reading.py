"""Bounded, read-only message pagination. Never persist or log conversation text."""
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

PAGE = 50
BUDGET = 8 * 1024 * 1024
ROW_LIMIT = 8 * 1024 * 1024
TEXT_LIMIT = 1024 * 1024


def digest(value):
    return hashlib.sha256(value).hexdigest()


def cursor(stream, source, offset, stat, skip=False):
    stream.seek(max(0, offset - 64))
    data = {"source": source, "offset": offset, "size": stat.st_size,
            "mtime": stat.st_mtime_ns, "anchor": digest(stream.read(min(offset, 64))), "skip": skip}
    return base64.urlsafe_b64encode(json.dumps(data, separators=(",", ":")).encode()).decode().rstrip("=")


def decode(raw):
    try:
        if len(raw) > 2048:
            return None
        data = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
        if (not isinstance(data, dict) or type(data.get("offset")) is not int or data["offset"] < 0
                or type(data.get("size")) is not int or type(data.get("mtime")) is not int):
            return None
        return data
    except (ValueError, TypeError):
        return None


def message(line, offset, kind, sid):
    if len(line) > ROW_LIMIT:
        return None
    try:
        row = json.loads(line)
        if kind == "codex":
            item = row.get("payload", {})
            if row.get("type") != "response_item" or item.get("type") != "message":
                return None
        else:
            if row.get("type") not in ("user", "assistant") or row.get("sessionId") != sid or row.get("isCompactSummary") or row.get("isSidechain"):
                return None
            item = row.get("message", {})
        role, content = item.get("role"), item.get("content")
        if role not in ("user", "assistant"):
            return None
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            text = "\n\n".join(x["text"] for x in content if isinstance(x, dict)
                and x.get("type") in ("text", "input_text", "output_text") and isinstance(x.get("text"), str))
        else:
            return None
        if not text.strip():
            return None
        # Source offsets are stable even when providers omit or reuse ids.
        result = {"id": str(row.get("uuid") or item.get("id") or offset), "role": role, "markdown": text[:256 * 1024],
                  "_start": offset, "_end": offset + len(line)}
        if len(text) > 256 * 1024:
            result["truncated"] = True
        return result
    except (ValueError, TypeError, AttributeError):
        return None


def page(stream, stat, source, kind, sid, raw="", direction="newer"):
    token = decode(raw) if raw else None
    reset = bool(raw and (not token or token.get("source") != source or token["offset"] > stat.st_size
                or stat.st_size < token["size"] or (stat.st_size == token["size"] and stat.st_mtime_ns != token["mtime"])))
    if token and not reset:
        stream.seek(max(0, token["offset"] - 64))
        reset = digest(stream.read(min(token["offset"], 64))) != token.get("anchor")
    if reset:
        token = None
    messages, used, limited = [], 0, False
    deadline = time.monotonic() + 0.25
    backwards = token is None or direction == "older"
    if backwards:
        end = token["offset"] if token else stat.st_size
        start = max(0, end - BUDGET)
        stream.seek(start)
        data = stream.read(end - start)
        lines = data.splitlines(keepends=True)
        offsets, pos = [], start
        for line in lines:
            offsets.append(pos)
            pos += len(line)
        last_complete = data.rfind(b"\n") + 1
        after = start + last_complete if last_complete else (0 if start == 0 else end)
        skip = not last_complete and start > 0
        before = after
        first = 1 if start else 0
        for i in range(len(lines) - 1, first - 1, -1):
            if not lines[i].endswith(b"\n"):
                continue
            item = message(lines[i], offsets[i], kind, sid)
            if item and used + len(item["markdown"].encode()) > TEXT_LIMIT:
                limited = True
                break
            before = offsets[i]
            if item:
                used += len(item["markdown"].encode())
                messages.append(item)
            if len(messages) >= PAGE or time.monotonic() > deadline:
                break
        else:
            before = offsets[first] if first < len(offsets) else start
        messages.reverse()
        limited = limited or (before > 0 and len(messages) < PAGE)
    else:
        after = token["offset"]
        before = after
        skip = token.get("skip") is True
        stream.seek(after)
        buffer, row_start, read_bytes, position = b"", after, 0, after
        while read_bytes < BUDGET and len(messages) < PAGE and time.monotonic() <= deadline:
            block = stream.read(min(256 * 1024, BUDGET - read_bytes))
            if not block:
                break
            read_bytes += len(block)
            for part in block.splitlines(keepends=True):
                position += len(part)
                if not skip:
                    buffer += part
                    if len(buffer) >= ROW_LIMIT:
                        buffer, skip = b"", True
                if part.endswith(b"\n"):
                    item = None if skip else message(buffer, row_start, kind, sid)
                    next_offset = position
                    if item and used + len(item["markdown"].encode()) > TEXT_LIMIT:
                        limited = True
                        break
                    after = next_offset
                    row_start, buffer, skip = after, b"", False
                    if item:
                        used += len(item["markdown"].encode())
                        messages.append(item)
                    if len(messages) >= PAGE:
                        break
                elif skip:
                    after = position
                    row_start = after
            if len(messages) >= PAGE or limited:
                break
        limited = limited or stream.tell() < stat.st_size
    for item in messages:
        begin, end = item.pop("_start"), item.pop("_end")
        item["before"] = cursor(stream, source, begin, stat) if begin > 0 else None
        item["after"] = cursor(stream, source, end, stat)
    return {"availability": "ready", "source": source, "messages": messages, "reset": reset,
            "before": cursor(stream, source, before, stat) if before > 0 else None,
            "after": cursor(stream, source, after, stat, skip), "limited": limited}


def read(session, raw="", direction="newer"):
    from native import STORE, alive, command
    empty = {"availability": "unavailable", "source": None, "messages": []}
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", session) or direction not in ("newer", "older"):
        return empty
    try:
        pane, socket, name = command(["tmux", "display-message", "-p", "-t", session,
                                      "#{pane_id}|#{socket_path}|#{session_name}"]).split("|", 2)
        candidates = []
        paths = sorted(STORE.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:64]
        for path in paths:
            try:
                record = json.loads(path.read_text())
                bound = record.get("binding", {})
                if (record.get("kind") not in ("codex", "claude") or bound.get("pane") != pane
                        or bound.get("socket") != socket or not alive(bound)):
                    continue
                if record["kind"] == "codex" and bound.get("proof") not in ("foreground-codex-v1", "foreground-direct-v1"):
                    continue
                candidates.append(record)
            except (OSError, ValueError, TypeError):
                continue
        if not candidates or name != session:
            return empty
        record = max(candidates, key=lambda r: r["since"])
        if record.get("state", {}).get("event") == "SessionEnd":
            return empty
        reading = record.get("reading", {})
        path = Path(reading.get("transcript") or record.get("foreground", {}).get("transcript") or "")
        if not path.is_absolute():
            return empty
        with path.open("rb") as stream:
            import os
            stat = os.fstat(stream.fileno())
            header = stream.readline(64 * 1024)
            kind, sid = record["kind"], record["id"]
            if kind == "codex":
                meta = json.loads(header).get("payload", {})
                if (meta.get("id") != sid or not str(meta.get("cli_version", "")).startswith("0.160.")):
                    return {**empty, "availability": "unsupported"}
            else:
                stream.seek(0)
                sample = stream.read(64 * 1024)
                valid = False
                for line in sample.splitlines():
                    try:
                        row = json.loads(line)
                        valid = valid or (row.get("sessionId") == sid and row.get("type") in ("user", "assistant")
                                          and isinstance(row.get("message"), dict))
                    except (ValueError, TypeError):
                        pass
                if not valid:
                    return {**empty, "availability": "unsupported"}
            source = digest(json.dumps([record["key"], record["binding"], str(path), stat.st_dev, stat.st_ino,
                                        digest(header)] , sort_keys=True).encode())
            result = page(stream, stat, source, kind, sid, raw, direction)
            final = os.fstat(stream.fileno())
            current_file = path.stat()
            if (final.st_size < stat.st_size or (final.st_size == stat.st_size and final.st_mtime_ns != stat.st_mtime_ns)
                    or (current_file.st_dev, current_file.st_ino) != (stat.st_dev, stat.st_ino)):
                return empty
            if not alive(record["binding"]) or command(["tmux", "display-message", "-p", "-t", session, "#{pane_id}"]) != pane:
                return empty
            # /new or /resume can replace the record without changing the TUI
            # process or pane. Recheck the current owner before releasing text.
            latest = []
            for candidate in sorted(STORE.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:64]:
                try:
                    item = json.loads(candidate.read_text())
                    if item.get("binding") == record["binding"]:
                        latest.append(item)
                except (OSError, ValueError, TypeError):
                    continue
            owner = max(latest, key=lambda r: r["since"]) if latest else {}
            if (owner.get("key") != record["key"] or owner.get("since") != record["since"]
                    or owner.get("reading", {}) != record.get("reading", {})
                    or owner.get("state", {}).get("event") == "SessionEnd"):
                return empty
            result["cwd"] = reading.get("cwd") or (meta.get("cwd", "") if kind == "codex" else "")
            return result
    except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError):
        return empty
