import { useState } from 'react';
import type { LaunchAgent, NativeObserver } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';

export function NativeObserverPanel({ targetId, observers, refresh }: {
  targetId: string; observers: NativeObserver[]; refresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [agent, setAgent] = useState<LaunchAgent>('codex');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const install = async () => {
    setBusy(true); setMessage('');
    try { setMessage((await api.installObserver(targetId, agent)).message); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const labels = { running: t.nativeRunning, waiting: t.nativeWaiting, background: t.nativeBackground,
    settling: t.nativeSettling, unknown: t.nativeUnknown, idle: t.done };
  const linked = observers.filter((observer) => observer.session && observer.pane);
  const renderObserver = (observer: NativeObserver) => <div className="native-observer" key={observer.key}>
      <div><strong>{observer.kind}</strong> <code title={observer.id}>{observer.id.slice(0, 8)}</code>
        <span className="badge">{observer.reason === 'error' ? t.nativeError : labels[observer.state]}</span>
      </div>
      <small>{observer.session ? `${observer.session}:${observer.window} · ${observer.pane}` : t.nativeUnbound}{observer.capability === 'limited' ? ` · ${t.nativeLimited}` : ''}</small>
      <small>{t.nativeLastEvent}: {observer.lastEvent || '—'} · {observer.updated ? new Date(observer.updated * 1000).toLocaleString() : '—'}</small>

    </div>;
  return <details className="native-observers">
    <summary>{t.nativeObservers} · {t.nativeLinked} {linked.length}</summary>
    <p>{t.nativeInstallHint}</p>
    <div className="row">
      <select value={agent} onChange={(e) => setAgent(e.target.value as LaunchAgent)}>
        <option value="codex">Codex</option><option value="claude">Claude Code</option>
        <option value="opencode">OpenCode</option><option value="hermes">Hermes</option>
      </select>
      <button disabled={busy} onClick={() => void install()}>{t.nativeInstall}</button>
    </div>
    {message && <p className="native-message">{message}</p>}
    {linked.map(renderObserver)}

  </details>;
}
