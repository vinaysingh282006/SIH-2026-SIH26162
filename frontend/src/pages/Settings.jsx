/**
 * Screen 8: Settings / Threshold Config
 */
import { useEffect, useState } from 'react';
import { fetchSettings, updateSettings } from '../api/client';
import './Settings.css';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    fetchSettings().then(setSettings).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  if (!settings) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page settings-page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Detection sensitivity, alert thresholds, and notification channels</p>
      </div>

      <div className="settings-sections">
        {/* Detection */}
        <div className="card settings-section">
          <h2 className="section-heading">Detection Sensitivity</h2>

          <div className="setting-row">
            <div>
              <div className="setting-label">Z-Score Threshold</div>
              <div className="setting-desc text-muted text-sm">Statistical detector sensitivity. Lower = more sensitive. Default: 3.5</div>
            </div>
            <div className="setting-control">
              <input
                type="range" min="2" max="6" step="0.1"
                value={settings.z_threshold}
                onChange={e => setSettings(s => ({ ...s, z_threshold: parseFloat(e.target.value) }))}
                className="range-slider"
              />
              <span className="font-data">{settings.z_threshold?.toFixed(1)}</span>
            </div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">IQR Multiplier</div>
              <div className="setting-desc text-muted text-sm">Fence multiplier for IQR outlier detection. Default: 2.5</div>
            </div>
            <div className="setting-control">
              <input
                type="range" min="1.5" max="5" step="0.1"
                value={settings.iqr_multiplier}
                onChange={e => setSettings(s => ({ ...s, iqr_multiplier: parseFloat(e.target.value) }))}
                className="range-slider"
              />
              <span className="font-data">{settings.iqr_multiplier?.toFixed(1)}</span>
            </div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Minimum Confidence (%)</div>
              <div className="setting-desc text-muted text-sm">Only display alerts above this confidence level.</div>
            </div>
            <div className="setting-control">
              <input
                type="range" min="10" max="95" step="5"
                value={settings.min_confidence}
                onChange={e => setSettings(s => ({ ...s, min_confidence: parseFloat(e.target.value) }))}
                className="range-slider"
              />
              <span className="font-data">{settings.min_confidence?.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="card settings-section">
          <h2 className="section-heading">Alert Rules</h2>
          <div className="setting-row">
            <div>
              <div className="setting-label">Alert Severity Threshold</div>
              <div className="setting-desc text-muted text-sm">Only generate alerts at or above this severity.</div>
            </div>
            <select
              className="input"
              style={{ width: 'auto', minWidth: '160px' }}
              value={settings.alert_severity_threshold}
              onChange={e => setSettings(s => ({ ...s, alert_severity_threshold: e.target.value }))}
            >
              {['low', 'medium', 'high', 'critical'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Notification stubs */}
        <div className="card settings-section">
          <h2 className="section-heading">Notification Channels</h2>
          {[
            { label: 'In-App Feed',      desc: 'Always enabled', enabled: true, locked: true },
            { label: 'WebSocket Stream', desc: 'Live broadcast — always enabled', enabled: true, locked: true },
            { label: 'Email (SMTP)',     desc: 'Configure SMTP in .env', enabled: false, locked: false },
            { label: 'SMS (Twilio)',     desc: 'Add TWILIO_* keys to .env', enabled: false, locked: false },
            { label: 'Webhook',         desc: 'HTTP POST to custom endpoint', enabled: false, locked: false },
          ].map(ch => (
            <div key={ch.label} className="channel-row">
              <div>
                <div className="setting-label">{ch.label}</div>
                <div className="setting-desc text-muted text-xs">{ch.desc}</div>
              </div>
              <div className={`toggle-switch ${ch.enabled ? 'on' : ''} ${ch.locked ? 'locked' : ''}`} />
            </div>
          ))}
        </div>

        {/* Save */}
        <button
          className={`btn btn-primary save-btn ${saved ? 'saved' : ''}`}
          onClick={handleSave}
        >
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
