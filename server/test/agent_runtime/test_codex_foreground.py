import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src/agentRuntime"))
import codex_foreground as observer
from state import State


class ForegroundTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "rollout.jsonl"
        self.record = {}
        self.now = 100
        self.state = State(lambda: self.now)
        self.hook("SessionStart", source="startup")
        self.hook("UserPromptSubmit")
        self.event("task_started")

    def hook(self, name, **kwargs):
        observer.hook(self.record, self.state, {"hook_event_name": name,
            "turn_id": "turn", "transcript_path": str(self.path), **kwargs})

    def event(self, name, turn="turn"):
        with self.path.open("a") as f:
            f.write(json.dumps({"type": "event_msg", "payload": {"type": name, "turn_id": turn}}) + "\n")

    def inspect(self):
        observer.inspect(self.record, self.state)
        return self.state.snapshot()

    def finish(self):
        self.hook("Stop")
        self.event("task_complete")

    def test_plain_completion_settles_then_goes_green(self):
        self.finish()
        self.assertEqual(self.inspect(), ("settling", ""))
        self.now += 2
        self.assertEqual(self.state.snapshot(), ("idle", "done"))

    def test_stop_blocked_by_other_hook_does_not_finish(self):
        self.hook("Stop")
        self.assertEqual(self.inspect(), ("unknown", ""))
        self.hook("UserPromptSubmit", turn_id="continuation")
        self.event("task_started", "continuation")
        self.assertEqual(self.inspect(), ("running", ""))

    def test_background_shell_stays_red_until_original_post_hook(self):
        self.hook("PreToolUse", tool_name="Bash", tool_use_id="shell")
        self.finish()
        self.assertEqual(self.inspect(), ("background", ""))
        self.hook("PostToolUse", tool_name="Bash", tool_use_id="shell")
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_child_stop_requires_actual_child_completion(self):
        child = Path(self.temp.name) / "child.jsonl"
        child.write_text(json.dumps({"type": "event_msg", "payload": {"type": "task_started", "turn_id": "child-turn"}}) + "\n")
        self.hook("SubagentStart", agent_id="child")
        self.finish()
        self.hook("SubagentStop", agent_id="child", agent_transcript_path=str(child))
        self.assertEqual(self.inspect(), ("background", ""))
        with child.open("a") as f:
            f.write(json.dumps({"type": "event_msg", "payload": {"type": "task_complete", "turn_id": "child-turn"}}) + "\n")
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_child_end_cannot_finish_running_root(self):
        self.hook("SubagentStart", agent_id="child")
        self.hook("SubagentStop", agent_id="child", agent_transcript_path=str(self.path))
        self.event("task_complete")
        self.assertEqual(self.inspect(), ("running", ""))

    def test_unmatched_child_stop_is_not_evidence_that_no_child_is_running(self):
        self.hook("SubagentStop", agent_id="unseen", agent_transcript_path=None)
        self.finish()
        self.assertEqual(self.inspect(), ("background", ""))

    def test_active_paused_and_failed_goal_update_never_finish(self):
        self.hook("PreToolUse", tool_name="create_goal", tool_use_id="goal-call")
        self.hook("PostToolUse", tool_name="create_goal", tool_use_id="goal-call", tool_response={"status": "active"})
        self.finish()
        self.assertEqual(self.inspect(), ("background", ""))
        for result in ({"status": "paused"}, {"error": "failed", "status": "complete"}, "invalid"):
            self.hook("PostToolUse", tool_name="update_goal", tool_use_id="update", tool_response=result)
            self.assertEqual(self.inspect(), ("background", ""))
        self.hook("PostToolUse", tool_name="update_goal", tool_use_id="update", tool_response={"goal": {"status": "complete"}})
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_pending_user_decision_survives_stop(self):
        self.hook("PreToolUse", tool_name="request_user_input", tool_use_id="question")
        self.finish()
        self.assertEqual(self.inspect(), ("waiting", "decision"))

    def test_explicit_absence_of_goal_does_not_leave_background_work(self):
        self.hook("PreToolUse", tool_name="get_goal", tool_use_id="read-goal")
        self.hook("PostToolUse", tool_name="get_goal", tool_use_id="read-goal", tool_response={"goal": None})
        self.finish()
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_old_turn_new_activity_and_interrupt_cannot_go_green(self):
        self.hook("Stop")
        self.event("task_complete", "old")
        self.assertEqual(self.inspect(), ("unknown", ""))
        self.event("task_complete")
        self.event("task_started", "new")
        self.assertEqual(self.inspect(), ("unknown", ""))
        self.event("task_complete")
        self.hook("Interrupt")
        self.assertEqual(self.inspect(), ("unknown", ""))

    def test_compaction_preserves_pending_work(self):
        self.hook("PreToolUse", tool_name="Bash", tool_use_id="monitor")
        self.hook("SessionStart", source="compact")
        self.finish()
        self.assertEqual(self.inspect(), ("background", ""))

    def test_missing_partial_corrupt_or_unknown_records_fail_closed(self):
        self.hook("Stop")
        for text in ("", "{}", "not json\n", '{"type":"unrecognized"}\n'):
            self.path.write_text(text)
            self.assertEqual(self.inspect(), ("unknown", ""))
        self.path.unlink()
        self.assertEqual(self.inspect(), ("unknown", ""))

    def test_old_install_without_tracked_start_cannot_assume_no_background_work(self):
        self.record.pop("foreground")
        self.finish()
        self.assertEqual(self.inspect(), ("unknown", ""))

    def test_long_transcript_reads_only_bounded_tail_and_does_not_store_content(self):
        self.path.write_text(json.dumps({"private": "secret" * observer.TAIL_BYTES}) + "\n")
        self.finish()
        self.assertEqual(self.inspect(), ("settling", ""))
        self.assertNotIn("secret", json.dumps(self.record))
