import { useEffect, useRef, useState } from 'react';
import { createTerminal, type TerminalHandle } from '../hooks/useTerminal';
import { createTmuxSocket, type TmuxSocket } from '../hooks/useTmuxSocket';
import { api, ApiError, terminalSocketUrl } from '../api';
import type { ConnStatus, LaunchAgent, Target } from '../types';
import { useI18n } from '../i18n';
import { StatusBanner } from './StatusBanner';

interface Props {
  targetId: string;
  targetKind: Target['kind'];
  targetLabel: string;
  session: string;
  fontSize: number;
}

const RESIZE_DEBOUNCE_MS = 80;

/** Mounted with key={targetId/session}, so a selection change is a full
 *  remount — no stale terminal/socket state. */
export function TerminalPanel({ targetId, targetKind, targetLabel, session, fontSize }: Props) {
  const { t } = useI18n();
  const tRef = useRef(t);
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<TerminalHandle | null>(null);
  const socketRef = useRef<TmuxSocket | null>(null);
  const [status, setStatus] = useState<ConnStatus>({ kind: 'connecting' });
  const [generation, setGeneration] = useState(0);
  const [startingAgent, setStartingAgent] = useState<LaunchAgent | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const terminalRetryUsed = useRef(false);

  useEffect(() => {
    terminalRetryUsed.current = false;
  }, [targetId, session]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setStatus({ kind: 'connecting' });

    const handle = createTerminal(host, fontSize);
    handleRef.current = handle;
    const initial = handle.refit() ?? { cols: 80, rows: 24 };
    let lastCols = initial.cols;
    let lastRows = initial.rows;
    let exited = false;

    const retryOnce = (): boolean => {
      if (targetKind !== 'ssh' || terminalRetryUsed.current) return false;
      terminalRetryUsed.current = true;
      setStatus({ kind: 'connecting' });
      setGeneration((g) => g + 1);
      return true;
    };

    const socket = createTmuxSocket(
      terminalSocketUrl(targetId, session, initial.cols, initial.rows),
      {
        onOpen: () => {
          /* wait for bytes before declaring connected */
        },
        onOutput: (bytes) => {
          handle.term.write(bytes);
          setStatus((s) => (s.kind === 'connecting' || s.kind === 'ssh' ? { kind: 'connected' } : s));
        },
        onControl: (msg) => {
          if (msg.type === 'ready') {
            // Re-assert geometry now that the PTY exists (matters for ssh).
            socket.resize(handle.term.cols, handle.term.rows);
          } else if (msg.type === 'ssh') {
            setStatus((s) => (s.kind === 'connecting' ? { kind: 'ssh', message: msg.message } : s));
          } else if (msg.type === 'error') {
            setStatus({ kind: 'error', message: msg.message });
          } else if (msg.type === 'exit') {
            exited = true;
            if (msg.code !== 0 && retryOnce()) return;
            setStatus({
              kind: 'disconnected',
              message:
                msg.code === 0 || msg.code === null
                  ? tRef.current.sessionEnded
                  : tRef.current.sessionEndedExit(msg.code),
            });
          }
        },
        onClose: () => {
          if (!exited) {
            if (retryOnce()) return;
            setStatus({
              kind: targetKind === 'ssh' ? 'ssh' : 'disconnected',
              message:
                targetKind === 'ssh'
                  ? tRef.current.sshInterrupted
                  : tRef.current.disconnected,
            });
          }
        },
      },
    );

    socketRef.current = socket;
    const dataSub = handle.term.onData((d) => socket.sendInput(d));
    handle.term.focus();

    // Debounced fit on container resize → push new geometry to the PTY.
    let resizeTimer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const geo = handle.refit();
        if (geo && (geo.cols !== lastCols || geo.rows !== lastRows)) {
          lastCols = geo.cols;
          lastRows = geo.rows;
          socket.resize(geo.cols, geo.rows);
        }
      }, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(host);

    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      dataSub.dispose();
      socket.close();
      handle.dispose();
      handleRef.current = null;
      socketRef.current = null;
    };
  }, [targetId, targetKind, session, generation]);

  // Live-apply terminal font size without remounting (preserves scrollback).
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    if (handle.term.options.fontSize === fontSize) return;
    handle.term.options.fontSize = fontSize;
    const geo = handle.refit();
    if (geo) socketRef.current?.resize(geo.cols, geo.rows);
  }, [fontSize]);

  const launchAgent = async (agent: LaunchAgent) => {
    setStartingAgent(agent);
    setAgentError(null);
    try {
      await api.launchAgent(targetId, session, agent);
      handleRef.current?.term.focus();
    } catch (e) {
      setAgentError(e instanceof ApiError ? e.message : t.failedLaunchAgent);
    } finally {
      setStartingAgent(null);
    }
  };

  return (
    <div className="panel">
      {targetKind !== 'winlocal' && (
        <div className="agent-toolbar">
          <button
            disabled={startingAgent !== null}
            onClick={() => void launchAgent('claude')}
            title={t.runClaude}
          >
            claude
          </button>
          <button
            disabled={startingAgent !== null}
            onClick={() => void launchAgent('codex')}
            title={t.runCodex}
          >
            codex
          </button>
          {agentError && <span className="agent-error" title={agentError}>!</span>}
        </div>
      )}
      <div className="term-host" ref={hostRef} />
      <StatusBanner status={status} onReconnect={() => setGeneration((g) => g + 1)} />
      {status.kind !== 'connected' && status.kind !== 'connecting' && (
        <div className="panel-placeholder" style={{ pointerEvents: 'none' }}>
          <div style={{ opacity: 0.4 }}>
            {targetLabel} · {session}
          </div>
        </div>
      )}
    </div>
  );
}
