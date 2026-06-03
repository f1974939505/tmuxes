import { spawn } from 'node:child_process';
import { isWindows, isMac } from './platform.js';
import { log } from './logger.js';

/** Open `url` in the default browser (best-effort, detached). Used by the
 *  one-click launchers when TMUXES_OPEN is set. */
export function openBrowser(url: string): void {
  try {
    let file: string;
    let args: string[];
    if (isWindows) {
      // `cmd /c start "" "<url>"` — the empty "" is the window title start needs.
      file = 'cmd.exe';
      args = ['/c', 'start', '', url];
    } else if (isMac) {
      file = 'open';
      args = [url];
    } else {
      file = 'xdg-open';
      args = [url];
    }
    const child = spawn(file, args, { detached: true, stdio: 'ignore' });
    child.on('error', (e) => log.warn(`could not open browser: ${e.message}`));
    child.unref();
  } catch (e) {
    log.warn(`could not open browser: ${e instanceof Error ? e.message : String(e)}`);
  }
}
