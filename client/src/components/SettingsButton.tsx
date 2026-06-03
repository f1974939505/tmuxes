import { useState } from 'react';
import { FONT_LIMITS, useSettings, type Settings } from '../settings';

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <button onClick={() => onChange(value - 1)} disabled={value <= FONT_LIMITS.min} aria-label="smaller">
          −
        </button>
        <span className="stepper-value">{value}px</span>
        <button onClick={() => onChange(value + 1)} disabled={value >= FONT_LIMITS.max} aria-label="larger">
          +
        </button>
      </div>
    </div>
  );
}

export function SettingsButton() {
  const { settings, setSetting, reset } = useSettings();
  const [open, setOpen] = useState(false);

  const step = (key: keyof Settings) => (n: number) => setSetting(key, n);

  return (
    <div className="settings">
      <button className="settings-gear" onClick={() => setOpen((v) => !v)} title="Settings">
        ⚙ Settings
      </button>
      {open && (
        <>
          <div className="settings-backdrop" onClick={() => setOpen(false)} />
          <div className="settings-panel" role="dialog">
            <div className="settings-title">Font sizes</div>
            <Stepper label="Sidebar" value={settings.sidebarFontSize} onChange={step('sidebarFontSize')} />
            <Stepper label="Terminal" value={settings.terminalFontSize} onChange={step('terminalFontSize')} />
            <Stepper label="File viewer" value={settings.viewerFontSize} onChange={step('viewerFontSize')} />
            <div className="settings-actions">
              <button onClick={reset}>Reset</button>
              <button className="primary" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
