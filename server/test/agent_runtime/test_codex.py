import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "agentRuntime"))
from codex import Codex
from state import State


class CodexTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.state = State(lambda: self.now)
        self.requests = []
        self.adapter = Codex(self.state.apply, self.requests.append)
        self.adapter.client({"id": 1, "method": "thread/start"})
        self.adapter.server({"id": 1, "result": {"thread": {"id": "root"}}})
        self.event("turn/started")

    def event(self, method, **params):
        return self.adapter.server({"method": method, "params": {"threadId": "root", **params}})

    def answer(self, request, result=None, error=None):
        message = {"id": request["id"]}
        message.update({"error": error} if error else {"result": result})
        self.assertFalse(self.adapter.server(message))

    def drain(self, children=None, processes=None, goal=None):
        while self.requests:
            request = self.requests.pop(0)
            method = request["method"]
            if method == "thread/read":
                result = {"thread": {"id": "root", "status": {"type": "idle"}}}
            elif method == "thread/goal/get":
                result = {"goal": goal}
            elif method == "thread/list":
                result = {"data": children or []}
            else:
                result = {"data": processes or []}
            self.answer(request, result=result)

    def test_real_tui_approval_is_forwarded_and_auto_resolved(self):
        request = {"id": "approval", "method": "item/commandExecution/requestApproval",
                   "params": {"threadId": "root", "turnId": "t"}}
        self.assertTrue(self.adapter.server(request))
        self.assertEqual(self.state.snapshot(), ("waiting", "decision"))
        self.event("serverRequest/resolved", requestId="approval")
        self.assertEqual(self.state.snapshot(), ("running", ""))
        self.assertEqual(self.requests, [])  # Never answers an approval itself.

    def test_external_thread_cannot_rebind_or_error_root(self):
        self.event("thread/started", thread={"id": "other"})
        self.event("error", threadId="other", willRetry=False)
        self.assertEqual(self.adapter.root, "root")
        self.assertEqual(self.state.snapshot(), ("running", ""))

    def test_completed_turn_requires_complete_runtime_snapshot(self):
        self.event("turn/completed", turn={"status": "completed"})
        self.assertNotEqual(self.state.snapshot()[1], "done")
        self.drain()
        self.now = 2
        self.assertEqual(self.state.snapshot(), ("idle", "done"))

    def test_background_terminal_suppresses_completion(self):
        self.event("turn/completed", turn={"status": "completed"})
        self.drain(processes=[{"processId": "monitor"}])
        self.now = 2
        self.assertEqual(self.state.snapshot(), ("background", ""))

    def test_active_child_or_goal_suppresses_completion(self):
        self.event("turn/completed", turn={"status": "completed"})
        self.drain(children=[{"id": "child", "status": {"type": "active"}}])
        self.assertEqual(self.state.snapshot(), ("background", ""))
        self.event("turn/started")
        self.event("turn/completed", turn={"status": "completed"})
        self.drain(goal={"status": "active"})
        self.assertEqual(self.state.snapshot(), ("background", ""))

    def test_snapshot_error_downgrades_to_unknown(self):
        self.event("turn/completed", turn={"status": "completed"})
        self.answer(self.requests.pop(), error={"code": -32601})
        self.drain()
        self.now = 100
        self.assertEqual(self.state.snapshot(), ("unknown", ""))

    def test_old_snapshot_does_not_finish_new_turn(self):
        self.event("turn/completed", turn={"status": "completed"})
        self.event("turn/started")
        self.drain()
        self.now = 100
        self.assertEqual(self.state.snapshot(), ("running", ""))

    def test_retry_errors_and_interrupts_do_not_alert_done(self):
        self.event("error", willRetry=True)
        self.assertEqual(self.state.snapshot(), ("running", ""))
        self.event("turn/completed", turn={"status": "interrupted"})
        self.assertEqual(self.state.snapshot(), ("unknown", ""))

    def test_goal_budget_limit_is_decision_not_done(self):
        self.event("turn/completed", turn={"status": "completed"})
        self.drain(goal={"status": "budgetLimited"})
        self.assertEqual(self.state.snapshot(), ("waiting", "decision"))

    def test_child_completion_does_not_finish_root(self):
        self.event("thread/started", thread={"id": "child", "parentThreadId": "root"})
        self.event("turn/completed", threadId="child", turn={"status": "completed"})
        self.assertEqual(self.state.snapshot(), ("running", ""))
        self.assertFalse(self.requests)

    def test_root_stop_does_not_dismiss_child_approval(self):
        self.event("thread/started", thread={"id": "child", "parentThreadId": "root"})
        self.adapter.server({"id": "child-approval", "method": "item/tool/requestUserInput",
                             "params": {"threadId": "child"}})
        self.event("turn/completed", turn={"status": "completed"})
        self.drain(children=[{"id": "child", "status": {"type": "active"}}])
        self.assertEqual(self.state.snapshot(), ("waiting", "decision"))

    def test_late_snapshot_cannot_hide_new_child_work(self):
        self.event("turn/completed", turn={"status": "completed"})
        self.event("thread/started", thread={"id": "child", "parentThreadId": "root"})
        self.drain()
        self.now = 100
        self.assertEqual(self.state.snapshot(), ("background", ""))
