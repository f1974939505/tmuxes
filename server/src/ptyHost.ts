import * as pty from 'node-pty';
let terminal: pty.IPty | undefined;
let output: string[] = [];
let bytes = 0;
let sending = false;
let ended = false;
function send(message: object, callback?: () => void): void {
  if (!process.connected) { process.exit(1); }
  process.send!(message, error => { if (error) process.exit(1); callback?.(); });
}
function flush(): void {
  if (sending || !output.length) return;
  sending = true;
  const data = output.join(''); output = []; bytes = 0;
  send({ type: 'data', data }, () => { sending = false; flush(); });
}
process.on('message', (raw: unknown) => {
  const msg = raw as { id: number; type: string; file: string; args: string[]; options: pty.IPtyForkOptions; data: string; binary?: boolean; cols: number; rows: number };
  try {
    if (msg.type === 'spawn') {
      terminal = pty.spawn(msg.file, msg.args, msg.options);
      terminal.onData(data => {
        bytes += Buffer.byteLength(data); output.push(data);
        if (bytes > 4 * 1024 * 1024) {
          send({ type: 'error', message: 'PTY output overflow; closing only this local terminal' });
          process.exit(1);
        }
        flush();
      });
      terminal.onExit(({ exitCode }) => {
        if (!ended) { ended = true; send({ type: 'exit', code: exitCode }, () => process.exit(0)); }
      });
    } else if (msg.type === 'write') terminal?.write(msg.binary ? Buffer.from(msg.data, 'base64') : msg.data);
    else if (msg.type === 'resize') terminal?.resize(msg.cols, msg.rows);
    else if (msg.type === 'kill') { terminal?.kill(); process.exit(0); }
    send({ type: 'ack', id: msg.id });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
});
process.on('disconnect', () => { try { terminal?.kill(); } finally { process.exit(0); } });
