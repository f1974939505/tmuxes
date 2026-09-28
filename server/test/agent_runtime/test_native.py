import contextlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src/agentRuntime"))
import native
from install_native import merge_hooks


class ReadClient:
    def __init__(self, status="idle", flags=None, terminals=None, children=None, goal=None, turn_status="completed"):
        self.status, self.flags = status, flags or []
        self.terminals, self.children, self.goal = terminals or [], children or [], goal
        self.turn_status = turn_status
        self.calls = []

    def request(self, method, params):
        assert method in native.ReadOnlyCodex.METHODS
        self.calls.append((method, params))
        if method == "thread/read":
            return {"thread": {"id": "root", "status": {"type": self.status, "activeFlags": self.flags}}}
        if method == "thread/turns/list":
            return {"data": [{"id": "turn", "status": self.turn_status}]}
        if method == "thread/goal/get":
            return {"goal": self.goal}
        if method == "thread/list":
            return {"data": self.children}
        return {"data": self.terminals}


class NativeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        for patcher in (patch.object(native, "STORE", self.base),
                        patch.object(native, "locked", contextlib.nullcontext),
                        patch.object(native, "binding", return_value=None)):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_hook_metadata_does_not_persist_prompts_or_tool_content(self):
        native.report("claude", {"session_id": "root", "hook_event_name": "UserPromptSubmit", "prompt": "private prompt"})
        native.report("claude", {"session_id": "root", "hook_event_name": "PostToolUse", "tool_response": "private output"})
        data = next(self.base.glob("*.json")).read_text()
        self.assertNotIn("private", data)
        self.assertTrue(json.loads(data)["state"]["running"])

    def test_codex_stop_is_not_completion_without_runtime_evidence(self):
        native.report("codex", {"session_id": "root", "hook_event_name": "Stop", "turn_id": "t"})
        data = json.loads(next(self.base.glob("*.json")).read_text())
        self.assertEqual(native.restore(data["state"]).snapshot(), ("unknown", ""))
        self.assertEqual(data["candidate"], "t")

    def test_claude_background_tasks_survive_stop(self):
        native.report("claude", {"session_id": "root", "hook_event_name": "UserPromptSubmit"})
        native.report("claude", {"session_id": "root", "hook_event_name": "Stop", "background_tasks": [{"id": "monitor"}], "session_crons": []})
        data = json.loads(next(self.base.glob("*.json")).read_text())
        self.assertEqual(native.restore(data["state"]).snapshot(), ("background", ""))

    def test_child_hook_cannot_finish_root(self):
        native.report("claude", {"session_id": "root", "hook_event_name": "UserPromptSubmit"})
        native.report("claude", {"session_id": "child", "agent_id": "c", "hook_event_name": "Stop", "background_tasks": [], "session_crons": []})
        self.assertEqual(len(list(self.base.glob("*.json"))), 1)
        self.assertTrue(json.loads(next(self.base.glob("*.json")).read_text())["state"]["running"])

    def test_installer_preserves_other_hooks_and_is_idempotent(self):
        path = self.base / "settings.json"
        original = {"model": "keep", "hooks": {"Stop": [{"matcher": "x", "hooks": [{"type": "command", "command": "other"}]}]}}
        path.write_text(json.dumps(original))
        merge_hooks(path, ["Stop"], "our-observer")
        once = path.read_bytes()
        merge_hooks(path, ["Stop"], "our-observer")
        self.assertEqual(path.read_bytes(), once)
        result = json.loads(once)
        self.assertEqual(result["model"], "keep")
        self.assertEqual(result["hooks"]["Stop"][0], original["hooks"]["Stop"][0])
        self.assertEqual(len(list(self.base.glob("*.bak"))), 1)

    def test_corrupt_config_is_not_overwritten(self):
        path = self.base / "settings.json"
        path.write_text("not json")
        with self.assertRaises(ValueError):
            merge_hooks(path, ["Stop"], "observer")
        self.assertEqual(path.read_text(), "not json")

    def record(self):
        return {"state": {}, "id": "root", "turn": "turn", "candidate": "turn"}

    def test_readonly_codex_requires_all_work_finished(self):
        for client in (ReadClient(terminals=[{"processId": "monitor"}]),
                       ReadClient(children=[{"id": "child", "status": {"type": "active"}}]),
                       ReadClient(goal={"status": "active"})):
            self.assertEqual(native.inspect_codex(self.record(), client).snapshot(), ("background", ""))
        self.assertEqual(native.inspect_codex(self.record(), ReadClient()).snapshot(), ("settling", ""))

    def test_readonly_codex_does_not_guess_human_approvals(self):
        client = ReadClient(status="active", flags=["waitingOnApproval"])
        self.assertEqual(native.inspect_codex(self.record(), client).snapshot(), ("unknown", ""))
        client = ReadClient(status="active", flags=["waitingOnUserInput"])
        self.assertEqual(native.inspect_codex(self.record(), client).snapshot(), ("waiting", "decision"))

    def test_paused_goal_cannot_finish(self):
        with self.assertRaises(ValueError):
            native.inspect_codex(self.record(), ReadClient(goal={"status": "paused"}))

    def test_fresh_idle_thread_needs_no_history_queries(self):
        client = ReadClient()
        self.assertEqual(native.inspect_codex({"state": {}, "id": "root"}, client).snapshot(), ("unknown", ""))
        self.assertEqual([method for method, _ in client.calls], ["thread/read"])

    def test_old_completed_turn_is_not_done_after_resume(self):
        record = self.record()
        record.pop("candidate")
        self.assertEqual(native.inspect_codex(record, ReadClient()).snapshot(), ("unknown", ""))

    def test_terminal_failure_and_new_work_race(self):
        self.assertEqual(native.inspect_codex(self.record(), ReadClient(turn_status="failed")).snapshot(), ("idle", "error"))
        client = ReadClient()
        original = client.request
        count = [0]
        def request(method, params):
            if method == "thread/read":
                count[0] += 1
                if count[0] > 1:
                    client.status = "active"
            return original(method, params)
        client.request = request
        with self.assertRaises(ValueError):
            native.inspect_codex(self.record(), client)


class BindingTests(unittest.TestCase):
    def test_daemon_inherited_pane_is_not_a_binding(self):
        with patch.dict(native.os.environ, {"TMUX": "/tmp/test.sock,1,0", "TMUX_PANE": "%2"}), \
             patch.object(native, "command", return_value="10"), \
             patch.object(native.os, "getppid", return_value=100), \
             patch.object(native, "process", side_effect=lambda pid: (1, "start") if pid == 100 else None):
            self.assertIsNone(native.binding())

    def test_hook_ancestry_maps_to_real_pane_process(self):
        with patch.dict(native.os.environ, {"TMUX": "/tmp/test.sock,1,0", "TMUX_PANE": "%2"}), \
             patch.object(native, "command", return_value="10"), \
             patch.object(native.os, "getppid", return_value=100), \
             patch.object(native, "process", side_effect=lambda pid: {100: (20, "hook"), 20: (10, "agent")}.get(pid)):
            self.assertEqual(native.binding(), {"socket": "/tmp/test.sock", "pane": "%2", "pid": 20, "stamp": "agent"})
