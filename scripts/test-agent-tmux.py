"""Opt-in Linux integration: isolated tmux server, synthetic hooks, no accounts."""
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
label = 'tmuxes-test-' + uuid.uuid4().hex[:12]


def tmux(*args):
    return subprocess.check_output(['tmux', '-L', label, *args], text=True).strip()


def wait_phase(phase):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        value = tmux('show-option', '-v', '-t', '$0', '@tmuxes_agent')
        if ':' + phase + ':' in value:
            return value
        time.sleep(0.05)
    raise AssertionError((phase, tmux('capture-pane', '-p', '-t', '$0')))


with tempfile.TemporaryDirectory(prefix='tmuxes-hooks-test-') as temp:
    fake = Path(temp, 'fake-claude')
    fake.write_text('''#!/usr/bin/env python3
import json, os, subprocess, sys, time
settings=json.loads(sys.argv[2])
def hook(name, **kw):
    payload={'hook_event_name':name,'session_id':'root',**kw}
    cmd=settings['hooks'][name][-1]['hooks'][0]['command']
    subprocess.run(cmd,shell=True,input=json.dumps(payload),text=True,check=True)
hook('SessionStart')
hook('UserPromptSubmit')
time.sleep(1)
hook('Notification',notification_type='permission_prompt')
time.sleep(1)
hook('PostToolUse',tool_use_id='approval')
hook('Stop',background_tasks=[{'id':'monitor','type':'monitor'}],session_crons=[])
time.sleep(2)
hook('UserPromptSubmit')
hook('Stop',background_tasks=[],session_crons=[])
time.sleep(3)
''')
    fake.chmod(0o700)
    try:
        tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'smoke', '-c', temp)
        tmux('set-option', '-t', '$0', '@tmuxes_agent', 'claude:unknown::test:0')
        command = shlex.join([sys.executable, str(ROOT / 'server/src/agentRuntime/main.py'), 'claude', str(fake)])
        tmux('send-keys', '-t', '$0', '-l', command)
        tmux('send-keys', '-t', '$0', 'Enter')
        wait_phase('running')
        wait_phase('waiting:decision')
        wait_phase('background')
        tmux('rename-session', '-t', '$0', 'renamed')
        assert ':done:' not in tmux('show-option', '-v', '-t', '$0', '@tmuxes_agent')
        wait_phase('idle:done')
        tmux('set-option', '-t', '$0', '@tmuxes_agent_run', 'replacement')
        marker = 'codex:unknown::Replacement:new'
        tmux('set-option', '-t', '$0', '@tmuxes_agent', marker)
        time.sleep(2)
        assert tmux('show-option', '-v', '-t', '$0', '@tmuxes_agent') == marker
        print('tmux hook pipeline, rename, background suppression, ownership guard: PASS')
    finally:
        subprocess.run(['tmux', '-L', label, 'kill-server'], check=False)
