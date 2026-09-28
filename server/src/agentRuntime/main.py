"""Launch-local supervisor for POSIX tmux targets (Python 3.9+, stdlib only)."""
import hashlib
import json
import os
from pathlib import Path
import queue
import shlex
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import uuid

from claude import Claude, HOOKS
from codex import Codex
from state import State
from websocket import WebSocket

HERE = Path(__file__).resolve().parent


def tmux(*args):
    return subprocess.run(["tmux", *args], capture_output=True, text=True, timeout=5, check=True).stdout.strip()


class Supervisor:
    def __init__(self, kind, directory):
        self.kind = kind
        self.directory = directory
        self.events = queue.Queue(maxsize=4096)
        self.state = State()
        self.claude = Claude(self.state.apply)
        self.token = uuid.uuid4().hex
        self.session = tmux("display-message", "-p", "-t", os.environ["TMUX_PANE"], "#{session_id}")
        self.signature = None
        self.stopped = threading.Event()
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.event_path = str(Path(directory) / "events.sock")
        self.listener.bind(self.event_path)
        self.listener.listen(32)
        self.listener.settimeout(0.5)
        tmux("set-option", "-t", self.session, "@tmuxes_agent_run", self.token)
        self.publish()

    def emit(self, event):
        try:
            self.events.put(event, timeout=0.5)
        except queue.Full:
            # Losing events invalidates completion evidence.
            self.overflow = True

    def receive(self):
        while not self.stopped.is_set():
            try:
                conn, _ = self.listener.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            try:
                with conn:
                    conn.settimeout(1)
                    with conn.makefile("rb") as stream:
                        line = stream.readline(1024 * 1024 + 1)
                        if len(line) > 1024 * 1024:
                            raise ValueError("Oversized event")
                        event = json.loads(line)
                        if not isinstance(event, dict):
                            raise ValueError("Invalid event")
                        self.emit(event)
            except (OSError, ValueError):
                self.emit({"type": "unknown", "event": "InvalidEvent"})

    def publish(self):
        phase, reason = self.state.snapshot()
        signature = (phase, reason, tuple(sorted(self.state.requests)))
        if signature == self.signature:
            return
        self.signature = signature
        event = ''.join(c if c.isalnum() or c in '_.-' else '_' for c in self.state.event)
        value = ':'.join((self.kind, phase, reason, event, self.token + '.' + str(self.state.revision)))
        # Stable tmux session id survives renames. Atomic ownership guard keeps
        # a previous launcher/late child from overwriting a newer launch.
        tmux("if-shell", "-F", "-t", self.session,
             "#{==:#{@tmuxes_agent_run}," + self.token + "}",
             "set-option -q -t " + shlex.quote(self.session) + " @tmuxes_agent " + shlex.quote(value))

    def run(self, argv, env):
        threading.Thread(target=self.receive, daemon=True).start()
        child = subprocess.Popen(argv, env=env)
        try:
            while child.poll() is None:
                try:
                    event = self.events.get(timeout=0.2)
                    if event.get("adapter") == "claude":
                        self.claude.handle(event.get("payload") or {})
                    else:
                        self.state.apply(event)
                except queue.Empty:
                    pass
                if getattr(self, "overflow", False):
                    self.state.apply({"type": "unknown", "event": "EventOverflow"})
                    self.overflow = False
                self.publish()
            # Process exit is not task completion: daemon work may survive TUI.
            self.state.apply({"type": "closed" if child.returncode == 0 else "error",
                              "event": "ClientExit"})
            self.publish()
            return child.returncode
        finally:
            self.stopped.set()
            self.listener.close()
            if child.poll() is None:
                child.terminate()


