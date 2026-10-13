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

    def test_foreground_snapshot_never_reads_shared_daemon(self):
        claim = {"scope": "/home/test/.codex", "binding": {"token": "a" * 32,
                 "proof": "foreground-codex-v1", "socket": "/sock", "pane": "%1", "pid": 20, "stamp": "x"}}
        with patch.object(native, "launch_claim", return_value=claim):
            native.report("codex", {"session_id": "root", "hook_event_name": "UserPromptSubmit"})
        from types import SimpleNamespace
        with patch.object(native.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(native, "command", return_value="%1|/sock|0|1|1|current"), \
             patch.object(native, "alive", return_value=True), \
             patch.object(native, "ReadOnlyCodex") as daemon:
            observation = native.snapshot()["observers"][0]
            daemon.assert_not_called()
        self.assertEqual(observation["session"], "current")
        self.assertEqual(observation["state"], "running")

    def test_codex_stop_is_not_completion_without_runtime_evidence(self):
        native.report("codex", {"session_id": "root", "hook_event_name": "Stop", "turn_id": "t"})
        data = json.loads(next(self.base.glob("*.json")).read_text())
        self.assertEqual(native.restore(data["state"]).snapshot(), ("unknown", ""))
        self.assertEqual(data["candidate"], "t")

    def test_unbound_codex_is_removed_without_contacting_daemon(self):
        from types import SimpleNamespace
        native.report("codex", {"session_id": "root", "hook_event_name": "Stop"})
        with patch.object(native.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(native, "command", return_value="%1|/sock|0|1|1|current"), \
             patch.object(native, "ReadOnlyCodex") as daemon:
            self.assertEqual(native.snapshot()["observers"], [])
            daemon.assert_not_called()
        self.assertEqual(list(self.base.glob("*.json")), [])

    def test_live_pane_observation_is_not_expired_by_age(self):
        from types import SimpleNamespace
        bound = {"socket": "/sock", "pane": "%1", "pid": 20, "stamp": "x"}
        with patch.object(native, "binding", return_value=bound):
            native.report("claude", {"session_id": "root", "hook_event_name": "UserPromptSubmit"})
        with patch.object(native.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(native, "command", return_value="%1|/sock|0|1|1|current"), \
             patch.object(native, "alive", return_value=True), \
             patch.object(native.time, "time", return_value=native.time.time() + 3 * 86400):
            observation = native.snapshot()["observers"][0]
        self.assertEqual((observation["session"], observation["state"]), ("current", "running"))

    def test_160_ledger_and_missing_stop_survive_snapshot_persistence(self):
        from types import SimpleNamespace
        transcript = self.base / "rollout.jsonl"
        transcript.write_text(json.dumps({"type": "session_meta", "payload": {"id": "root", "cli_version": "0.160.0"}})
            + '\n' + json.dumps({"type": "event_msg", "payload": {"type": "task_complete", "turn_id": "t"}}) + '\n')
        bound = {"proof": "foreground-direct-v1", "socket": "/sock", "pane": "%1", "pid": 20, "stamp": "x"}
        with patch.object(native, "direct_codex_binding", return_value=bound), \
             patch.dict(native.os.environ, {"CODEX_HOME": str(self.base)}):
            native.report("codex", {"session_id": "root", "hook_event_name": "UserPromptSubmit",
                "turn_id": "t", "transcript_path": str(transcript)})
        with patch.object(native.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(native, "command", return_value="%1|/sock|0|1|1|current"), \
             patch.object(native, "alive", return_value=True):
            self.assertEqual(native.snapshot()["observers"][0]["state"], "settling")
            persisted = json.loads(next(self.base.glob("*.json")).read_text())
            self.assertTrue(persisted["foreground"]["workLedger"]["root"]["caughtUp"])
            with patch.object(native.time, "time", return_value=native.time.time() + 2):
                observation = native.snapshot()["observers"][0]
            self.assertEqual((observation["state"], observation["reason"]), ("idle", "done"))
            transcript.unlink()
            self.assertNotEqual(native.snapshot()["observers"][0]["reason"], "done")

    def test_new_hook_invalidates_previous_completion_verification(self):
        native.report("codex", {"session_id": "root", "hook_event_name": "Stop", "turn_id": "t"})
        path = next(self.base.glob("*.json"))
        data = json.loads(path.read_text())
        data["verified"] = {"turn": "t", "at": 1}
        path.write_text(json.dumps(data))
        native.report("codex", {"session_id": "root", "hook_event_name": "Stop", "turn_id": "t"})
        self.assertNotIn("verified", json.loads(path.read_text()))

    def test_direct_codex_completion_reaches_green_without_daemon(self):
        from types import SimpleNamespace
        transcript = self.base / "rollout.jsonl"
        bound = {"proof": "foreground-direct-v1", "socket": "/sock", "pane": "%1", "pid": 20, "stamp": "x"}
        with patch.object(native, "direct_codex_binding", return_value=bound):
            for event in ("SessionStart", "UserPromptSubmit", "Stop"):
                native.report("codex", {"session_id": "root", "hook_event_name": event,
                    "turn_id": "t", "transcript_path": str(transcript)})
        transcript.write_text(json.dumps({"type": "event_msg", "payload": {"type": "task_complete", "turn_id": "t"}}) + "\n")
        with patch.object(native.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(native, "command", return_value="%1|/sock|0|1|1|current"), \
             patch.object(native, "alive", return_value=True), \
             patch.object(native, "ReadOnlyCodex") as daemon:
            self.assertEqual(native.snapshot()["observers"][0]["state"], "settling")
            with patch.object(native.time, "time", return_value=native.time.time() + 2):
                observation = native.snapshot()["observers"][0]
            daemon.assert_not_called()
        self.assertEqual((observation["state"], observation["reason"]), ("idle", "done"))

    def test_shared_codex_never_binds_even_with_plausible_ancestry(self):
        with patch.object(native, "binding", return_value={"pid": 10, "pane": "%1"}):
            native.report("codex", {"session_id": "root", "hook_event_name": "SessionStart"})
        data = json.loads(next(self.base.glob("*.json")).read_text())
        self.assertNotIn("binding", data)

    def test_failed_launch_resolution_survives_leaving_transcript_tail(self):
        from types import SimpleNamespace
        transcript = self.base / "rollout.jsonl"
        bound = {"proof": "foreground-direct-v1", "socket": "/sock", "pane": "%1", "pid": 20, "stamp": "x"}
        with patch.object(native, "direct_codex_binding", return_value=bound):
            for event in ("SessionStart", "UserPromptSubmit", "PreToolUse", "Stop"):
                native.report("codex", {"session_id": "root", "hook_event_name": event,
                    "turn_id": "t", "tool_name": "Bash", "tool_use_id": "failed", "transcript_path": str(transcript)})
        complete = json.dumps({"type": "event_msg", "payload": {"type": "task_complete", "turn_id": "t"}}) + "\n"
        transcript.write_text(json.dumps({"type": "response_item", "payload": {"type": "function_call_output",
            "call_id": "failed", "output": 'exec_command failed: CreateProcess { message: "private failure" }',
            "internal_chat_message_metadata_passthrough": {"turn_id": "t"}}}) + "\n" + complete)
        with patch.object(native.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(native, "command", return_value="%1|/sock|0|1|1|current"), \
             patch.object(native, "alive", return_value=True):
            self.assertEqual(native.snapshot()["observers"][0]["state"], "settling")
            persisted = next(self.base.glob("*.json")).read_text()
            self.assertEqual(json.loads(persisted)["state"]["tasks"], [])
            self.assertNotIn("private failure", persisted)
            transcript.write_text(json.dumps({"ignored": "x" * native.codex_foreground.TAIL_BYTES}) + "\n" + complete)
            with patch.object(native.time, "time", return_value=native.time.time() + 2):
                observation = native.snapshot()["observers"][0]
            self.assertEqual((observation["state"], observation["reason"]), ("idle", "done"))

    def test_large_hook_reaches_receiver_without_persisting_content(self):
        import io
        bound = {"proof": "foreground-direct-v1", "socket": "/sock", "pane": "%1", "pid": 20, "stamp": "x"}
        with patch.object(native, "direct_codex_binding", return_value=bound):
            for event in ("SessionStart", "PreToolUse", "PostToolUse", "Stop"):
                payload = {"hook_event_name": event, "session_id": "root", "turn_id": "t",
                    "tool_name": "Bash", "tool_use_id": "long", "last_assistant_message": "private" * 50000,
                    "tool_response": "private" * 50000}
                stdin = io.TextIOWrapper(io.BytesIO(json.dumps(payload).encode()))
                with patch.object(native.sys, "argv", ["native.py", "codex"]), \
                     patch.object(native.sys, "stdin", stdin), patch.object(native.sys, "stdout", io.StringIO()):
                    native.main()
        persisted = next(self.base.glob("*.json")).read_text()
        record = json.loads(persisted)
        self.assertEqual(record["candidate"], "t")
        self.assertEqual(record["state"]["tasks"], [])
        self.assertNotIn("private", persisted)
        self.assertLess(len(persisted), 2048)

    def test_stale_snapshot_cannot_overwrite_newer_state_revision(self):
        from types import SimpleNamespace
        bound = {"proof": "foreground-direct-v1", "socket": "/sock", "pane": "%1", "pid": 20, "stamp": "x"}
        with patch.object(native, "direct_codex_binding", return_value=bound):
            native.report("codex", {"session_id": "root", "hook_event_name": "SessionStart"})
        path = next(self.base.glob("*.json"))
        def interleave(record, state, deadline=None):
            latest = json.loads(path.read_text())
            latest["state"].update(revision=latest["state"]["revision"] + 1, tasks=["tool:monitor"])
            path.write_text(json.dumps(latest))
            return state
        with patch.object(native.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(native, "command", return_value="%1|/sock|0|1|1|current"), \
             patch.object(native, "alive", return_value=True), \
             patch.object(native.codex_foreground, "inspect", side_effect=interleave):
            observation = native.snapshot()["observers"][0]
        self.assertEqual(observation["state"], "unknown")
        self.assertEqual(json.loads(path.read_text())["state"]["tasks"], ["tool:monitor"])

    def test_completion_evidence_must_still_exist_on_confirmation_refresh(self):
        from types import SimpleNamespace
        transcript = self.base / "rollout.jsonl"
        bound = {"proof": "foreground-direct-v1", "socket": "/sock", "pane": "%1", "pid": 20, "stamp": "x"}
        with patch.object(native, "direct_codex_binding", return_value=bound):
            for event in ("SessionStart", "UserPromptSubmit", "Stop"):
                native.report("codex", {"session_id": "root", "hook_event_name": event,
                    "turn_id": "t", "transcript_path": str(transcript)})
        transcript.write_text(json.dumps({"type": "event_msg", "payload": {"type": "task_complete", "turn_id": "t"}}) + "\n")
        with patch.object(native.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(native, "command", return_value="%1|/sock|0|1|1|current"), \
             patch.object(native, "alive", return_value=True):
            self.assertEqual(native.snapshot()["observers"][0]["state"], "settling")
            persisted = json.loads(next(self.base.glob("*.json")).read_text())
            self.assertIsNone(persisted["state"]["complete_at"])
            transcript.unlink()
            with patch.object(native.time, "time", return_value=native.time.time() + 2):
                observation = native.snapshot()["observers"][0]
            self.assertEqual((observation["state"], observation["reason"]), ("unknown", ""))

    def test_ended_claude_record_cannot_be_rebound_to_new_process(self):
        native.report("claude", {"session_id": "old", "hook_event_name": "SessionEnd"})
        key = next(self.base.glob("*.json")).stem
        with patch.object(native, "command") as command:
            with self.assertRaisesRegex(ValueError, "observation ended"):
                native.bind_record(key, "current")
            command.assert_not_called()

    def test_snapshot_does_not_link_ended_record_even_if_process_alive(self):
        native.report("claude", {"session_id": "old", "hook_event_name": "SessionEnd"})
        path = next(self.base.glob("*.json"))
        record = json.loads(path.read_text())
        record["binding"] = {"socket": "/sock", "pane": "%1", "pid": 20, "stamp": "x"}
        path.write_text(json.dumps(record))
        older = {**record, "key": "older", "since": record["since"] - 1,
                 "state": {"event": "Stop", "tasks": ["background:old"]}}
        (self.base / "older.json").write_text(json.dumps(older))
        from types import SimpleNamespace
        with patch.object(native.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(native, "command", return_value="%1|/sock|0|1|1|current"), \
             patch.object(native, "alive", return_value=True):
            observations = native.snapshot()["observers"]
        self.assertEqual(observations, [])
        self.assertEqual(list(self.base.glob("*.json")), [])

    def test_codex_rejects_manual_process_guess(self):
        native.report("codex", {"session_id": "root", "hook_event_name": "SessionStart"})
        key = next(self.base.glob("*.json")).stem
        with self.assertRaisesRegex(ValueError, "cannot be linked"):
            native.bind_record(key, "a")

    def test_dedicated_backends_keep_same_thread_id_separate(self):
        for token, pane in (("a" * 32, "%1"), ("b" * 32, "%2")):
            claim = {"binding": {"token": token, "pane": pane, "proof": "dedicated-codex-v1"},
                     "endpoint": "/tmp/" + token, "backend": {"pid": 20, "stamp": "x"}}
            with patch.object(native, "launch_claim", return_value=claim):
                native.report("codex", {"session_id": "root", "hook_event_name": "SessionStart"})
        self.assertEqual(len(list(self.base.glob("*.json"))), 2)

    def test_same_session_id_in_two_processes_keeps_independent_states(self):
        for pane, event in (("%1", "Stop"), ("%2", "SessionEnd")):
            with patch.object(native, "binding", return_value={"socket": "/sock", "pane": pane, "pid": pane, "stamp": "x"}):
                native.report("claude", {"session_id": "shared", "hook_event_name": event,
                                        "background_tasks": [{"id": "monitor"}], "session_crons": []})
        records = [json.loads(path.read_text()) for path in self.base.glob("*.json")]
        self.assertEqual(len(records), 2)
        states = {r["binding"]["pane"]: native.restore(r["state"]).snapshot()[0] for r in records}
        self.assertEqual(states, {"%1": "background", "%2": "unknown"})

    def test_manual_binding_cannot_claim_another_process_session_id(self):
        native.report("claude", {"session_id": "other", "hook_event_name": "Stop"})
        key = next(self.base.glob("*.json")).stem
        with self.assertRaisesRegex(ValueError, "cannot verify a session ID"):
            native.bind_record(key, "current")

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
    def test_direct_codex_requires_foreground_flag_and_real_pane_ancestry(self):
        owner = {"socket": "/sock", "pane": "%1", "pid": 20, "stamp": "agent"}
        with patch.object(native, "binding", return_value=owner), \
             patch.object(native.os, "getppid", return_value=100), \
             patch.object(native, "process", side_effect=lambda pid: {100: (20, "hook"), 20: (10, "agent")}.get(pid)), \
             patch.object(native, "process_arguments", side_effect=lambda pid: ["/bin/codex", "--no-daemon"] if pid == 20 else ["sh"]), \
             patch.object(native, "command", return_value="20 20"):
            self.assertEqual(native.direct_codex_binding(), {**owner, "proof": "foreground-direct-v1"})
            with patch.object(native, "process_arguments", return_value=["codex", "app-server", "--managed-daemon"]):
                self.assertIsNone(native.direct_codex_binding())
            with patch.object(native, "command", return_value="20 10"):
                self.assertIsNone(native.direct_codex_binding())
            with patch.object(native, "binding", return_value=None):
                self.assertIsNone(native.direct_codex_binding())

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
