"""Isolated tmux + direct synthetic Codex TUI test. Never contacts an account/cluster."""
import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server/src/agentRuntime"))
import native

label = "tmuxes-bound-" + uuid.uuid4().hex[:10]
def tmux(*args):
    return subprocess.check_output(["tmux", "-L", label, *args], text=True).strip()

with tempfile.TemporaryDirectory(prefix="tmuxes-binding-test-") as tmp:
    home = Path(tmp)
    bins = home / "bin"
    bins.mkdir()
    fake = bins / "codex"
    fake.write_text('''#!/usr/bin/env python3
import json,os,pathlib,socket,subprocess,sys,time
if sys.argv[1:] == ['--help']:
    print('--no-daemon'); sys.exit(0)
assert sys.argv[1] == '--no-daemon', sys.argv
home=pathlib.Path.home()
token=os.environ['TMUX_PANE']
phase=home/(token+'.phase')
phase.write_text('root-'+os.environ['TMUX_PANE'])
previous=''
while not (home/(token+'.exit')).exists():
    current=phase.read_text()
    if current!=previous:
        previous=current
        for event in ('SessionStart','UserPromptSubmit'):
            subprocess.run([sys.executable,os.environ['TEST_NATIVE'],'codex'],input=json.dumps({'hook_event_name':event,'session_id':current}),text=True,check=True,stdout=subprocess.DEVNULL)
    time.sleep(.05)
''')
    fake.chmod(0o700)
    native.STORE = home / ".cache/tmuxes/observations"
    env = {**os.environ, "HOME": tmp, "CODEX_HOME": str(home / ".codex"),
           "PATH": str(bins) + ":" + os.environ["PATH"], "TEST_NATIVE": str(Path(native.__file__))}
    shell = shlex.join(["env"] + [key + "=" + env[key] for key in ("HOME", "CODEX_HOME", "PATH", "TEST_NATIVE")] + ["bash", "--noprofile", "--norc"])
    try:
        for name in ("one", "two"):
            tmux("-f", "/dev/null", "new-session", "-d", "-s", name, shell)
            tmux("send-keys", "-t", name, "-l", "codex --no-daemon")
            tmux("send-keys", "-t", name, "Enter")
        sock = tmux("display-message", "-p", "-t", "one", "#{socket_path}")
        def rows():
            with patch.dict(os.environ, {"TMUX": sock + ",0,0"}), patch.object(native, "ReadOnlyCodex", side_effect=OSError("synthetic backend")):
                return native.snapshot()["observers"]
        for _ in range(100):
            data = rows()
            if len(data) == 2 and {r['session'] for r in data} == {'one','two'} and all(r['state']=='running' for r in data): break
            time.sleep(.1)
        else: raise AssertionError(data)
        assert not list(native.STORE.glob('*.claim')), 'Direct launch must not need a claim'
        token = next(r['pane'] for r in data if r['session']=='one')
        records = [json.loads(p.read_text()) for p in native.STORE.glob('*.json')]
        assert all(r['binding']['proof']=='foreground-direct-v1' for r in records), records
        (home/(token+'.phase')).write_text('resumed-root')
        for _ in range(100):
            data=rows()
            if any(r['id']=='resumed-root' and r['session']=='one' for r in data): break
            time.sleep(.1)
        assert len(data)==2, data
        (home/(token+'.exit')).touch()
        for _ in range(100):
            data=rows()
            if all(r['session'] is None for r in data if r['id']=='resumed-root'): break
            time.sleep(.1)
        assert all(r['session'] is None for r in data if r['id']=='resumed-root'), data
        assert not (native.STORE/(token+'.claim')).exists(), 'Exit left a launch claim'
        print('Direct codex --no-daemon + two panes + hook ancestry + resume + exit cleanup: PASS')
    finally:
        subprocess.run(['tmux','-L',label,'kill-server'], stderr=subprocess.DEVNULL)
