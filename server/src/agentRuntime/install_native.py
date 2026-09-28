"""Explicit one-time native integration setup. No trust or approval bypass."""
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile

from claude import HOOKS

HOME = Path.home()
DEST = HOME / ".local/share/tmuxes/observer"
MARKER = "tmuxes-native-observer"


def shell_environment():
    """Read exported agent settings from the user's interactive shell once.

    Management commands do not load shell rc files (notably nvm PATH). Only
    explicit installation does this; session polling never starts a shell.
    """
    import pwd
    shell = os.environ.get("SHELL") or pwd.getpwuid(os.getuid()).pw_shell or "/bin/sh"
    keys = ("PATH", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "HERMES_HOME", "XDG_CONFIG_HOME")
    marker = "TMUXES_INSTALL_ENV="
    script = "import os,json; print(" + repr(marker) + "+json.dumps({k:os.environ.get(k) for k in " + repr(keys) + "}))"
    result = subprocess.run([shell, "-ic", shlex.join([sys.executable, "-c", script])],
                            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)
    for line in reversed(result.stdout.splitlines()):
        if line.startswith(marker):
            data = json.loads(line[len(marker):])
            for key in keys:
                if isinstance(data.get(key), str):
                    os.environ[key] = data[key]
            return
    raise ValueError("Cannot read the target's interactive shell environment. Check shell startup files or run the observer installer from your working terminal.")


