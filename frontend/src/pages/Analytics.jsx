/**
 * Screen 7: Analytics & Reports
 * Historical trends, F1/Precision/Recall tiles (wired to ml/evaluate.py output),
 * anomaly type breakdown, export button.
 */
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import { fetchEvalResults, fetchAnomalies } from '../api/client';
import './Analytics.css';

const TYPE_COLORS = {
  spike:        '#A6394F',
  frozen:       '#7C9B7E',
  drift:        '#B5693F',
  dropout:      '#6B5F6A',
  noise_burst:  '#D4804F',
  cross_sensor: '#7A2436',
  unit_flip:    '#5C7A5E',
};

export default function Analytics() {
  const [evalResults, setEval]      = useState(null);
  const [anomalies,   setAnomalies] = useState([]);
  const [loading,     setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([fetchEvalResults(), fetchAnomalies({ limit: 500 })]).then(([ev, an]) => {
      setEval(ev);
      setAnomalies(an);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Anomaly type breakdown from feed
  const typeCounts = anomalies.reduce((acc, a) => {
    const t = a.root_cause || 'unknown';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const typeChartData = Object.entries(typeCounts)
    .map(([name, count]) => ({ name: name.replace(/_/g, ' '), count }))
    .sort((a, b) => b.count - a.count);

  // Per-type F1 from eval results
  const perType = evalResults?.per_type
    ? Object.entries(evalResults.per_type)
        .filter(([k]) => !k.startsWith('_'))
        .map(([type, m]) => ({
          name: type.replace(/_/g, ' '),
          f1:   +(m.f1 * 100).toFixed(1),
          precision: +(m.precision * 100).toFixed(1),
          recall:    +(m.recall * 100).toFixed(1),
        }))
    : [];

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ evalResults, anomalyCounts: typeCounts }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'skyguard_analytics.json'; a.click();
  };

  return (
    <div className="page analytics-page">
      <div className="page-header">
        <div className="analytics-header-row">
          <div>
            <h1 className="page-title">Analytics & Reports</h1>
            <p className="page-subtitle">Detection accuracy metrics and historical anomaly trends</p>
          </div>
          <button className="btn btn-ghost" onClick={handleExport}>↓ Export JSON</button>
        </div>
      </div>

      {/* ── Model Accuracy Tiles ─────────────────────────────── */}
      {evalResults && (
        <section>
          <h2 style={{ marginBottom: 'var(--space-4)' }}>Model Accuracy</h2>
          <p className="text-muted text-sm" style={{ marginBottom: 'var(--space-5)' }}>
            Results from <span className="font-data">ml/evaluate.py</span> — evaluated against synthetic anomaly-injected dataset
          </p>
          <div className="grid-4" style={{ marginBottom: 'var(--space-8)' }}>
            {[
              { label: 'Macro F1',        value: ((evalResults.macro_f1 || 0) * 100).toFixed(1) + '%',     color: 'var(--accent-green-bright)' },
              { label: 'Macro Precision', value: ((evalResults.macro_precision || 0) * 100).toFixed(1) + '%', color: 'var(--accent-green-bright)' },
              { label: 'Macro Recall',    value: ((evalResults.macro_recall || 0) * 100).toFixed(1) + '%', color: 'var(--accent-amber-bright)' },
              { label: 'False Positive Rate', value: ((evalResults.false_positive_rate || 0) * 100).toFixed(1) + '%', color: 'var(--text-secondary)' },
            ].map(t => (
              <div key={t.label} className="stat-tile">
                <span className="label">{t.label}</span>
                <span className="value font-data" style={{ color: t.color }}>{t.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!evalResults && !loading && (
        <div className="card eval-placeholder">
          <span style={{ fontSize: '2rem' }}>▦</span>
          <p>Accuracy metrics not available yet.</p>
          <p className="text-muted text-sm">Run <span className="font-data">python ml/evaluate.py</span> from the repo root to generate results.</p>
        </div>
      )}

      {/* ── Per-type F1 chart ────────────────────────────────── */}
      {perType.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ marginBottom: 'var(--space-5)' }}>Per Anomaly Type — F1 Score (%)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={perType} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-secondary)' }}
              />
              <Bar dataKey="f1" name="F1 %" radius={[4, 4, 0, 0]}>
                {perType.map((entry, i) => (
                  <Cell key={i} fill={TYPE_COLORS[entry.name.replace(/ /g, '_')] || 'var(--accent-maroon)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Anomaly type distribution from live feed ─────────── */}
      {typeChartData.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-5)' }}>Anomaly Distribution (Live Feed)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={typeChartData} layout="vertical" margin={{ top: 0, right: 16, left: 100, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
              <Bar dataKey="count" name="Count" fill="var(--accent-maroon)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
