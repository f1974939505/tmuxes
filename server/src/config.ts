/** Central configuration. Localhost-only by design — see README/SECURITY. */
export const config = {
  /** Bind address. Intentionally not configurable: this is a no-auth local shell UI. */
  host: '127.0.0.1',
  port: Number(process.env.TMUXES_PORT ?? 7420),

  /** ssh timeouts (seconds). */
  ssh: {
    /** Management calls fail fast so the UI never hangs. */
    connectTimeoutMgmt: 8,
    /** Interactive attach is allowed a little longer. */
    connectTimeoutTty: 10,
    serverAliveInterval: 30,
  },

  /**
   * Allowed WebSocket Origins. The WS upgrade bypasses Express middleware, so
   * we enforce this in the upgrade handler to block DNS-rebind / cross-site WS
   * hijack. Empty/absent Origin (non-browser clients) is allowed.
   */
  isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) return true;
    try {
      const { hostname } = new URL(origin);
      return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
    } catch {
      return false;
    }
  },
} as const;