def write_owned(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8") != content:
        if MARKER not in path.read_text(encoding="utf-8"):
            raise ValueError("Refusing to replace unrelated file: " + str(path))
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as tmp:
        tmp.write(content)
    os.replace(tmp.name, path)


def merge_hooks(path, events, command):
    path.parent.mkdir(parents=True, exist_ok=True)
    before = path.read_bytes() if path.exists() else None
    config = json.loads(before.decode("utf-8-sig")) if before is not None else {}
    hooks = config.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        raise ValueError("Unsupported hooks configuration: " + str(path))
    for name in events:
        entries = hooks.setdefault(name, [])
        if not isinstance(entries, list):
            raise ValueError("Unsupported hook entries: " + name)
        # Remove only our exact command entries; preserve every other hook and
        # matcher in the same group, even when another tool edited the file.
        for group in entries:
            if isinstance(group, dict) and isinstance(group.get("hooks"), list):
                group["hooks"] = [h for h in group["hooks"] if not (
                    isinstance(h, dict) and h.get("command") == command)]
        entries[:] = [g for g in entries if not (isinstance(g, dict) and g.get("hooks") == [])]
        entries.append({"hooks": [{"type": "command", "command": command, "timeout": 3}]})
    after = (json.dumps(config, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if before == after:
        return
    if before is not None:
        backup = path.with_name(path.name + ".tmuxes-" + hashlib.sha256(before).hexdigest()[:12] + ".bak")
        if not backup.exists():
            backup.write_bytes(before)
            backup.chmod(0o600)
    current = path.read_bytes() if path.exists() else None
    if current != before:
        raise ValueError("Configuration changed during installation; retry after editing finishes")
    import tempfile
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        tmp.write(after)
    os.replace(tmp.name, path)


def install(kind):
    if kind not in ("claude", "codex", "opencode", "hermes"):
        raise ValueError("Unknown agent")
    # Hook files can be installed without resolving the agent executable.
    # This also supports agents launched through shell aliases/functions.
    if kind == "opencode":
        if not shutil.which(kind):
            raise ValueError("OpenCode version check cannot find opencode in the interactive shell PATH; run the installer from the terminal where opencode works.")
        version = subprocess.check_output([kind, "--version"], text=True, timeout=5).strip()
        import re
        major = re.search(r"\b(\d+)\.\d+\.\d+", version)
        if not major or int(major[1]) != 1:
            raise ValueError("This observer supports OpenCode v1. The v2 plugin API differs; configuration was left unchanged.")
    DEST.mkdir(parents=True, exist_ok=True, mode=0o700)
    source = Path(__file__).resolve().parent
    # Versioned assets keep active integrations coherent during updates.
    files = sorted(p for p in source.iterdir() if p.suffix in (".py", ".mjs"))
    digest = hashlib.sha256(b"".join(p.name.encode() + p.read_bytes() for p in files)).hexdigest()[:20]
    runtime = DEST / digest
    runtime.mkdir(exist_ok=True, mode=0o700)
    for path in files:
        shutil.copyfile(path, runtime / path.name)
    python = sys.executable
    launcher = ("# " + MARKER + "\n# tmuxes-foreground-launch-v1\nimport os,sys\n"
                "os.execv(" + repr(python) + ", [" + repr(python) + ", " + repr(str(runtime / "native.py")) + "] + sys.argv[1:])\n")
    write_owned(DEST / "native.py", launcher)
    command = shlex.join([python, str(DEST / "native.py"), kind])
    if kind == "claude":
        home = Path(os.environ.get("CLAUDE_CONFIG_DIR", str(HOME / ".claude")))
        merge_hooks(home / "settings.json", HOOKS, command)
        message = "Restart Claude Code; ordinary claude commands now emit native status."
    elif kind == "codex":
        home = Path(os.environ.get("CODEX_HOME", str(HOME / ".codex")))
        merge_hooks(home / "hooks.json", ("SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
                                           "Stop", "SubagentStart", "SubagentStop", "Interrupt", "SessionEnd"), command)
        message = "Review/trust the observer in /hooks. The toolbar runs codex --no-daemon directly. On Linux/WSL, native hooks verify foreground process ancestry to associate the pane. Unbound observations are discarded."
    elif kind == "opencode":
        home = Path(os.environ.get("XDG_CONFIG_HOME", str(HOME / ".config"))) / "opencode"
        content = f'''// {MARKER}
import {{ spawn }} from 'node:child_process';
import {{ TmuxesPlugin }} from {json.dumps((runtime / 'opencode.mjs').as_uri())};
export const TmuxesNativeObserver = async (context) => TmuxesPlugin(context, (type, data, session_id) => {{
  if (!session_id) return Promise.resolve();
  return new Promise(resolve => {{
    const child = spawn({json.dumps(python)}, [{json.dumps(str(DEST / 'native.py'))}, 'opencode'], {{ stdio: ['pipe', 'ignore', 'ignore'] }});
    const timer = setTimeout(() => {{ child.kill(); resolve(); }}, 2500);
    child.on('error', () => {{ clearTimeout(timer); resolve(); }});
    child.on('close', () => {{ clearTimeout(timer); resolve(); }});
    child.stdin.on('error', () => {{}});
    child.stdin.end(JSON.stringify({{ ...data, type, session_id }}));
  }});
}});
'''
        write_owned(home / "plugins/tmuxes-native-observer.js", content)
        message = "Restart OpenCode. This adapter targets the v1 server plugin API; unknown event schemas degrade to unknown."
    else:
        home = Path(os.environ.get("HERMES_HOME", str(HOME / ".hermes")))
        plugin = home / "plugins" / MARKER
        content = f'''# {MARKER}
import importlib.util, json, subprocess
def register(ctx):
    spec = importlib.util.spec_from_file_location('tmuxes_native_hermes', {str(runtime / 'hermes_plugin.py')!r})
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    def report(kind, data, session_id):
        if not session_id: return
        try:
            subprocess.run([{python!r}, {str(DEST / 'native.py')!r}, 'hermes'],
                input=json.dumps(dict(data, type=kind, session_id=session_id)), text=True,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2.5)
        except (OSError, ValueError, subprocess.SubprocessError): pass
    module.register(ctx, report)
'''
        write_owned(plugin / "__init__.py", content)
        write_owned(plugin / "plugin.yaml", "# " + MARKER + "\nname: " + MARKER + "\nversion: 1.0.0\ndescription: Passive tmuxes status observer\n")
        message = "Run hermes plugins enable tmuxes-native-observer, then restart Hermes."
    return {"agent": kind, "message": message, "path": str(DEST), "installed": True}


if __name__ == "__main__":
    try:
        shell_environment()
        print(json.dumps(install(sys.argv[1])))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
