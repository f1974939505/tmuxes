"""Isolated tmux + synthetic Codex backend test. Never contacts an account/cluster."""
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
home=pathlib.Path.home()
token=os.environ['TMUXES_CODEX_BINDING']
phase=home/(token+'.phase')
if sys.argv[1]=='app-server':
    sock=socket.socket(socket.AF_UNIX); sock.bind(sys.argv[-1][7:]); sock.listen()
    previous=''
    while True:
        current=phase.read_text() if phase.exists() else ''
        if current and current!=previous:
            previous=current
            subprocess.run([sys.executable,os.environ['TEST_NATIVE'],'codex'],input=json.dumps({'hook_event_name':'SessionStart','session_id':current}),text=True,check=True,stdout=subprocess.DEVNULL)
        time.sleep(.05)
else:
    assert sys.argv[1]=='--remote'
    phase.write_text('root-'+os.environ['TMUX_PANE'])
    while not (home/(token+'.exit')).exists(): time.sleep(.05)
''')
    fake.chmod(0o700)
    native.STORE = home / ".cache/tmuxes/observations"
    env = {**os.environ, "HOME": tmp, "CODEX_HOME": str(home / ".codex"),
           "PATH": str(bins) + ":" + os.environ["PATH"], "TEST_NATIVE": str(Path(native.__file__))}
    shell = shlex.join(["env"] + [key + "=" + env[key] for key in ("HOME", "CODEX_HOME", "PATH", "TEST_NATIVE")] + ["bash", "--noprofile", "--norc"])
    try:
        for name in ("one", "two"):
            tmux("-f", "/dev/null", "new-session", "-d", "-s", name, shell)
            tmux("send-keys", "-t", name, "-l", shlex.join([sys.executable, str(Path(native.__file__)), "launch", "codex"]))
            tmux("send-keys", "-t", name, "Enter")
        sock = tmux("display-message", "-p", "-t", "one", "#{socket_path}")
        def rows():
            with patch.dict(os.environ, {"TMUX": sock + ",0,0"}), patch.object(native, "ReadOnlyCodex", side_effect=OSError("synthetic backend")):
                return native.snapshot()["observers"]
        for _ in range(100):
            data = rows()
            if len(data) == 2 and {r['session'] for r in data} == {'one','two'}: break
            time.sleep(.1)
        else: raise AssertionError(data)
        claims = [json.loads(p.read_text()) for p in native.STORE.glob('*.claim')]
        assert len(claims)==2 and len({c['endpoint'] for c in claims})==2
        first = next(c for c in claims if c['binding']['pane']==next(r['pane'] for r in data if r['session']=='one'))
        token=first['binding']['token']
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
        assert native.alive(first['backend']), 'Exiting the TUI killed background work'
        print('Two panes + private backend identity + resume + TUI exit unbind + background survival: PASS')
    finally:
        subprocess.run(['tmux','-L',label,'kill-server'], stderr=subprocess.DEVNULL)
        for path in native.STORE.glob('*.claim'):
            claim=json.loads(path.read_text())
            if native.alive(claim['backend']): os.kill(claim['backend']['pid'], signal.SIGTERM)
