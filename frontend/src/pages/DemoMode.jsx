/**
 * Screen 9: Demo / Judge Mode
 * Terminal-style console panel with one-click anomaly injection.
 * Styled distinctly from the rest of the app — intentionally "tool-like".
 */
import { useEffect, useState, useRef } from 'react';
import { injectAnomaly, fetchStations } from '../api/client';
import './DemoMode.css';

const ANOMALY_TYPES = [
  { id: 'spike',        label: 'Sensor Spike',            desc: 'Sharp instantaneous jump in one sensor' },
  { id: 'frozen',       label: 'Frozen Value',            desc: 'Sensor stuck at constant (zero variance)' },
  { id: 'drift',        label: 'Calibration Drift',       desc: 'Gradual linear drift over time' },
  { id: 'dropout',      label: 'Communications Dropout',  desc: 'All sensors return NaN (station offline)' },
  { id: 'noise_burst',  label: 'Noise Burst',             desc: 'High-frequency random noise on humidity' },
  { id: 'cross_sensor', label: 'Cross-Sensor Fault',      desc: 'Temperature spikes, pressure/humidity frozen' },
  { id: 'unit_flip',    label: 'Unit Flip Error',         desc: 'Temperature in °F reported as °C' },
];

function LogLine({ line }) {
  const colorMap = { '▶': 'var(--accent-amber)', '✓': 'var(--accent-green-bright)', '⚡': 'var(--accent-maroon-bright)', '✗': 'var(--text-muted)' };
  const icon = line.text.slice(0, 1);
  const color = colorMap[icon] || 'var(--text-secondary)';
  return (
    <div className="log-line" style={{ color }}>
      <span className="log-ts font-data">{line.ts}</span>
      <span>{line.text}</span>
    </div>
  );
}

export default function DemoMode() {
  const [stations,     setStations]     = useState([]);
  const [selectedSid,  setSelectedSid]  = useState('');
  const [selectedType, setSelectedType] = useState('spike');
  const [injecting,    setInjecting]    = useState(false);
  const [log,          setLog]          = useState([]);
  const [lastResult,   setLastResult]   = useState(null);
  const logEndRef = useRef(null);

  useEffect(() => {
    fetchStations().then(s => {
      setStations(s);
      if (s.length > 0) setSelectedSid(s[0].station_id);
    });
    addLog('▶ SkyGuard AI — Demo / Judge Mode initialised');
    addLog('▶ Select a station and anomaly type, then click INJECT');
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

  function addLog(text) {
    const ts = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(prev => [...prev, { ts, text }]);
  }

  async function handleInject() {
    if (!selectedSid || !selectedType) return;
    const typeDef = ANOMALY_TYPES.find(t => t.id === selectedType);
    setInjecting(true);
    addLog(`▶ Injecting [${typeDef?.label}] into station ${selectedSid}…`);

    try {
      const result = await injectAnomaly(selectedSid, selectedType);
      setLastResult(result);
      const det = result.detection_result;
      if (det.is_anomaly) {
        addLog(`⚡ DETECTED — severity: ${det.severity?.toUpperCase()} · confidence: ${det.confidence?.toFixed(0)}%`);
        addLog(`✓ Root cause: ${det.root_cause?.replace(/_/g, ' ')}`);
        addLog(`✓ ${det.explanation?.slice(0, 100)}…`);
      } else {
        addLog(`✗ NOT detected — unified score below threshold`);
      }
    } catch (e) {
      addLog(`✗ Error: ${e.message}`);
    }
    setInjecting(false);
  }

  const selected = ANOMALY_TYPES.find(t => t.id === selectedType);

  return (
    <div className="page demo-page">
      <div className="page-header">
        <div className="demo-title-row">
          <div>
            <h1 className="page-title">◐ Demo / Judge Mode</h1>
            <p className="page-subtitle">Inject synthetic anomalies and watch the live detection pipeline respond</p>
          </div>
          <span className="badge badge-warning">DEMO TOOL</span>
        </div>
      </div>

      <div className="demo-layout">
        {/* ── Control panel ────────────────────────────────────── */}
        <div className="demo-controls card-raised demo-panel">
          <h3 className="demo-section-title">Injection Controls</h3>

          {/* Station selector */}
          <div className="control-group">
            <label className="control-label">Target Station</label>
            <select className="input" value={selectedSid} onChange={e => setSelectedSid(e.target.value)}>
              {stations.map(s => (
                <option key={s.station_id} value={s.station_id}>
                  {s.name || s.station_id}
                </option>
              ))}
            </select>
          </div>

          {/* Anomaly type selector */}
          <div className="control-group">
            <label className="control-label">Anomaly Type</label>
            <div className="type-grid">
              {ANOMALY_TYPES.map(t => (
                <button
                  key={t.id}
                  className={`type-btn ${selectedType === t.id ? 'active' : ''}`}
                  onClick={() => setSelectedType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selected type description */}
          {selected && (
            <div className="type-desc-box">
              <span className="text-sm text-secondary">{selected.desc}</span>
            </div>
          )}

          {/* Inject button */}
          <button
            className="btn btn-danger inject-btn"
            onClick={handleInject}
            disabled={injecting || !selectedSid}
          >
            {injecting ? (
              <><div className="spinner" style={{ width: 16, height: 16 }} /> Injecting…</>
            ) : (
              '⚡ INJECT ANOMALY'
            )}
          </button>
        </div>

        {/* ── Console log ──────────────────────────────────────── */}
        <div className="demo-console card">
          <div className="console-header">
            <span className="console-title font-data">skyguard://pipeline/live</span>
            <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }} onClick={() => setLog([])}>Clear</button>
          </div>
          <div className="console-body">
            {log.map((line, i) => <LogLine key={i} line={line} />)}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* ── Result card ──────────────────────────────────────── */}
        {lastResult?.detection_result && (
          <div className={`demo-result card ${lastResult.detection_result.is_anomaly ? 'result-detected' : 'result-missed'}`}>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>
              {lastResult.detection_result.is_anomaly ? '⚡ Anomaly Detected' : '○ Not Detected'}
            </h3>
            {lastResult.detection_result.is_anomaly && (
              <div className="result-grid">
                <div className="result-item">
                  <span className="text-muted text-xs">Severity</span>
                  <span className={`badge badge-${lastResult.detection_result.severity}`}>
                    {lastResult.detection_result.severity}
                  </span>
                </div>
                <div className="result-item">
                  <span className="text-muted text-xs">Confidence</span>
                  <span className="font-data text-lg">{lastResult.detection_result.confidence?.toFixed(1)}%</span>
                </div>
                <div className="result-item">
                  <span className="text-muted text-xs">Root Cause</span>
                  <span className="text-sm">{lastResult.detection_result.root_cause?.replace(/_/g, ' ')}</span>
                </div>
                <div className="result-item" style={{ gridColumn: '1/-1' }}>
                  <span className="text-muted text-xs">Explanation</span>
                  <span className="text-sm text-secondary">{lastResult.detection_result.explanation?.slice(0, 200)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
