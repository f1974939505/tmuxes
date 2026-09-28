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
import time
import uuid
from contextlib import contextmanager

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server/src/agentRuntime"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server/test/agent_runtime"))
from main import CodexBridge
from test_websocket import frame
from websocket import WebSocket
from native import ReadOnlyCodex, inspect_codex


@contextmanager
def picker_connection(path):
    conn = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    conn.connect(path)
    ws = WebSocket(conn, client=True)
    try:
        ws.handshake()
        conn.settimeout(5)

        def request(key, method, params):
            ws.send({"id": key, "method": method, "params": params})
            while True:
                result = ws.receive()
                if result.get('id') == key:
                    assert 'error' not in result, (method, result.get('error'))
                    return result['result']

        request(1, "initialize", {"clientInfo": {"name": "tmuxes-picker-test", "version": "0.1"},
                                  "capabilities": {"experimentalApi": True}})
        ws.send({"method": "initialized", "params": {}})
        yield request
    finally:
        ws.close()
        ws.file.close()


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
                observer = ReadOnlyCodex(directory)
                try:
                    assert observer.request("thread/read", {"threadId": tid})['thread']['id'] == tid
                    observer.request("thread/list", {"ancestorThreadId": tid, "sourceKinds": [
                        "subAgent", "subAgentReview", "subAgentCompact", "subAgentThreadSpawn", "subAgentOther"]})
                    assert inspect_codex({"id": tid, "state": {}}, observer).snapshot() == ("unknown", "")
                    try:
                        observer.request("thread/resume", {"threadId": tid})
                        raise AssertionError('Observer allowed a control method')
                    except ValueError:
                        pass
                finally:
                    observer.close()
                request(10, "thread/read", {"threadId": tid})
                print('Independent read-only observer: PASS', flush=True)
                # /resume opens an auxiliary app-server client while the TUI's
                # original connection is still alive. Exercise repeated opens.
                for _ in range(2):
                    before = len(events)
                    with picker_connection(bridge.path) as picker:
                        picker(2, "thread/list", {"limit": 10})
                        request(7, "thread/read", {"threadId": tid})
                    request(8, "thread/read", {"threadId": tid})
                    time.sleep(0.1)
                    assert len(events) == before, 'Picker changed main TUI attention state'
                # A new thread without a model turn has no on-disk rollout.
                # Supply synthetic history only in this isolated protocol test.
                request(9, "thread/resume", {"threadId": str(uuid.uuid4()), "history": [
                    {"type": "message", "role": "user", "content": [
                        {"type": "input_text", "text": "Synthetic test history"}]}]})
                with picker_connection(bridge.path) as replacement:
                    replacement_thread = replacement(2, "thread/start", {"cwd": directory})['thread']['id']
                    before = len(events)
                    conn.shutdown(socket.SHUT_RDWR)
                    stream.close()
                    replacement(3, "thread/read", {"threadId": replacement_thread})
                    time.sleep(0.1)
                    assert len(events) == before, 'Old TUI cleared replacement connection state'
                print('Concurrent session picker + resume: PASS', flush=True)
            with picker_connection(bridge.path) as picker:
                picker(2, "thread/list", {"limit": 10})
            print('Listener survives client replacement: PASS', flush=True)
            print('Shared daemon bridge: PASS (no model turns)', flush=True)
        finally:
            if bridge:
                bridge.close()
            subprocess.run([executable, "app-server", "daemon", "stop"], timeout=15, check=False)


if __name__ == '__main__':
    main()
