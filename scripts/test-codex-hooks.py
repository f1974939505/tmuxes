"""Opt-in official Codex hook contract check using a loopback model fixture.

No account, real model, user config, tmux, SSH or cluster access. Hook trust is
bypassed only for the generated, vetted capture script in the isolated home.
"""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server/src/agentRuntime"))
import codex_foreground
from state import State


class Fixture(BaseHTTPRequestHandler):
    calls = 0
    def log_message(self, *args):
        pass

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        type(self).calls += 1
        message = {"type": "message", "id": "msg_fixture", "role": "assistant",
                   "status": "completed", "phase": "final_answer",
                   "content": [{"type": "output_text", "text": "fixture complete", "annotations": []}]}
        if len(sys.argv) > 2 and type(self).calls == 1:
            shell = sys.argv[2] == "shell"
            message = {"type": "function_call", "id": "fc_fixture", "call_id": "call_fixture",
                "name": "exec_command" if shell else "get_goal",
                "arguments": json.dumps({"cmd": "echo fixture"}) if shell else "{}"}
        added = {**message, "status": "in_progress"}
        if message["type"] == "message":
            added["content"] = []
        events = [
            {"type": "response.created", "response": {"id": "resp_fixture", "status": "in_progress", "output": []}},
            {"type": "response.output_item.added", "output_index": 0, "item": added},
        ]
        if message["type"] == "message":
            events.append({"type": "response.output_text.delta", "output_index": 0, "content_index": 0, "item_id": message["id"], "delta": "fixture complete"})
        events += [
            {"type": "response.output_item.done", "output_index": 0, "item": message},
            {"type": "response.completed", "response": {"id": "resp_fixture", "status": "completed", "output": [message],
                "usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2}}},
        ]
        body = b"".join(("data: " + json.dumps(event) + "\n\n").encode() for event in events)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="tmuxes-codex-hooks-") as temporary:
            home = Path(temporary)
            capture = home / "capture.py"
            events = home / "hooks.jsonl"
            capture.write_text("import json,sys\np=json.load(sys.stdin)\n"
                "p={k:p[k] for k in ('hook_event_name','session_id','turn_id','source','transcript_path','tool_name','tool_use_id','tool_response') if k in p}\n"
                "with open(" + repr(str(events)) + ", 'a', encoding='utf-8') as f: f.write(json.dumps(p)+'\\n')\n"
                "print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny', 'permissionDecisionReason': 'Isolated fixture rejection'}}) if p.get('hook_event_name')=='PreToolUse' and p.get('tool_name')=='Bash' else '{}')\n", encoding="utf-8")
            command = subprocess.list2cmdline([sys.executable, str(capture)]) if os.name == "nt" else shlex.join([sys.executable, str(capture)])
            (home / "hooks.json").write_text(json.dumps({"hooks": {name: [{"hooks": [{"type": "command", "command": command}]}]
                for name in ("SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SessionEnd")}}))
            (home / "config.toml").write_text('model = "tmuxes-fixture"\nmodel_provider = "fixture"\n'
                'check_for_update_on_startup = false\n[model_providers.fixture]\nname = "Loopback fixture"\n'
                f'base_url = "http://127.0.0.1:{server.server_port}/v1"\nwire_api = "responses"\n'
                'requires_openai_auth = false\nrequest_max_retries = 0\nstream_max_retries = 0\n')
            env = {k: v for k, v in os.environ.items() if k not in ("OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL")}
            env["CODEX_HOME"] = str(home)
            result = subprocess.run([sys.argv[1] if len(sys.argv) > 1 else "codex", "exec", "--skip-git-repo-check",
                "--dangerously-bypass-hook-trust", "-C", temporary, "Reply with the fixture response."],
                env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=45)
            if result.returncode:
                raise AssertionError(result.stderr.decode("utf-8", "replace")[-2000:])
            record, state = {}, State(lambda: 100)
            hooks = [json.loads(line) for line in events.read_text().splitlines()]
            for event in hooks:
                if event["hook_event_name"] != "SessionEnd":
                    codex_foreground.hook(record, state, event)
            print("Official hooks:", [event["hook_event_name"] for event in hooks])
            if len(sys.argv) > 2 and sys.argv[2] == "shell":
                assert any(event["hook_event_name"] == "PreToolUse" for event in hooks)
                assert not any(event["hook_event_name"] == "PostToolUse" for event in hooks)
                observed = codex_foreground.evidence(record["foreground"]["transcript"])
                assert observed["failed_launches"]
            codex_foreground.inspect(record, state)
            assert state.snapshot() == ("settling", ""), (record, state.snapshot())
            state.clock = lambda: 102
            assert state.snapshot() == ("idle", "done")
            print("Official Codex + loopback fixture + hooks + completion: PASS")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

