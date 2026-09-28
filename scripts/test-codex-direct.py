"""Real isolated official Codex backend; concurrent direct clients, no model turns."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server/src/agentRuntime'))
from native import ReadOnlyCodex

with tempfile.TemporaryDirectory(prefix='tmuxes-direct-') as tmp:
    endpoint = str(Path(tmp) / 'server.sock')
    with (Path(tmp) / 'server.log').open('w') as log:
        proc = subprocess.Popen([sys.argv[1], 'app-server', '--listen', 'unix://' + endpoint],
                                env={**os.environ, 'CODEX_HOME': tmp}, stdout=log, stderr=log)
        try:
            for _ in range(100):
                if Path(endpoint).exists(): break
                if proc.poll() is not None: raise AssertionError('Backend exited')
                time.sleep(.1)
            first = ReadOnlyCodex(tmp, time.monotonic()+20, endpoint)
            second = ReadOnlyCodex(tmp, time.monotonic()+20, endpoint)
            try:
                # Test-client mutation creates an empty thread; the observer's
                # public request method still forbids every mutation.
                thread = first._request('thread/start', {'cwd': tmp})['thread']
                assert second.request('thread/read', {'threadId': thread['id']})['thread']['id'] == thread['id']
                second.request('thread/list', {'limit': 1})
                second.close()
                assert first.request('thread/read', {'threadId': thread['id']})['thread']['id'] == thread['id']
                print('Official direct Unix server + simultaneous picker/read clients + independent close: PASS')
            finally:
                first.close()
                second.close()
        finally:
            proc.terminate()
            proc.wait(timeout=10)
