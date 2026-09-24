/**
 * Screen 5: Explainability Drill-Down
 * SHAP-style bars + confidence gauge + reasoning text + root-cause breakdown
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchAnomalyExplain } from '../api/client';
import './ExplainDrillDown.css';

function ConfidenceGauge({ value }) {
  const angle = (value / 100) * 180 - 90;
  const color = value >= 80 ? 'var(--accent-maroon-bright)'
              : value >= 55 ? 'var(--accent-amber-bright)'
              : 'var(--accent-green-bright)';
  return (
    <div className="confidence-gauge">
      <svg viewBox="0 0 200 110" width="200" height="110">
        {/* Background arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--bg-surface-raised)" strokeWidth="14" strokeLinecap="round" />
        {/* Value arc */}
        <path
          d={`M 20 100 A 80 80 0 0 1 ${100 + 80 * Math.cos(Math.PI * (value / 100 - 1))} ${100 - 80 * Math.sin(Math.PI * (value / 100))}`}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Needle */}
        <line
          x1="100" y1="100"
          x2={100 + 60 * Math.cos(Math.PI * ((value / 100) - 1))}
          y2={100 - 60 * Math.sin(Math.PI * (value / 100))}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="100" cy="100" r="5" fill={color} />
        <text x="100" y="85" textAnchor="middle" fill="var(--text-primary)" fontSize="22" fontFamily="var(--font-data)" fontWeight="600">
          {value?.toFixed(0)}%
        </text>
        <text x="100" y="108" textAnchor="middle" fill="var(--text-muted)" fontSize="10">
          Confidence
        </text>
      </svg>
    </div>
  );
}

function SHAPBar({ feature, contribution, rawScore }) {
  return (
    <div className="shap-row">
      <span className="shap-feature">{feature}</span>
      <div className="shap-bar-track">
        <div
          className="shap-bar-fill"
          style={{ width: `${Math.min(contribution, 100)}%` }}
        />
      </div>
      <span className="shap-pct font-data">{contribution?.toFixed(1)}%</span>
    </div>
  );
}

export default function ExplainDrillDown() {
  const { id } = useParams();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchAnomalyExplain(id).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!data) return <div className="page"><p className="text-secondary">Anomaly not found. <Link to="/anomalies">Back to feed</Link></p></div>;

  const rcConf = data.root_cause_confidence || {};
  const rcSorted = Object.entries(rcConf).sort(([, a], [, b]) => b - a);

  return (
    <div className="page explain-page">
      <div className="page-header">
        <Link to="/anomalies" className="btn btn-ghost" style={{ marginBottom: 'var(--space-3)' }}>← Back to Feed</Link>
        <h1 className="page-title">Explainability Drill-Down</h1>
        <p className="page-subtitle">
          Anomaly <span className="font-data">{id}</span> · Station {data.station_id} ·{' '}
          {new Date(data.timestamp).toLocaleString()}
        </p>
      </div>

      <div className="explain-grid">
        {/* ── Left column ─────────────────────────────────────── */}
        <div className="explain-left">

          {/* Confidence + severity */}
          <div className="card gauge-card">
            <div className="gauge-row">
              <ConfidenceGauge value={data.confidence || 0} />
              <div className="gauge-meta">
                <span className={`badge badge-${data.severity}`} style={{ fontSize: 'var(--text-base)' }}>
                  {data.severity?.toUpperCase()}
                </span>
                <p className="text-muted text-sm" style={{ marginTop: 'var(--space-3)' }}>
                  Root Cause
                </p>
                <p className="root-cause-display">{(data.root_cause || 'unknown').replace(/_/g, ' ')}</p>
              </div>
            </div>
          </div>

          {/* Reasoning text */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-4)' }}>AI Reasoning</h3>
            <p className="reasoning-text">{data.reasoning_text || 'No explanation available for this event.'}</p>
          </div>

          {/* Root-cause breakdown */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Root-Cause Probabilities</h3>
            {rcSorted.map(([cause, pct]) => (
              <div key={cause} className="rc-row">
                <span className="rc-label text-sm">{cause.replace(/_/g, ' ')}</span>
                <div className="rc-bar-track">
                  <div className="rc-bar-fill" style={{ width: `${pct}%`, opacity: pct > 5 ? 1 : 0.3 }} />
                </div>
                <span className="rc-pct font-data text-xs">{pct?.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────── */}
        <div className="explain-right">
          {/* SHAP-style bars */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-5)' }}>Feature Contributions</h3>
            <p className="text-muted text-xs" style={{ marginBottom: 'var(--space-5)' }}>
              Percentage of total anomaly score attributed to each detection layer
            </p>
            {(data.shap_bars || []).length === 0 ? (
              <p className="text-muted text-sm">No SHAP data available.</p>
            ) : (
              (data.shap_bars || []).map((bar, i) => (
                <SHAPBar key={i} {...bar} />
              ))
            )}
          </div>

          {/* Layer score breakdown */}
          {data.layer_scores && Object.keys(data.layer_scores).length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: 'var(--space-4)' }}>Raw Layer Scores</h3>
              <div className="layer-scores">
                {Object.entries(data.layer_scores).map(([layer, score]) => (
                  <div key={layer} className="layer-row">
                    <span className="text-sm text-secondary">{layer.replace(/_/g, ' ')}</span>
                    <span className={`font-data text-sm ${score > 0.5 ? 'anomalous' : ''}`}>
                      {score?.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link
            to={`/stations/${data.station_id}`}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            View Station Detail →
          </Link>
        </div>
      </div>
    </div>
  );
}