class CodexBridge:
    def __init__(self, upstream_path, directory, emit):
        self.upstream_path, self.emit = upstream_path, emit
        self.path = str(Path(directory) / "codex.sock")
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.listener.bind(self.path)
        self.listener.listen(16)
        self.listener.settimeout(0.5)
        self.connections = set()
        self.owner = None
        self.lock = threading.RLock()
        self.closing = False

    def bind(self, connection):
        with self.lock:
            self.owner = connection

    def event(self, connection, event):
        with self.lock:
            if not self.closing and self.owner is connection:
                self.emit(event)

    def run(self):
        # The TUI opens extra connections for /resume's picker. Each needs an
        # independent upstream connection and JSON-RPC request-id namespace.
        while not self.closing:
            try:
                conn, _ = self.listener.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            with self.lock:
                if self.closing:
                    conn.close()
                    return
                connection = CodexConnection(self, conn)
                self.connections.add(connection)
            threading.Thread(target=connection.run, daemon=True).start()

    def close(self):
        with self.lock:
            self.closing = True
            self.listener.close()
            connections = list(self.connections)
        for connection in connections:
            connection.close()


class CodexConnection:
    def __init__(self, bridge, conn):
        self.bridge = bridge
        self.upstream_path = bridge.upstream_path
        self.upstream = None
        self.ws = WebSocket(conn)
        self.lock = threading.RLock()
        self.closing = False

    def emit(self, event):
        self.bridge.event(self, event)

    def send(self, message):
        self.upstream.send(message)

    def run(self):
        try:
            self.ws.handshake()
            upstream = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.upstream = WebSocket(upstream, client=True)
            upstream.settimeout(10)
            upstream.connect(self.upstream_path)
            self.upstream.handshake()
            observer = Codex(self.emit, self.send, lambda: self.bridge.bind(self))

            def read_server():
                try:
                    while True:
                        message = self.upstream.receive()
                        with self.lock:
                            forward = observer.server(message)
                        if forward:
                            self.ws.send(message)
                except (OSError, EOFError, ValueError, KeyError, TypeError) as error:
                    if not self.closing and not isinstance(error, EOFError):
                        print('[tmuxes] Codex upstream: ' + str(error), file=sys.stderr)
                finally:
                    self.close()

            threading.Thread(target=read_server, daemon=True).start()
            while True:
                message = self.ws.receive()
                with self.lock:
                    observer.client(message)
                    self.send(message)
        except (OSError, EOFError, ValueError, KeyError, TypeError) as error:
            if not self.closing:
                if not isinstance(error, EOFError):
                    print('[tmuxes] Codex bridge: ' + str(error), file=sys.stderr)
        finally:
            self.close()

    def close(self):
        with self.bridge.lock:
            if self.closing:
                return
            self.closing = True
            # A list-only picker must never clear the active TUI's state;
            # neither may an old TUI connection after a new one has bound.
            self.emit({"type": "unknown", "event": "CodexDisconnected"})
            self.ws.close()
            if self.upstream:
                self.upstream.close()  # Never stop the shared daemon.
            self.bridge.connections.discard(self)


