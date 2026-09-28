import { cpSync, mkdirSync } from 'node:fs';
const dest = new URL('../server/dist/agentRuntime/', import.meta.url);
mkdirSync(dest, { recursive: true });
cpSync(new URL('../server/src/agentRuntime/', import.meta.url), dest, {
  recursive: true,
  filter: (source) => !source.includes('__pycache__') && !source.endsWith('.pyc'),
});
