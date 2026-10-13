"""Regression cases derived from the 0.160 native wire format and HFNL failures."""
import datetime
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src/agentRuntime"))
import codex_foreground
import codex_rollout as rollout
from state import State

ROOT = "01a10400-0000-7000-8000-000000000001"
CHILD = "01a10400-0000-7000-8000-000000000002"
GRANDCHILD = "01a10400-0000-7000-8000-000000000003"


def event(kind, **values):
    return {"type": "event_msg", "payload": {"type": kind, "turn_id": "turn", **values}}


def item(item_type, **values):
    return event("item_completed", item={"type": item_type, "id": "work", **values})


def response(kind, call="call", **values):
    return {"type": "response_item", "payload": {"type": kind, "call_id": call, **values}}


class RolloutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.paths = {}
        self.make(ROOT)
        self.record = {"id": ROOT, "scope": str(self.home)}
        self.now = 100
        self.state = State(lambda: self.now)
        self.hook("SessionStart", source="startup")
        self.hook("UserPromptSubmit")
        self.write(ROOT, event("task_started"))

    def make(self, thread, parent=None):
        date = datetime.datetime.fromtimestamp(int(thread.replace("-", "")[:12], 16)/1000, datetime.timezone.utc)
        path = self.home / "sessions" / date.strftime("%Y/%m/%d") / ("rollout-fixture-" + thread + ".jsonl")
        path.parent.mkdir(parents=True, exist_ok=True)
        self.paths[thread] = path
        meta = {"id": thread, "cli_version": "0.160.0"}
        if parent:
            meta["source"] = {"subagent": {"thread_spawn": {"parent_thread_id": parent}}}
        self.write(thread, {"type": "session_meta", "payload": meta})

    def write(self, thread, *rows):
        with self.paths[thread].open("a", encoding="utf-8") as stream:
            for row in rows:
                stream.write(json.dumps(row) + "\n")

    def hook(self, kind, **values):
        codex_foreground.hook(self.record, self.state, {"hook_event_name": kind,
            "turn_id": "turn", "transcript_path": str(self.paths[ROOT]), **values})

    def finish(self):
        self.hook("Stop")
        self.write(ROOT, event("task_complete"))

    def inspect(self):
        codex_foreground.inspect(self.record, self.state)
        return self.state.snapshot()

    def test_missing_start_and_unmatched_tool_hooks_recover_from_actual_work(self):
        self.record["foreground"]["tracked"] = False
        for name in ("Bash", "view_image"):
            self.hook("PreToolUse", tool_name=name, tool_use_id=name)
        self.finish()
        self.assertEqual(self.inspect(), ("settling", ""))
        self.now += 2
        self.assertEqual(self.state.snapshot(), ("idle", "done"))
        self.assertTrue(self.record["completionDiagnostics"]["tracked"])

    def test_missing_stop_hook_recovered_but_interrupt_not_completed(self):
        self.write(ROOT, event("task_complete"))
        self.assertEqual(self.inspect(), ("settling", ""))
        self.hook("Interrupt")
        self.assertEqual(self.inspect(), ("unknown", ""))

    def test_new_prompt_cannot_reuse_previous_complete_record(self):
        self.finish()
        self.hook("UserPromptSubmit", turn_id="new")
        self.assertEqual(self.inspect(), ("running", ""))

    def test_live_monitor_stays_red_after_root_final_then_turns_green_on_exit(self):
        self.write(ROOT, item("CommandExecution", status="in_progress", process_id="101", exit_code=None))
        self.finish()
        self.assertEqual(self.inspect(), ("background", ""))
        self.write(ROOT, item("CommandExecution", status="completed", process_id="101", exit_code=0))
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_failed_recoverable_command_is_not_agent_failure(self):
        self.write(ROOT, item("CommandExecution", status="failed", process_id="101", exit_code=None))
        self.finish()
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_actual_unrecoverable_agent_error_stays_error(self):
        self.write(ROOT, event("error", will_retry=False))
        self.finish()
        self.assertEqual(self.inspect(), ("idle", "error"))

    def test_read_only_wait_and_child_message_to_parent_do_not_create_children(self):
        self.make(CHILD, ROOT)
        self.write(ROOT, item("SubAgentActivity", kind="started", agent_thread_id=CHILD))
        self.write(CHILD, item("SubAgentActivity", kind="interacted", agent_thread_id=ROOT),
            item("CollabAgentToolCall", tool="wait", status="completed", receiver_thread_ids=[], agents_states={}),
            event("task_complete"))
        self.finish()
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_nested_agent_and_its_monitor_must_finish(self):
        self.make(CHILD, ROOT)
        self.make(GRANDCHILD, CHILD)
        self.write(ROOT, item("SubAgentActivity", kind="started", agent_thread_id=CHILD))
        self.write(CHILD, item("SubAgentActivity", kind="started", agent_thread_id=GRANDCHILD), event("task_complete"))
        self.write(GRANDCHILD, event("task_started"))
        self.finish()
        self.assertEqual(self.inspect(), ("background", ""))
        self.write(GRANDCHILD, item("CommandExecution", status="in_progress", process_id="2"), event("turn_aborted"))
        self.assertEqual(self.inspect(), ("background", ""))
        self.write(GRANDCHILD, item("CommandExecution", status="completed", process_id="2", exit_code=0))
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_child_reactivation_revokes_green(self):
        self.make(CHILD, ROOT)
        self.write(ROOT, item("SubAgentActivity", kind="started", agent_thread_id=CHILD))
        self.write(CHILD, event("task_complete"))
        self.finish()
        self.assertEqual(self.inspect(), ("settling", ""))
        self.write(CHILD, event("task_started", turn_id="new"))
        self.assertEqual(self.inspect(), ("background", ""))

    def test_unknown_or_foreign_child_prevents_green(self):
        self.make(CHILD, "another-root")
        self.write(ROOT, item("SubAgentActivity", kind="started", agent_thread_id=CHILD))
        self.finish()
        self.assertEqual(self.inspect(), ("unknown", ""))
        self.assertEqual(self.record["completionDiagnostics"]["coverage"], "limited")

    def test_code_cell_remains_active_until_its_own_wait_completes(self):
        self.write(ROOT, response("custom_tool_call", name="exec", input="await something();"),
            response("custom_tool_call_output", output="Script running with cell ID 7\nWall time 1s\nOutput:\n"))
        self.finish()
        self.assertEqual(self.inspect(), ("background", ""))
        self.write(ROOT, response("function_call", "wait1", name="wait", arguments='{"cell_id":"8"}'),
            response("function_call_output", "wait1", output="Script completed\n"))
        self.assertEqual(self.inspect(), ("background", ""))
        self.write(ROOT, response("function_call", "wait2", name="wait", arguments='{"cell_id":"7"}'),
            response("function_call_output", "wait2", output=[{"type":"input_text","text":"Script completed\nOutput:\n"}]))
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_uncollected_passive_poll_finishes_only_when_its_command_exits(self):
        code = 'const r = await tools.write_stdin({session_id:101,chars:"",yield_time_ms:60000,max_output_tokens:300});\ntext(JSON.stringify(r));'
        self.write(ROOT, item("CommandExecution", status="in_progress", process_id="101"),
            response("custom_tool_call", name="exec", input=code),
            response("custom_tool_call_output", output="Script running with cell ID 241\n"))
        self.finish()
        self.assertEqual(self.inspect(), ("background", ""))
        self.write(ROOT, item("CommandExecution", id="other", status="completed", process_id="102", exit_code=0))
        self.assertEqual(self.inspect(), ("background", ""))
        self.write(ROOT, item("CommandExecution", status="completed", process_id="101", exit_code=0))
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_passive_poll_cannot_hide_a_monitor_loop_or_later_work(self):
        valid = 'text(await tools.write_stdin({session_id:101,chars:""}));'
        self.assertEqual(rollout.passive_poll(valid), "101")
        for code in (valid+'await later();', 'while(true){'+valid+'}', valid.replace('chars:""','chars:"stop"'),
                     valid.replace('session_id:101','session_id:101,session_id:102')):
            self.assertIsNone(rollout.passive_poll(code))

    def test_large_image_is_streamed_without_storing_its_contents(self):
        self.write(ROOT, response("custom_tool_call", name="exec", input="image(result);"),
            response("custom_tool_call_output", output=[{"type":"input_text","text":"Script completed\nOutput:\n"},
                {"type":"input_image","image_url":"data:image/png;base64," + "secret" * (2 * 1024 * 1024)}]))
        self.finish()
        self.assertEqual(self.inspect(), ("unknown", ""))
        self.assertNotIn("secret", json.dumps(self.record))
        self.assertEqual(self.inspect(), ("settling", ""))

    def test_partial_row_cannot_keep_green(self):
        self.finish()
        self.assertEqual(self.inspect(), ("settling", ""))
        with self.paths[ROOT].open('a') as f: f.write('{"type":')
        self.assertEqual(self.inspect(), ("unknown", ""))

    def test_same_size_rewrite_invalidates_cached_completion(self):
        self.finish()
        self.assertEqual(self.inspect(), ("settling", ""))
        path = self.paths[ROOT]
        before = path.stat()
        content = path.read_text().replace('task_complete', 'task_started ')
        path.write_text(content)
        os.utime(path, ns=(before.st_atime_ns, before.st_mtime_ns + 1000000))
        self.assertEqual(path.stat().st_size, before.st_size)
        self.assertNotEqual(self.inspect(), ("settling", ""))

    def test_goal_store_keeps_active_paused_and_blocked_work_distinct(self):
        db=self.home/'goals_1.sqlite'
        connection=sqlite3.connect(db)
        self.addCleanup(connection.close)
        connection.execute('CREATE TABLE thread_goals(thread_id TEXT, status TEXT)')
        connection.execute('INSERT INTO thread_goals VALUES (?,?)',(ROOT,'active'))
        connection.commit()
        self.finish()
        for status, expected in (('active',('background','')),('paused',('background','')),
                                 ('blocked',('waiting','decision')),('complete',('settling',''))):
            connection.execute('UPDATE thread_goals SET status=?',(status,)); connection.commit()
            self.assertEqual(self.inspect(),expected)

    def test_unknown_database_schema_is_not_assumed_to_have_no_goal(self):
        db=self.home/'goals_1.sqlite'
        connection=sqlite3.connect(db)
        connection.execute('CREATE TABLE unfamiliar(value TEXT)')
        connection.close()
        self.finish()
        self.assertEqual(self.inspect(),('unknown',''))

    def test_unchanged_history_is_not_replayed(self):
        self.finish(); self.inspect()
        with patch.object(rollout,'consume',side_effect=AssertionError('old row reread')):
            self.assertEqual(self.inspect(),('settling',''))
