import type { FileEntry, FilePreview, SessionInfo, Target, WindowInfo } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  getTargets(): Promise<{ targets: Target[] }> {
    return request('/api/targets');
  },
  getSessions(targetId: string): Promise<{ sessions: SessionInfo[] }> {
    return request(`/api/targets/${encodeURIComponent(targetId)}/sessions`);
  },
  createSession(
    targetId: string,
    body: { name?: string; command?: string; shell?: string },
  ): Promise<{ name: string }> {
    return request(`/api/targets/${encodeURIComponent(targetId)}/sessions`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  renameSession(targetId: string, name: string, newName: string): Promise<{ name: string }> {
    return request(
      `/api/targets/${encodeURIComponent(targetId)}/sessions/${encodeURIComponent(name)}`,
      { method: 'PATCH', body: JSON.stringify({ newName }) },
    );
  },
  killSession(targetId: string, name: string): Promise<void> {
    return request(
      `/api/targets/${encodeURIComponent(targetId)}/sessions/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    );
  },
  getWindows(targetId: string, name: string): Promise<{ windows: WindowInfo[] }> {
    return request(
      `/api/targets/${encodeURIComponent(targetId)}/sessions/${encodeURIComponent(name)}/windows`,
    );
  },
  getCwd(targetId: string, name: string): Promise<{ cwd: string }> {
    return request(
      `/api/targets/${encodeURIComponent(targetId)}/sessions/${encodeURIComponent(name)}/cwd`,
    );
  },
  listFiles(targetId: string, session: string, path: string): Promise<{ path: string; entries: FileEntry[] }> {
    return request(
      `/api/targets/${encodeURIComponent(targetId)}/files?session=${encodeURIComponent(session)}&path=${encodeURIComponent(path)}`,
    );
  },
  getFile(targetId: string, session: string, path: string): Promise<FilePreview> {
    return request(
      `/api/targets/${encodeURIComponent(targetId)}/file?session=${encodeURIComponent(session)}&path=${encodeURIComponent(path)}`,
    );
  },
  saveFile(targetId: string, session: string, path: string, content: string): Promise<{ ok: true }> {
    return request(`/api/targets/${encodeURIComponent(targetId)}/file`, {
      method: 'PUT',
      body: JSON.stringify({ session, path, content }),
    });
  },
};

/** Build the WebSocket URL for an interactive attach (same-origin). */
export function terminalSocketUrl(targetId: string, session: string, cols: number, rows: number): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams({
    target: targetId,
    session,
    cols: String(cols),
    rows: String(rows),
  });
  return `${proto}://${location.host}/ws?${params.toString()}`;
}
