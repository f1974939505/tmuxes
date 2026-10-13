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
import codex_history
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
            shell = sys.argv[2] in ("shell", "exec")
            message = {"type": "function_call", "id": "fc_fixture", "call_id": "call_fixture",
                "name": "exec_command" if shell else "get_goal",
                "arguments": json.dumps({"cmd": "echo fixture", "shell": os.environ.get("ComSpec", "cmd.exe") if os.name == "nt" else "/bin/sh", "login": False}) if shell else "{}"}
            if sys.argv[2].startswith("code"):
                args = {"cmd": "echo fixture", "shell": os.environ.get("ComSpec", "cmd.exe") if os.name == "nt" else "/bin/sh", "login": False}
                if sys.argv[2] == "code-failure":
                    args["workdir"] = "/tmuxes-fixture-missing-directory"
                script = "text(await tools.exec_command(" + json.dumps(args) + "));"
                if sys.argv[2] == "code-image":
                    script = 'text(await tools.view_image({path:"/tmuxes-fixture-missing-image.png"}));'
                if sys.argv[2] == "code-goal":
                    script = 'text(await tools.get_goal({}));'
                if sys.argv[2] == "code-goal-cycle":
                    script = 'text(await tools.create_goal({objective:"Complete the isolated fixture"}));'
                message = {"type": "custom_tool_call", "id": "ct_fixture", "call_id": "call_fixture", "name": "exec", "input": script}
        if len(sys.argv) > 2 and sys.argv[2] == "code-goal-cycle" and type(self).calls == 2:
            message = {"type": "custom_tool_call", "id": "ct_fixture2", "call_id": "call_fixture2", "name": "exec", "input": 'text(await tools.update_goal({status:"complete"}));'}
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
                "print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny', 'permissionDecisionReason': 'Isolated fixture rejection'}}) if "
                + repr(len(sys.argv) > 2 and sys.argv[2] == 'shell')
                + " and p.get('hook_event_name')=='PreToolUse' and p.get('tool_name')=='Bash' else '{}')\n", encoding="utf-8")
            command = subprocess.list2cmdline([sys.executable, str(capture)]) if os.name == "nt" else shlex.join([sys.executable, str(capture)])
            (home / "hooks.json").write_text(json.dumps({"hooks": {name: [{"hooks": [{"type": "command", "command": command}]}]
                for name in ("SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SessionEnd")}}))
            (home / "config.toml").write_text('model = "tmuxes-fixture"\nmodel_provider = "fixture"\n'
                'check_for_update_on_startup = false\n[model_providers.fixture]\nname = "Loopback fixture"\n'
                f'base_url = "http://127.0.0.1:{server.server_port}/v1"\nwire_api = "responses"\n'
                'requires_openai_auth = false\nrequest_max_retries = 0\nstream_max_retries = 0\n')
            if len(sys.argv) > 2 and sys.argv[2].startswith("code"):
                with (home / "config.toml").open("a") as config:
                    config.write('\n[features]\ncode_mode = true\n')
            env = {k: v for k, v in os.environ.items() if k not in ("OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL")}
            env["CODEX_HOME"] = str(home)
            result = subprocess.run([sys.argv[1] if len(sys.argv) > 1 else "codex", "exec", "--skip-git-repo-check", "--sandbox", "danger-full-access",
                "--dangerously-bypass-hook-trust", "-C", temporary, "Reply with the fixture response."],
                env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=45)
            if result.returncode:
                raise AssertionError(result.stderr.decode("utf-8", "replace")[-2000:])
            record, state = {}, State(lambda: 100)
            hooks = [json.loads(line) for line in events.read_text().splitlines()]
            record.update(id=hooks[0]["session_id"], scope=str(home))
            if os.environ.get("TMUXES_FIXTURE_OUTPUT"):
                import shutil
                destination = Path(os.environ["TMUXES_FIXTURE_OUTPUT"])
                destination.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(events, destination / "hooks.jsonl")
                transcripts = list(home.glob("sessions/**/*.jsonl"))
                if transcripts:
                    shutil.copyfile(transcripts[0], destination / "rollout.jsonl")
                import sqlite3
                from contextlib import closing
                schemas = {}
                for database in home.glob("goals_*.sqlite"):
                    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as connection:
                        schemas[database.name] = connection.execute("SELECT name,sql FROM sqlite_master WHERE name LIKE '%goal%'").fetchall()
                (destination / "goal-schema.json").write_text(json.dumps(schemas))
                (destination / "files.json").write_text(json.dumps([str(p.relative_to(home)) for p in home.rglob('*') if p.is_file()]))
            omit_post = len(sys.argv) > 2 and sys.argv[2] == "exec"
            for event in hooks:
                if event["hook_event_name"] != "SessionEnd" and not (omit_post and event["hook_event_name"] == "PostToolUse"):
                    codex_foreground.hook(record, state, event)
            print("Official hooks:", [event["hook_event_name"] for event in hooks])
            if len(sys.argv) > 2 and sys.argv[2].startswith("code"):
                assert any(event["hook_event_name"] == "PreToolUse" for event in hooks), 'Code-mode fixture did not execute a nested tool'
            if len(sys.argv) > 2 and sys.argv[2] == "shell":
                assert any(event["hook_event_name"] == "PreToolUse" for event in hooks)
                assert not any(event["hook_event_name"] == "PostToolUse" for event in hooks)
                observed = codex_foreground.evidence(record["foreground"]["transcript"])
                assert observed["failed_launches"]
            if omit_post:
                assert any(event["hook_event_name"] == "PreToolUse" for event in hooks)
                assert state.tasks  # deliberately dropped PostToolUse must be recovered
                items = [codex_history.item_state(json.loads(line)) for line in
                    Path(record["foreground"]["transcript"]).read_text(encoding="utf-8").splitlines()]
                assert any(item and item["ended"] and item.get("exitCode") == 0 for item in items), 'Fixture command did not finish successfully'
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

