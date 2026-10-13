import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "agentRuntime"))
import reading
import native


def codex(text, role="assistant", ident=None):
    return {"type": "response_item", "payload": {"type": "message", "role": role,
        "id": ident, "content": [{"type": "output_text" if role == "assistant" else "input_text", "text": text}]}}


class ReadingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "transcript.jsonl"

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, rows):
        self.path.write_bytes(b"".join(json.dumps(r).encode() + b"\n" for r in rows))

    def page(self, cursor="", direction="newer", kind="codex"):
        with self.path.open("rb") as stream:
            return reading.page(stream, os.fstat(stream.fileno()), "source", kind, "sid", cursor, direction)

    def test_recent_older_then_incremental_are_disjoint(self):
        self.write([codex(str(i)) for i in range(100)])
        latest = self.page()
        self.assertEqual([m["markdown"] for m in latest["messages"]], [str(i) for i in range(50, 100)])
        older = self.page(latest["before"], "older")
        self.assertEqual([m["markdown"] for m in older["messages"]], [str(i) for i in range(50)])
        self.assertIsNone(older["before"])
        self.assertEqual(self.page(latest["after"])["messages"], [])
        with self.path.open("ab") as f:
            f.write(json.dumps(codex("new")).encode() + b"\n")
        self.assertEqual(self.page(latest["after"])["messages"][0]["markdown"], "new")

    def test_partial_rows_wait_for_newline_without_replaying_history(self):
        self.write([codex("first")])
        token = self.page()["after"]
        body = json.dumps(codex("second")).encode()
        with self.path.open("ab") as f:
            f.write(body[:50])
        pending = self.page(token)
        self.assertEqual(pending["messages"], [])
        with self.path.open("ab") as f:
            f.write(body[50:] + b"\n")
        final = self.page(pending["after"])
        self.assertEqual([m["markdown"] for m in final["messages"]], ["second"])

    def test_huge_tool_row_is_skipped_across_multiple_requests(self):
        self.write([codex("first")])
        token = self.page()["after"]
        with self.path.open("ab") as f:
            f.write(b'{"type":"tool","content":"' + b"x" * (10 * 1024 * 1024))
        pending = self.page(token)
        self.assertTrue(reading.decode(pending["after"])["skip"])
        next_page = self.page(pending["after"])
        self.assertGreater(reading.decode(next_page["after"])["offset"], reading.decode(pending["after"])["offset"])
        with self.path.open("ab") as f:
            f.write(b'"}\n' + json.dumps(codex("after huge tool")).encode() + b"\n")
        final = self.page(next_page["after"])
        self.assertEqual([m["markdown"] for m in final["messages"]], ["after huge tool"])

    def test_same_size_rewrite_and_foreign_cursors_reset(self):
        self.write([codex("old")])
        token = self.page()["after"]
        self.write([codex("new")])
        result = self.page(token)
        self.assertTrue(result["reset"])
        self.assertEqual(result["messages"][0]["markdown"], "new")
        self.assertTrue(self.page("not-a-cursor")["reset"])

    def test_only_conversation_text_survives(self):
        self.write([codex("developer secret", "developer"),
                    {"type": "event_msg", "payload": {"type": "agent_message", "message": "duplicate"}},
                    {"type": "response_item", "payload": {"type": "reasoning", "text": "thought"}},
                    codex("$x^2$", ident="m1")])
        result = self.page()
        self.assertEqual([{k: m[k] for k in ("id", "role", "markdown")} for m in result["messages"]],
                         [{"id": "m1", "role": "assistant", "markdown": "$x^2$"}])
        self.assertEqual(reading.decode(result["messages"][0]["after"])["offset"], self.path.stat().st_size)

    def test_claude_filters_sidechains_tools_thinking_and_compaction(self):
        def row(content, **extra):
            return {"type": "assistant", "sessionId": "sid", "uuid": "m1",
                    "message": {"role": "assistant", "content": content}, **extra}
        self.write([row([{"type": "thinking", "thinking": "secret"}, {"type": "text", "text": "answer"}]),
                    row([{"type": "tool_use", "name": "Bash"}]),
                    row([{"type": "text", "text": "child"}], isSidechain=True),
                    row([{"type": "text", "text": "summary"}], isCompactSummary=True)])
        self.assertEqual([m["markdown"] for m in self.page(kind="claude")["messages"]], ["answer"])

    def test_bound_active_pane_only_and_no_state_changes(self):
        self.write([{"type": "session_meta", "payload": {"id": "sid", "cli_version": "0.160.0"}}, codex("visible")])
        store = Path(self.tmp.name) / "store"
        store.mkdir()
        record = {"key": "key", "kind": "codex", "id": "sid", "since": 1,
                  "binding": {"pane": "%1", "socket": "/socket", "pid": 12, "proof": "foreground-direct-v1"},
                  "reading": {"transcript": str(self.path)}, "state": {"event": "Stop"}}
        path = store / "record.json"
        path.write_text(json.dumps(record))
        before = path.read_bytes()
        with patch.object(native, "STORE", store), patch.object(native, "alive", return_value=True), patch.object(native, "command", side_effect=["%1|/socket|session", "%1"]):
            self.assertEqual(reading.read("session")["messages"][0]["markdown"], "visible")
        self.assertEqual(path.read_bytes(), before)
        with patch.object(native, "STORE", store), patch.object(native, "alive", return_value=True), patch.object(native, "command", return_value="%2|/socket|session"):
            self.assertEqual(reading.read("session")["availability"], "unavailable")

    def test_format_version_is_verified(self):
        self.write([{"type": "session_meta", "payload": {"id": "sid", "cli_version": "0.161.0"}}, codex("answer")])
        store = Path(self.tmp.name) / "store"
        store.mkdir()
        record = {"key": "key", "kind": "codex", "id": "sid", "since": 1,
                  "binding": {"pane": "%1", "socket": "/socket", "pid": 12, "proof": "foreground-direct-v1"},
                  "reading": {"transcript": str(self.path)}}
        (store / "record.json").write_text(json.dumps(record))
        with patch.object(native, "STORE", store), patch.object(native, "alive", return_value=True), patch.object(native, "command", return_value="%1|/socket|session"):
            self.assertEqual(reading.read("session")["availability"], "unsupported")


if __name__ == "__main__":
    unittest.main()
