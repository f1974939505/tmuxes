import { spawnPty, stopPtyHosts } from '../server/dist/ptyProcess.js';
import { WebSocket } from '../node_modules/ws/wrapper.mjs';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve, dirname, join } from 'node:path';

if (process.platform !== 'win32') throw new Error('Windows-only ConPTY smoke test');
const listener = net.createServer();
await new Promise(r => listener.listen(0, '127.0.0.1', r));
const port = listener.address().port;
await new Promise(r => listener.close(r));
const installed = process.argv.includes('--installed');
const args = installed
  ? [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'exec', '--offline', '--', 'tmuxes', '--port', String(port), '--no-open']
  : ['server/bin/tmuxes.js', '--port', String(port), '--no-open'];
const server = spawnPty(process.execPath, args, {
  cwd: installed ? resolve('.cache/terminal-local') : process.cwd(), cols: 100, rows: 30,
  env: { ...process.env, TMUXES_OPEN: '', TMUXES_LOG_DIR: resolve('.cache/conpty-smoke-logs') },
});
let logs = '', code;
server.onData(data => { logs += data; });
const stopped = new Promise(r => server.onExit(event => { code = event.exitCode; r(); }));
const sockets = [];
const base = `http://127.0.0.1:${port}`;
async function until(check, message, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await sleep(50); }
  throw new Error(message + '\n' + logs);
}
async function request(path, data) {
  const response = await fetch(base + path, data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(2000) } : { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}
async function attach(name) {
  let text = '', ready = false;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?target=winlocal&session=${name}&cols=100&rows=30`);
  sockets.push(ws);
  ws.on('message', (data, binary) => { if (binary) text += data.toString(); else if (JSON.parse(data.toString()).type === 'ready') ready = true; });
  await until(() => ready, 'WS not ready');
  return { ws, output: () => text };
}
try {
  await until(async () => { try { return (await fetch(base, { signal: AbortSignal.timeout(500) })).ok; } catch { return false; } }, 'HTTP not ready');
  for (const name of ['smoke_one', 'smoke_two']) await request('/api/targets/winlocal/sessions', { name, shell: 'powershell' });
  const one = await attach('smoke_one'), two = await attach('smoke_two');
  one.ws.send(Buffer.from("Write-Output ('MARK'+'ONE')\r"));
  two.ws.send(Buffer.from("Write-Output ('MARK'+'TWO')\r"));
  await until(() => one.output().includes('MARKONE') && two.output().includes('MARKTWO'), 'Input failed');
  one.ws.send(Buffer.from("1..1000 | ForEach-Object { 'output-line-' + $_ }\r"));
  for (let i = 0; i < 100; i++) {
    one.ws.send(JSON.stringify({ type: 'resize', cols: 80 + i % 40, rows: 24 + i % 10 }));
    two.ws.send(JSON.stringify({ type: 'resize', cols: 90 + i % 30, rows: 24 + i % 10 }));
  }
  two.ws.send(Buffer.from("Write-Output ('RESIZE'+'OK')\r"));
  await until(() => two.output().includes('RESIZEOK'), 'Resize blocked second terminal');
  one.ws.close();
  const reused = await attach('smoke_one');
  reused.ws.send(Buffer.from("Write-Output ('REUSE'+'OK')\r"));
  await until(() => reused.output().includes('REUSEOK'), 'Reattach failed');
  await request('/api/targets');
  const start = Date.now();
  server.write('\x03');
  await Promise.race([stopped, sleep(10000).then(() => { throw new Error('One Ctrl+C failed\n' + logs); })]);
  if (code !== 0) throw new Error('Shutdown exit ' + code + '\n' + logs);
  if (!logs.includes('shutdown complete')) throw new Error('Missing graceful shutdown log\n' + logs);
  console.log(`PASS: ${installed ? "installed npm exec" : "local CLI"}, real ConPTY, two shells, output + 200 resizes, reattach, one Ctrl+C (${Date.now()-start}ms)`);
} finally {
  for (const ws of sockets) ws.terminate();
  server.kill();
  await stopPtyHosts();
}