def configure(kind, argv, env, supervisor):
    if kind == "claude":
        command = shlex.join([sys.executable, str(HERE / "hook.py")])
        settings, rest = {}, []
        args = iter(argv[1:])
        for arg in args:
            if arg == "--settings" or arg.startswith("--settings="):
                value = next(args, '') if arg == "--settings" else arg.split('=', 1)[1]
                existing = json.loads(value if value.lstrip().startswith('{') else Path(value).read_text())
                for key, data in existing.items():
                    if key == "hooks":
                        hooks = settings.setdefault('hooks', {})
                        for name, entries in data.items():
                            hooks.setdefault(name, []).extend(entries)
                    else:
                        settings[key] = data
            else:
                rest.append(arg)
        for name in HOOKS:
            settings.setdefault('hooks', {}).setdefault(name, []).append(
                {"hooks": [{"type": "command", "command": command}]})
        return [argv[0], "--settings", json.dumps(settings), *rest], None
    if kind == "opencode":
        config = json.loads(env.get("OPENCODE_CONFIG_CONTENT") or '{}')
        plugins = config.setdefault("plugin", [])
        plugins.append((HERE / "opencode.mjs").as_uri())
        env["OPENCODE_CONFIG_CONTENT"] = json.dumps(config)
        return argv, None
    if kind == "hermes":
        if any(arg in ("-p", "--profile") or arg.startswith("--profile=") for arg in argv[1:]):
            raise ValueError("For Hermes profiles, set HERMES_HOME to the profile home before launching.")
        content = (HERE / "hermes_plugin.py").read_bytes()
        name = "tmuxes-observer-" + hashlib.sha256(content).hexdigest()[:12]
        home = Path(env.get("HERMES_HOME", str(Path.home() / ".hermes")))
        plugin = home / "plugins" / name
        plugin.mkdir(parents=True, exist_ok=True)
        for filename, data in (("__init__.py", content), ("plugin.yaml",
                               ("name: " + name + "\nversion: 1.0.0\ndescription: tmuxes launch-local status observer\n").encode())):
            path = plugin / filename
            if path.exists() and path.read_bytes() != data:
                raise ValueError("Existing Hermes observer was modified; refusing to overwrite it.")
            path.write_bytes(data)
        print("[tmuxes] Enabling the local Hermes status observer (no added dependencies).", flush=True)
        subprocess.run([argv[0], "plugins", "enable", name], env=env, check=True)
        env["TMUXES_HERMES_PLUGIN"] = name
        return argv, None
    if kind == "codex":
        incompatible = ("-c", "--config", "--enable", "--disable", "--search", "--no-daemon", "--remote")
        if any(arg in incompatible or any(arg.startswith(flag + "=") for flag in incompatible)
               or (arg.startswith("-c") and arg != "-c") for arg in argv[1:]):
            raise ValueError("Codex status bridge requires shared mode: move -c/feature/search overrides to config.toml, "
                             "or launch bare codex manually without tmuxes monitoring.")
        result = subprocess.run([argv[0], "app-server", "daemon", "start"], env=env,
                                check=True, timeout=30, capture_output=True, text=True)
        status = json.loads(result.stdout.strip().splitlines()[-1])
        socket_path = status.get("socketPath")
        if not isinstance(socket_path, str) or not os.path.isabs(socket_path):
            raise ValueError("Codex daemon did not report a usable local socket; monitoring is unavailable.")
        bridge = CodexBridge(socket_path, supervisor.directory, supervisor.emit)
        threading.Thread(target=bridge.run, daemon=True).start()
        return [argv[0], "--remote", "unix://" + bridge.path, *argv[1:]], bridge
    raise ValueError("Unsupported agent")


def main():
    if len(sys.argv) < 3 or not os.environ.get("TMUX_PANE"):
        print("tmuxes agent launcher requires an active tmux pane", file=sys.stderr)
        return 2
    kind, argv = sys.argv[1], sys.argv[2:]
    # The terminal sends SIGINT to the whole foreground process group. The TUI
    # keeps handling it; the supervisor must survive and keep collecting events.
    signal.signal(signal.SIGINT, lambda *_: None)
    supervisor, bridge = None, None
    with tempfile.TemporaryDirectory(prefix="tmuxes-") as directory:
        try:
            supervisor = Supervisor(kind, directory)
            env = {**os.environ, "TMUXES_EVENT_SOCKET": supervisor.event_path}
            argv, bridge = configure(kind, argv, env, supervisor)
            return supervisor.run(argv, env)
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            print("[tmuxes] Agent launch failed: " + str(error), file=sys.stderr)
            if supervisor:
                supervisor.state.apply({"type": "unknown", "event": "LaunchFailed"})
                supervisor.publish()
            return 1
        finally:
            if bridge:
                bridge.close()
            if supervisor:
                supervisor.stopped.set()
                supervisor.listener.close()


if __name__ == "__main__":
    sys.exit(main())
