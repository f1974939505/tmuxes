import datetime
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src/agentRuntime"))
import codex_history as history
from state import State


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.path = self.home / "rollout.jsonl"
        self.record = {"foreground": {"transcript": str(self.path), "tools": {}}}
        self.state = State(lambda: 100)
        self.state.apply({"type": "task.start", "id": "tool:exec-id"})
        self.child = "01a0f5e2-992e-79b3-97db-cf661102c3ae"

    def write(self, rows, append=False):
        with self.path.open("a" if append else "w", encoding="utf-8") as stream:
            for row in rows:
                stream.write(json.dumps(row) + "\n")

    def item(self, status="completed", turn="turn", call="exec-id"):
        return {"type": "event_msg", "payload": {"type": "item_completed", "turn_id": turn,
            "item": {"type": "CommandExecution", "id": call, "status": status,
                "exit_code": 0 if status == "completed" else None, "stdout": "private output"}}}

    def event(self, kind):
        return {"type": "event_msg", "payload": {"type": kind, "turn_id": "turn"}}

    def meta(self, version="0.159.3", parent="root"):
        return {"type": "session_meta", "payload": {"id": self.child, "cli_version": version,
            "source": {"subagent": {"thread_spawn": {"parent_thread_id": parent}}}}}

    def resolve(self):
        history.resolve_tools(self.record, self.state, time.monotonic() + 2)

    def child_stopped(self):
        return history.child_stopped(str(self.path), self.child, self.record["foreground"], time.monotonic() + 2)

    def test_completed_item_recovers_old_unmatched_hook_without_finishing_root(self):
        self.write([self.item()])
        self.resolve()
        self.assertFalse(self.state.tasks)
        self.assertEqual(self.state.snapshot(), ("unknown", ""))
        self.assertNotIn("private", json.dumps(self.record))

    def test_yielded_monitor_is_not_a_completed_command(self):
        self.write([self.item(), self.item("in_progress")])
        self.resolve()
        self.assertEqual(self.state.snapshot(), ("background", ""))
        self.write([self.item()], append=True)
        self.resolve()
        self.assertFalse(self.state.tasks)

    def test_item_must_match_tracked_turn(self):
        self.record["foreground"]["tools"] = {"exec-id": {"name": "Bash", "turn": "new"}}
        self.write([self.item(turn="old")])
        self.resolve()
        self.assertTrue(self.state.tasks)

    def test_history_backfill_is_bounded_and_continues_from_saved_cursor(self):
        self.write([self.item()] + [{"type": "ignored", "text": "x" * 2000} for _ in range(500)])
        with patch.object(history, "PASS_BYTES", 300 * 1024):
            self.resolve()
            self.assertTrue(self.state.tasks)
            previous = self.record["foreground"]["toolScan"]["offset"]
            self.resolve()
            self.assertLess(self.record["foreground"]["toolScan"]["offset"], previous)
            for _ in range(5):
                self.resolve()
        self.assertFalse(self.state.tasks)

    def test_completed_status_without_exit_evidence_does_not_clear_shell(self):
        row = self.item()
        row["payload"]["item"].pop("exit_code")
        self.write([row])
        self.resolve()
        self.assertTrue(self.state.tasks)

    def test_resolving_recent_tool_preserves_backfill_for_older_tool(self):
        self.state.apply({"type": "task.start", "id": "tool:recent"})
        self.write([self.item()] + [{"type": "ignored", "text": "x" * 2000} for _ in range(500)])
        with patch.object(history, "PASS_BYTES", 300 * 1024):
            self.resolve()
            previous = self.record["foreground"]["toolScan"]["offset"]
            self.write([self.item(call="recent")], append=True)
            self.resolve()
            self.assertNotIn("tool:recent", self.state.tasks)
            self.assertLess(self.record["foreground"]["toolScan"]["offset"], previous)

    def test_cancelled_child_with_all_commands_ended_is_stopped(self):
        self.write([self.meta(), self.event("task_started"), self.item(), self.event("turn_aborted")])
        self.assertTrue(self.child_stopped())

    def test_child_abort_or_final_answer_cannot_hide_running_monitor(self):
        for ending in ("turn_aborted", "task_complete"):
            self.record["foreground"].pop("childScans", None)
            self.write([self.meta(), self.event("task_started"), self.item("in_progress"), self.event(ending)])
            self.assertFalse(self.child_stopped())

    def test_stopped_child_reactivation_is_detected(self):
        self.write([self.meta(), self.event("task_complete")])
        self.assertTrue(self.child_stopped())
        self.write([self.event("task_started")], append=True)
        self.assertFalse(self.child_stopped())

    def test_unknown_version_cannot_certify_aborted_child(self):
        self.write([self.meta(version="future"), self.event("turn_aborted")])
        self.assertFalse(self.child_stopped())

    def test_large_complete_rows_are_read_within_the_pass_budget(self):
        row = self.item()
        row["payload"]["item"]["stdout"] = "private" * 100000
        self.write([self.meta(), self.event("task_started"), row, self.event("turn_aborted")])
        self.assertTrue(self.child_stopped())
        self.assertNotIn("private", json.dumps(self.record))

    def test_partial_child_row_is_retried_and_cannot_certify_completion(self):
        self.write([self.meta(), self.event("task_started")])
        row = json.dumps(self.event("task_complete"))
        with self.path.open("a") as stream:
            stream.write(row[:20])
        self.assertFalse(self.child_stopped())
        with self.path.open("a") as stream:
            stream.write(row[20:] + "\n")
        self.assertTrue(self.child_stopped())

    def test_child_goal_requires_explicit_absence_or_completion(self):
        call = {"type": "response_item", "payload": {"type": "function_call", "name": "get_goal", "call_id": "goal"}}
        for goal, stopped in ((None, True), ({"status": "paused"}, False), ({"status": "active"}, False)):
            self.record["foreground"].pop("childScans", None)
            result = {"type": "response_item", "payload": {"type": "function_call_output", "call_id": "goal",
                "output": json.dumps({"goal": goal})}}
            self.write([self.meta(), call, result, self.event("turn_aborted")])
            self.assertEqual(bool(self.child_stopped()), stopped)

    def test_child_lookup_checks_parent_and_target_timezone_day(self):
        date = datetime.datetime.fromtimestamp(int(self.child.replace("-", "")[:12], 16) / 1000, datetime.timezone.utc)
        directory = self.home / "sessions" / (date - datetime.timedelta(days=1)).strftime("%Y/%m/%d")
        directory.mkdir(parents=True)
        self.path = directory / ("rollout-fixture-" + self.child + ".jsonl")
        self.write([self.meta()])
        self.assertEqual(history.find_child(str(self.home), self.child, "root"), str(self.path))
        self.assertIsNone(history.find_child(str(self.home), self.child, "another-parent"))
