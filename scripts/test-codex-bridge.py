"""Opt-in Linux integration smoke; isolated CODEX_HOME, no model requests.

Usage: python3 scripts/test-codex-bridge.py /absolute/path/to/codex
"""
import base64
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import threading

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server/src/agentRuntime"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server/test/agent_runtime"))
from main import CodexBridge
from test_websocket import frame


def main():
    executable = str(Path(sys.argv[1]).resolve())
    with tempfile.TemporaryDirectory(prefix="tmuxes-codex-test-") as directory:
        os.environ["CODEX_HOME"] = directory
        os.environ.pop("OPENAI_API_KEY", None)
        os.environ.pop("CODEX_API_KEY", None)
        # No user plugins, MCPs, credentials, or model calls.
        Path(directory, "config.toml").write_text('check_for_update_on_startup = false\n')
        events = []
        bridge = None
        try:
            result = subprocess.run([executable, "app-server", "daemon", "start"], check=True,
                                    timeout=30, capture_output=True, text=True)
            socket_path = json.loads(result.stdout.strip().splitlines()[-1])["socketPath"]
            bridge = CodexBridge(socket_path, directory, events.append)
            worker = threading.Thread(target=bridge.run, daemon=True)
            worker.start()
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
                conn.settimeout(20)
                conn.connect(bridge.path)
                stream = conn.makefile('rb')
                key = base64.b64encode(os.urandom(16))
                conn.sendall(b'GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                             b'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ' + key + b'\r\n\r\n')
                assert b'101' in stream.readline()
                while stream.readline() != b'\r\n':
                    pass

                def send(message):
                    conn.sendall(frame(json.dumps(message).encode()))

                def receive():
                    a, b = stream.read(2)
                    n = b & 127
                    if n == 126:
                        n = struct.unpack('!H', stream.read(2))[0]
                    elif n == 127:
                        n = struct.unpack('!Q', stream.read(8))[0]
                    assert a == 129
                    return json.loads(stream.read(n))

                def request(key, method, params):
                    send({"id": key, "method": method, "params": params})
                    while True:
                        result = receive()
                        if result.get('id') == key:
                            assert 'error' not in result, (method, result.get('error'))
                            print(method + ': OK', flush=True)
                            return result['result']

                request(1, "initialize", {"clientInfo": {"name": "tmuxes-test", "version": "0.1"},
                                          "capabilities": {"experimentalApi": True}})
                send({"method": "initialized", "params": {}})
                result = request(2, "thread/start", {"cwd": directory})
                tid = result['thread']['id']
                request(3, "thread/read", {"threadId": tid})
                request(4, "thread/goal/get", {"threadId": tid})
                request(5, "thread/backgroundTerminals/list", {"threadId": tid, "limit": 100})
                request(6, "thread/list", {"ancestorThreadId": tid, "limit": 100})
                stream.close()
            print('Shared daemon bridge: PASS (no model turns)', flush=True)
        finally:
            if bridge:
                bridge.close()
            subprocess.run([executable, "app-server", "daemon", "stop"], timeout=15, check=False)


if __name__ == '__main__':
    main()
