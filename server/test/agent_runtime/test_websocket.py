import base64
import json
import os
import socket
import struct
import sys
from pathlib import Path
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "agentRuntime"))
from websocket import WebSocket


def frame(data, opcode=1, final=True):
    mask = b'abcd'
    n = len(data)
    prefix = bytes([(128 if final else 0) | opcode])
    if n < 126:
        prefix += bytes([128 | n])
    elif n < 65536:
        prefix += bytes([128 | 126]) + struct.pack('!H', n)
    else:
        prefix += bytes([128 | 127]) + struct.pack('!Q', n)
    return prefix + mask + bytes(v ^ mask[i % 4] for i, v in enumerate(data))


class WebSocketTests(unittest.TestCase):
    def setUp(self):
        self.client, server = socket.socketpair()
        self.client.settimeout(2)
        self.ws = WebSocket(server)

    def tearDown(self):
        self.client.close()
        self.ws.close()
        self.ws.file.close()

    def test_upgrade(self):
        thread = threading.Thread(target=self.ws.handshake)
        thread.start()
        key = base64.b64encode(os.urandom(16))
        self.client.sendall(b'GET / HTTP/1.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                            b'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ' + key + b'\r\n\r\n')
        self.assertIn(b'101 Switching Protocols', self.client.recv(4096))
        thread.join(2)
        self.assertFalse(thread.is_alive())

    def test_fragmentation_and_ping(self):
        self.client.sendall(frame(b'{"id":', final=False) + frame(b'ping', 9) + frame(b'1}', 0))
        self.assertEqual(self.ws.receive(), {"id": 1})
        self.assertEqual(self.client.recv(10), b'\x8a\x04ping')

    def test_large_unicode_payload_roundtrip(self):
        data = {"text": "中文" * 40000}
        thread = threading.Thread(target=lambda: self.client.sendall(frame(json.dumps(data).encode())))
        thread.start()
        self.assertEqual(self.ws.receive(), data)
        thread.join(2)

    def test_unmasked_client_is_rejected(self):
        self.client.sendall(b'\x81\x02{}')
        with self.assertRaises(ValueError):
            self.ws.receive()

    def test_client_and_server_interoperate(self):
        peer = WebSocket(self.client, client=True)
        thread = threading.Thread(target=self.ws.handshake)
        thread.start()
        peer.handshake()
        thread.join(2)
        peer.send({"method": "initialize", "id": 1})
        self.assertEqual(self.ws.receive()['method'], 'initialize')
        self.ws.send({"result": {}, "id": 1})
        self.assertEqual(peer.receive(), {"result": {}, "id": 1})
        peer.file.close()
