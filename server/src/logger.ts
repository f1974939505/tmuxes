/** Tiny timestamped console logger — no external dependency. */
function ts(): string {
  return new Date().toISOString();
}

export const log = {
  info(msg: string, ...rest: unknown[]): void {
    console.log(`[${ts()}] ${msg}`, ...rest);
  },
  warn(msg: string, ...rest: unknown[]): void {
    console.warn(`[${ts()}] WARN ${msg}`, ...rest);
  },
  error(msg: string, ...rest: unknown[]): void {
    console.error(`[${ts()}] ERROR ${msg}`, ...rest);
  },
};
