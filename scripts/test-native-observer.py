"""Isolated Linux tmux integration: installed hooks and bare typed commands.

No user configuration, credentials, model calls, or shared tmux servers.
"""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "server/src/agentRuntime"
label = "tmuxes-native-test-" + uuid.uuid4().hex[:10]


def tmux(*args):
    return subprocess.check_output(["tmux", "-L", label, *args], text=True).strip()


with tempfile.TemporaryDirectory(prefix="tmuxes-native-test-") as temp:
    home = Path(temp)
    binpath = home / "bin"
    binpath.mkdir()
    fake = binpath / "claude"
    fake.write_text('''#!/usr/bin/env python3
import json, os, pathlib, shlex, subprocess, time
home = pathlib.Path.home()
config = json.loads((home / '.claude/settings.json').read_text())
sid = 'manual-root'
def event(name, **extra):
    for group in config['hooks'].get(name, []):
        for hook in group['hooks']:
            subprocess.run(shlex.split(hook['command']), input=json.dumps(dict(
                hook_event_name=name, session_id=sid, **extra)), text=True, check=True)
event('SessionStart')
event('UserPromptSubmit', prompt='not-persisted-secret')
previous = ''
while True:
    command = (home / 'phase').read_text() if (home / 'phase').exists() else ''
    if command != previous:
        previous = command
        if command == 'decision': event('Notification', notification_type='permission_prompt')
        elif command == 'background':
            event('PostToolUse', tool_use_id='prompt')
            event('Stop', background_tasks=[{'id':'monitor'}], session_crons=[])
        elif command == 'done': event('Stop', background_tasks=[], session_crons=[])
        elif command == 'resume':
            sid = 'resumed-root'
            event('SessionStart')
            event('UserPromptSubmit')
        elif command == 'exit': break
    time.sleep(.05)
''')
    fake.chmod(0o700)
    env = {**os.environ, "HOME": temp, "PATH": str(binpath) + ":" + os.environ["PATH"]}
    env.pop("CLAUDE_CONFIG_DIR", None)
    subprocess.run([sys.executable, str(RUNTIME / "install_native.py"), "claude"], env=env, check=True)
    installed = home / ".local/share/tmuxes/observer/native.py"
    try:
        shell = shlex.join(["env", "HOME=" + temp, "PATH=" + env["PATH"], "bash", "--noprofile", "--norc"])
        tmux("-f", "/dev/null", "new-session", "-d", "-s", "manual", "-c", temp, shell)
        sock = tmux("display-message", "-p", "-t", "manual", "#{socket_path}")
        env["TMUX"] = sock + ",0,0"
        tmux("send-keys", "-t", "manual", "-l", "claude")
        tmux("send-keys", "-t", "manual", "Enter")

        def snapshot():
            raw = subprocess.check_output([sys.executable, str(installed), "snapshot"], env=env, text=True)
            return json.loads(raw.removeprefix("TMUXES_NATIVE_V1="))

        def wait(state, session="manual", sid="manual-root"):
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                records = snapshot()["observers"]
                if any(x["id"] == sid and x["state"] == state and x["session"] == session for x in records):
                    return records
                time.sleep(.1)
            raise AssertionError((state, records, tmux("capture-pane", "-p", "-t", session)))

        wait("running")
        for command, state in (("decision", "waiting"), ("background", "background"), ("done", "idle")):
            (home / "phase").write_text(command)
            wait(state)
        tmux("rename-session", "-t", "manual", "renamed")
        wait("idle", "renamed")
        (home / "phase").write_text("resume")
        records = wait("running", "renamed", "resumed-root")
        assert not any(x["id"] == "manual-root" for x in records), records
        # A daemon-like helper inheriting TMUX_PANE is outside the pane's
        # process tree, and must remain unbound even though its cwd matches.
        subprocess.run([sys.executable, str(installed), "claude"], env={**env, "TMUX_PANE": "%0"},
                       input=json.dumps({"hook_event_name": "UserPromptSubmit", "session_id": "unbound"}), text=True, check=True)
        records = snapshot()["observers"]
        assert any(x["id"] == "unbound" and x["session"] is None for x in records)
        for path in (home / ".cache/tmuxes/observations").glob("*.json"):
            assert "not-persisted-secret" not in path.read_text()
        (home / "phase").write_text("exit")
        time.sleep(.3)
        records = snapshot()["observers"]
        assert not any(x["id"] == "resumed-root" and x["session"] for x in records)
        print("Native install + bare command + decision/background/done + rename/resume + stale-pane rejection: PASS")
    finally:
        tmux("kill-server")
