import { useState } from 'react';
import { FONT_LIMITS, useSettings, type Language, type Settings } from '../settings';
import { useI18n } from '../i18n';

function Stepper({
  label,
  value,
  smaller,
  larger,
  onChange,
}: {
  label: string;
  value: number;
  smaller: string;
  larger: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <button onClick={() => onChange(value - 1)} disabled={value <= FONT_LIMITS.min} aria-label={smaller}>
          −
        </button>
        <span className="stepper-value">{value}px</span>
        <button onClick={() => onChange(value + 1)} disabled={value >= FONT_LIMITS.max} aria-label={larger}>
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-label">{label}</span>
    </label>
  );
}

export function SettingsButton() {
  const { settings, setSetting, reset } = useSettings();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const step =
    (key: keyof Pick<Settings, 'sidebarFontSize' | 'terminalFontSize' | 'viewerFontSize'>) =>
    (n: number) =>
      setSetting(key, n);

  return (
    <div className="settings">
      <button className="settings-gear" onClick={() => setOpen((v) => !v)} title={t.settings}>
        ⚙ {t.settings}
      </button>
      {open && (
        <>
          <div className="settings-backdrop" onClick={() => setOpen(false)} />
          <div className="settings-panel" role="dialog">
            <div className="settings-title">{t.language}</div>
            <select
              value={settings.language}
              onChange={(e) => setSetting('language', e.target.value as Language)}
            >
              <option value="zh">{t.chinese}</option>
              <option value="en">{t.english}</option>
            </select>
            <div className="settings-title">{t.fontSizes}</div>
            <Stepper
              label={t.sidebar}
              value={settings.sidebarFontSize}
              smaller={t.smaller}
              larger={t.larger}
              onChange={step('sidebarFontSize')}
            />
            <Stepper
              label={t.terminal}
              value={settings.terminalFontSize}
              smaller={t.smaller}
              larger={t.larger}
              onChange={step('terminalFontSize')}
            />
            <Stepper
              label={t.fileViewer}
              value={settings.viewerFontSize}
              smaller={t.smaller}
              larger={t.larger}
              onChange={step('viewerFontSize')}
            />
            <div className="settings-title">{t.notifications}</div>
            <Toggle
              label={t.alertWhenAgent}
              checked={settings.notifyAttention}
              onChange={(v) => setSetting('notifyAttention', v)}
            />
            <Toggle
              label={t.playSound}
              checked={settings.notifySound}
              onChange={(v) => setSetting('notifySound', v)}
            />
            <div className="settings-actions">
              <button onClick={reset}>{t.reset}</button>
              <button className="primary" onClick={() => setOpen(false)}>
                {t.done}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
