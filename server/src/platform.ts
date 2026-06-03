/** Platform helpers. Windows has no native tmux, so it reaches tmux inside WSL
 *  via wsl.exe; macOS and Linux run tmux directly. */
export const isWindows = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
