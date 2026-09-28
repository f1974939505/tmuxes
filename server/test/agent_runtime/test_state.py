import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "agentRuntime"))
from state import State
from claude import Claude


class StateTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.state = State(lambda: self.now)

    def apply(self, kind, **kw):
        self.state.apply({"type": kind, **kw})

    def test_completion_requires_evidence_and_settle(self):
        self.apply("start")
        self.apply("stop", known=False)
        self.now = 100
        self.assertEqual(self.state.snapshot(), ("unknown", ""))
        self.apply("stop", known=True)
        self.assertEqual(self.state.snapshot(), ("settling", ""))
        self.now += 2
        self.assertEqual(self.state.snapshot(), ("idle", "done"))

    def test_new_activity_cancels_small_stop(self):
        self.apply("stop", known=True)
        self.apply("start")
        self.now = 100
        self.assertEqual(self.state.snapshot(), ("running", ""))

    def test_monitor_shell_and_child_do_not_finish_parent(self):
        for task in ("monitor", "shell", "subagent", "cron", "goal"):
            self.apply("task.start", id=task)
            self.apply("stop", known=True)
            self.now += 100
            self.assertEqual(self.state.snapshot(), ("background", ""))
            self.apply("task.end", id=task)
            self.assertNotEqual(self.state.snapshot()[1], "done")

    def test_multiple_decisions_and_auto_resolution(self):
        self.apply("start")
        self.apply("decision.open", id="a")
        self.apply("decision.open", id="b")
        self.apply("decision.close", id="a")
        self.assertEqual(self.state.snapshot(), ("waiting", "decision"))
        self.apply("decision.close", id="b")
        self.assertEqual(self.state.snapshot(), ("running", ""))

    def test_only_terminal_errors_alert(self):
        self.apply("start")
        self.apply("error", willRetry=True)
        self.assertEqual(self.state.snapshot(), ("running", ""))
        self.apply("error", willRetry=False)
        self.apply("stop", known=True)
        self.now = 100
        self.assertEqual(self.state.snapshot(), ("idle", "error"))
        self.apply("start")
        self.assertEqual(self.state.snapshot(), ("running", ""))

    def test_interrupt_exit_and_disconnect_never_mean_done(self):
        for event in ("interrupted", "closed", "unknown"):
            self.apply("stop", known=True)
            self.apply(event)
            self.now += 100
            self.assertNotEqual(self.state.snapshot()[1], "done")


class ClaudeTests(unittest.TestCase):
    def setUp(self):
        self.state = State(lambda: 100)
        self.adapter = Claude(self.state.apply)
        self.hook("SessionStart")
        self.hook("UserPromptSubmit")

    def hook(self, name, **kw):
        self.adapter.handle({"hook_event_name": name, "session_id": "root", **kw})

    def test_stop_reads_background_and_cron_payload(self):
        for task_type in ("shell", "monitor", "subagent", "workflow", "MCP task"):
            self.hook("Stop", background_tasks=[{"id": "1", "type": task_type}], session_crons=[])
            self.assertEqual(self.state.snapshot(), ("background", ""))
        self.hook("Stop", background_tasks=[], session_crons=[{"id": "wake"}])
        self.assertEqual(self.state.snapshot(), ("background", ""))

    def test_missing_registry_is_unknown_not_empty(self):
        self.hook("Stop")
        self.assertEqual(self.state.snapshot(), ("unknown", ""))

    def test_child_cannot_stop_root(self):
        self.hook("Stop", session_id="child", background_tasks=[], session_crons=[])
        self.assertEqual(self.state.snapshot(), ("running", ""))
        self.hook("StopFailure", agent_id="child")
        self.assertEqual(self.state.snapshot(), ("running", ""))

    def test_permission_hook_is_not_human_evidence(self):
        self.hook("PermissionRequest", tool_use_id="a")
        self.assertEqual(self.state.snapshot(), ("running", ""))
        self.hook("Notification", notification_type="permission_prompt")
        self.assertEqual(self.state.snapshot(), ("waiting", "decision"))
        self.hook("PostToolUse", tool_use_id="a")
        self.assertEqual(self.state.snapshot(), ("running", ""))

    def test_question_completion_and_tool_failure(self):
        self.hook("PreToolUse", tool_name="AskUserQuestion", tool_use_id="q")
        self.assertEqual(self.state.snapshot(), ("waiting", "decision"))
        self.hook("PostToolUseFailure", tool_use_id="q")
        self.assertEqual(self.state.snapshot(), ("running", ""))

    def test_session_end_is_not_success(self):
        self.hook("SessionEnd")
        self.assertNotEqual(self.state.snapshot()[1], "done")
