import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import type { AgentKind } from './agentState.js';
import type { Target } from './targets.js';
import { commandArgv, sshQuote } from './tmux/builder.js';
import { runTargetCommand } from './targetCommand.js';

export function detectAgentKind(command: string): AgentKind | undefined {
  if (['1', 'true'].includes(process.env.TMUXES_NO_AUTOHOOK ?? '')) return undefined;
  const token = command.trim().split(/\s+/)[0].split(/[\\/]/).pop()?.toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
  return token === 'claude' || token === 'codex' || token === 'opencode' || token === 'hermes' ? token : undefined;
}

interface Runtime { python: string; path: string }

// Assets are copied to dist/agentRuntime at build time. Deployment uses the
// existing management connection during explicit installation, never probes other hosts.
export function runtimeBundle(): { files: Record<string, string>; hash: string } {
  const directory = new URL('./agentRuntime/', import.meta.url);
  const files = Object.fromEntries(readdirSync(directory).filter((name) => /\.(py|mjs)$/.test(name)).sort()
    .map((name) => [name, readFileSync(new URL(name, directory), 'utf8')]));
  const hash = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 20);
  return { files, hash };
}

const INSTALL = `import json,os,pathlib,sys,tempfile
if sys.version_info < (3,9): raise RuntimeError('tmuxes agent monitoring requires Python 3.9+')
data=json.load(sys.stdin)
base=pathlib.Path.home()/'.cache'/'tmuxes'/'agents'
base.mkdir(parents=True,exist_ok=True,mode=0o700)
dest=base/data['hash']
dest.mkdir(exist_ok=True,mode=0o700)
for name,content in data['files'].items():
 p=dest/name
 if p.exists() and p.read_text(encoding='utf-8')==content: continue
 with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=dest,delete=False) as f:
  f.write(content)
 os.replace(f.name,p)
print(json.dumps({'python':sys.executable,'path':str(dest/'main.py')}))`;

export async function prepareAgentCommand(_target: Target, command: string): Promise<{ command: string; kind?: AgentKind }> {
  const kind = detectAgentKind(command);
  // Native integrations are installed once per target. Button and typed
  // commands are identical: never interpose on the TUI or inject config flags.
  return { command, kind };
}

export async function installNativeObserver(target: Target, kind: AgentKind): Promise<unknown> {
  const result = await runTargetCommand(target,
    (opts) => commandArgv(target, ['python3', '-c', INSTALL], opts),
    { input: JSON.stringify(runtimeBundle()), timeoutMs: 15_000 });
  if (result.code !== 0) throw new Error(`Cannot prepare agent monitoring (Python 3.9+ required on target): ${result.stderr.trim()}`);
  const runtime = JSON.parse(result.stdout.trim()) as Runtime;
  if (!runtime.python || !runtime.path) throw new Error('Invalid agent runtime installation response');
  const installed = await runTargetCommand(target,
    (opts) => commandArgv(target, [runtime.python, runtime.path.replace(/main\.py$/, 'install_native.py'), kind], opts),
    { timeoutMs: 15_000 });
  if (installed.code !== 0) throw new Error(installed.stderr.trim() || 'Native observer installation failed');
  return JSON.parse(installed.stdout.trim());
}

export function augmentAgentCommand(command: string, runtime: Runtime): { command: string; kind?: AgentKind } {
  const kind = detectAgentKind(command);
  if (!kind) return { command };
  return { kind, command: `${sshQuote(runtime.python)} ${sshQuote(runtime.path)} ${kind} ${command.trim()}` };
}
