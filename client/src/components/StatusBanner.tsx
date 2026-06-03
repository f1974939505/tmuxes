import type { ConnStatus } from '../types';

interface Props {
  status: ConnStatus;
  onReconnect: () => void;
}

/** Overlay shown while connecting or when the link is degraded. Renders
 *  nothing once connected so the terminal is unobstructed. */
export function StatusBanner({ status, onReconnect }: Props) {
  if (status.kind === 'connected') return null;

  if (status.kind === 'connecting') {
    return (
      <div className="status-banner">
        <span className="spinner" />
        <span className="msg">Connecting…</span>
      </div>
    );
  }

  const isError = status.kind === 'error' || status.kind === 'ssh';
  return (
    <div className={`status-banner ${isError ? 'error' : ''}`}>
      <span className="msg">{status.message}</span>
      <button onClick={onReconnect}>Reconnect</button>
    </div>
  );
}
