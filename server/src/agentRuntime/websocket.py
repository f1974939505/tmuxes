"""Minimal RFC6455 transport for private Unix-socket Codex connections.

No TCP listener, extensions, compression, authentication bypass, or reconnect.
The parent directory is mode 0700. Codex's proxy handles upstream transport.
"""
import base64
import hashlib
import json
import os
import socket
import struct
import threading

LIMIT = 64 * 1024 * 1024


class WebSocket:
    def __init__(self, conn, client=False):
        self.conn = conn
        self.client = client
        self.file = conn.makefile("rb")
        self.lock = threading.Lock()
        self.fragment = bytearray()
        self.fragmenting = False

    def handshake(self, timeout=10):
        self.conn.settimeout(timeout)
        if self.client:
            key = base64.b64encode(os.urandom(16)).decode()
            self.conn.sendall(("GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n"
                               "Connection: Upgrade\r\nSec-WebSocket-Version: 13\r\n"
                               "Sec-WebSocket-Key: " + key + "\r\n\r\n").encode())
        request = self.file.readline(8193)
        if (not request.startswith(b"HTTP/1.1 101 " if self.client else b"GET ") or len(request) > 8192):
            raise ValueError("Invalid WebSocket request/response: " + request[:100].decode('ascii', errors='replace').strip())
        headers = {}
        size = 0
        while True:
            line = self.file.readline(8193)
            size += len(line)
            if not line or size > 16384:
                raise ValueError("Invalid WebSocket headers")
            if line == b"\r\n":
                break
            header_name, value = line.decode("ascii").split(":", 1)
            headers[header_name.lower()] = value.strip()
        if self.client:
            expected = base64.b64encode(hashlib.sha1(
                (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
            if headers.get("sec-websocket-accept") != expected:
                raise ValueError("Invalid upstream WebSocket upgrade")
            self.conn.settimeout(None)
            return
        key = headers.get("sec-websocket-key", "")
        if (headers.get("upgrade", "").lower() != "websocket"
                or headers.get("sec-websocket-version") != "13"
                or len(base64.b64decode(key, validate=True)) != 16):
            raise ValueError("Invalid WebSocket upgrade")
        accept = base64.b64encode(hashlib.sha1(
            (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        self.conn.sendall(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                           "Connection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n").encode())
        self.conn.settimeout(None)

    def exact(self, count):
        data = self.file.read(count)
        if len(data) != count:
            raise EOFError()
        return data

    def receive(self):
        while True:
            a, b = self.exact(2)
            final, opcode = bool(a & 128), a & 15
            if a & 112 or bool(b & 128) == self.client:
                raise ValueError("Invalid client frame")
            size = b & 127
            if size == 126:
                size = struct.unpack("!H", self.exact(2))[0]
            elif size == 127:
                size = struct.unpack("!Q", self.exact(8))[0]
            if size + len(self.fragment) > LIMIT:
                raise ValueError("WebSocket message too large")
            if opcode >= 8 and (not final or size > 125):
                raise ValueError("Invalid control frame")
            if b & 128:
                mask = self.exact(4)
                data = bytes(v ^ mask[i % 4] for i, v in enumerate(self.exact(size)))
            else:
                data = self.exact(size)
            if opcode == 8:
                self.send(data, 8)
                raise EOFError()
            if opcode == 9:
                self.send(data, 10)
                continue
            if opcode == 10:
                continue
            if opcode not in (0, 1) or (opcode == 0 and not self.fragmenting) or (opcode == 1 and self.fragmenting):
                raise ValueError("Unexpected WebSocket opcode")
            self.fragmenting = not final
            self.fragment.extend(data)
            if final:
                data = bytes(self.fragment)
                self.fragment.clear()
                return json.loads(data.decode("utf-8"))

    def send(self, data, opcode=1):
        if not isinstance(data, bytes):
            data = json.dumps(data, separators=(",", ":")).encode()
        size = len(data)
        header = bytes([128 | opcode])
        maskbit = 128 if self.client else 0
        if size < 126:
            header += bytes([maskbit | size])
        elif size < 65536:
            header += bytes([maskbit | 126]) + struct.pack("!H", size)
        else:
            header += bytes([maskbit | 127]) + struct.pack("!Q", size)
        if self.client:
            mask = os.urandom(4)
            header += mask
            data = bytes(v ^ mask[i % 4] for i, v in enumerate(data))
        with self.lock:
            self.conn.sendall(header + data)

    def close(self):
        try:
            self.conn.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.conn.close()
