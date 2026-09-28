import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "agentRuntime"))
import hermes_plugin
from state import State


class HermesTests(unittest.TestCase):
    def setUp(self):
        self.state = State(lambda: 100)
        self.hooks = {}
        state = self.state
        class Connection:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def settimeout(self, timeout): pass
            def connect(self, path): pass
            def sendall(self, data): state.apply(json.loads(data))
        self.environment = patch.dict(os.environ, {
            'TMUXES_HERMES_PLUGIN': Path(hermes_plugin.__file__).parent.name,
            'TMUXES_EVENT_SOCKET': 'test.sock',
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.socket = patch.object(hermes_plugin, 'socket', types.SimpleNamespace(
            AF_UNIX=1, SOCK_STREAM=1, socket=lambda *args: Connection()))
        self.socket.start()
        self.addCleanup(self.socket.stop)
        ctx = types.SimpleNamespace(register_hook=lambda name, fn: self.hooks.update({name: fn}))
        hermes_plugin.register(ctx)
        self.hooks['pre_llm_call'](session_id='root')

    def test_smart_approval_never_alerts(self):
        self.hooks['pre_approval_request'](surface='smart', tool_call_id='x')
        self.assertEqual(self.state.snapshot(), ('running', ''))
        self.hooks['pre_approval_request'](surface='cli', tool_call_id='x')
        self.assertEqual(self.state.snapshot(), ('waiting', 'decision'))
        self.hooks['post_approval_response'](surface='cli', tool_call_id='x', choice='once')
        self.assertEqual(self.state.snapshot(), ('running', ''))

    def test_background_process_suppresses_end(self):
        module = types.ModuleType('tools.process_registry')
        module.process_registry = types.SimpleNamespace(count_running=lambda: 1)
        with patch.dict(sys.modules, {'tools': types.ModuleType('tools'), 'tools.process_registry': module}):
            self.hooks['on_session_end'](session_id='root', completed=True)
        self.assertEqual(self.state.snapshot(), ('background', ''))

    def test_child_end_does_not_finish_root(self):
        self.hooks['subagent_start'](child_session_id='child')
        self.hooks['pre_llm_call'](session_id='child', parent_session_id='root')
        self.hooks['on_session_end'](session_id='child', completed=True)
        self.assertEqual(self.state.snapshot(), ('running', ''))

    def test_failed_and_interrupted_turns_are_distinct(self):
        self.hooks['on_session_end'](session_id='root', interrupted=True)
        self.assertEqual(self.state.snapshot(), ('unknown', ''))
        self.hooks['pre_llm_call'](session_id='root')
        self.hooks['on_session_end'](session_id='root', completed=False)
        self.assertEqual(self.state.snapshot(), ('idle', 'error'))

    def test_no_registry_means_no_completion_claim(self):
        with patch.dict(sys.modules, {'tools.process_registry': None}):
            self.hooks['on_session_end'](session_id='root', completed=True)
        self.assertEqual(self.state.snapshot(), ('unknown', ''))
