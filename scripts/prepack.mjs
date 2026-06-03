// Runs as the `tmuxes` package's prepack (npm pack / npm publish).
// Builds the client + server and bundles the built client into server/public
// so the published package is self-contained.
import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url))); // scripts/.. = repo root
const log = (m) => console.log(`[prepack] ${m}`);

log('building client + server…');
rmSync(join(root, 'server', 'dist'), { recursive: true, force: true });
execSync('npm run build', { cwd: root, stdio: 'inherit' });

const clientDist = join(root, 'client', 'dist');
if (!existsSync(clientDist)) {
  console.error('[prepack] client/dist missing after build');
  process.exit(1);
}

const publicDir = join(root, 'server', 'public');
rmSync(publicDir, { recursive: true, force: true });
cpSync(clientDist, publicDir, { recursive: true });
log('bundled client → server/public');

for (const file of ['README.md', 'LICENSE']) {
  const src = join(root, file);
  if (existsSync(src)) {
    cpSync(src, join(root, 'server', file));
    log(`copied ${file}`);
  }
}

log('done');
