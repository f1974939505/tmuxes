import { expect, it } from 'vitest';
import { runCommand } from '../src/exec.js';

it('noninteractive commands receive EOF with or without explicit input', async () => {
  const args = ['-e', 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>process.stdout.write("EOF:"+s))'];
  for (const input of [undefined, 'payload']) {
    const result = await runCommand(process.execPath, args, { input, timeoutMs: 3000 });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`EOF:${input ?? ''}`);
  }
});
