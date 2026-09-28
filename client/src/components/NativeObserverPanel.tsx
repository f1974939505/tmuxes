import { useState } from 'react';
import type { LaunchAgent, NativeObserver, SessionInfo } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';

export function NativeObserverPanel({ targetId, observers, sessions, refresh }: {
  targetId: string; observers: NativeObserver[]; sessions: SessionInfo[]; refresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [agent, setAgent] = useState<LaunchAgent>('codex');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [launchSession, setLaunchSession] = useState('');
  const launchBound = async () => {
    if (!launchSession) return;
    setBusy(true); setMessage('');
    try { await api.launchAgent(targetId, launchSession, 'codex', true); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const install = async () => {
    setBusy(true); setMessage('');
    try { setMessage((await api.installObserver(targetId, agent)).message); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const bind = async (key: string) => {
    const session = bindings[key];
    if (!session) return;
    setBusy(true); setMessage('');
    try { await api.bindObserver(targetId, key, session); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const labels = { running: t.nativeRunning, waiting: t.nativeWaiting, background: t.nativeBackground,
    settling: t.nativeSettling, unknown: t.nativeUnknown, idle: t.done };
  return <details className="native-observers">
    <summary>{t.nativeObservers} · {observers.length}</summary>
    <p>{t.nativeInstallHint}</p>
    <div className="row">
      <select value={agent} onChange={(e) => setAgent(e.target.value as LaunchAgent)}>
        <option value="codex">Codex</option><option value="claude">Claude Code</option>
        <option value="opencode">OpenCode</option><option value="hermes">Hermes</option>
      </select>
      <button disabled={busy} onClick={() => void install()}>{t.nativeInstall}</button>
    </div>
    {message && <p className="native-message">{message}</p>}
    <p>{t.nativeBindingHint}</p>
    <div className="row">
      <select value={launchSession} onChange={(e) => setLaunchSession(e.target.value)}>
        <option value="">{t.nativeChooseSession}</option>
        {sessions.map((session) => <option key={session.name} value={session.name}>{session.name}</option>)}
      </select>
      <button disabled={busy || !launchSession} onClick={() => void launchBound()}>{t.nativeLaunchBound}</button>
    </div>
    {observers.map((observer) => <div className="native-observer" key={observer.key}>
      <div><strong>{observer.kind}</strong> <code title={observer.id}>{observer.id.slice(0, 8)}</code>
        <span className="badge">{observer.reason === 'error' ? t.nativeError : labels[observer.state]}</span>
      </div>
      <small>{observer.session ? `${observer.session}:${observer.window} · ${observer.pane}` : t.nativeUnbound}{observer.capability === 'limited' ? ` · ${t.nativeLimited}` : ''}</small>
      {!observer.session && observer.kind !== 'codex' && <div className="row">
        <select value={bindings[observer.key] || ''} onChange={(e) => setBindings({ ...bindings, [observer.key]: e.target.value })}>
          <option value="">{t.nativeChooseSession}</option>
          {sessions.map((session) => <option key={session.name} value={session.name}>{session.name}</option>)}
        </select>
        <button disabled={busy || !bindings[observer.key]} onClick={() => void bind(observer.key)}>{t.nativeBind}</button>
      </div>}
    </div>)}
  </details>;
}
