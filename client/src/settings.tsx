import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Settings {
  /** Sidebar (tmux tree + file explorer) font size, px. */
  sidebarFontSize: number;
  /** xterm terminal font size, px. */
  terminalFontSize: number;
  /** File viewer font size, px. */
  viewerFontSize: number;
  /** Notify when a supported agent finishes or needs a decision. */
  notifyAttention: boolean;
  /** Play a sound with the notification. */
  notifySound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sidebarFontSize: 13,
  terminalFontSize: 13,
  viewerFontSize: 13,
  notifyAttention: true,
  notifySound: true,
};

export const FONT_LIMITS = { min: 8, max: 28 };

const STORAGE_KEY = 'tmuxes.settings';

interface SettingsContextValue {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

const clamp = (n: number) => Math.min(FONT_LIMITS.max, Math.max(FONT_LIMITS.min, Math.round(n)));

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const setSetting = useCallback<SettingsContextValue['setSetting']>((key, value) => {
    setSettings((s) => ({ ...s, [key]: typeof value === 'number' ? clamp(value) : value }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo(() => ({ settings, setSetting, reset }), [settings, setSetting, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
