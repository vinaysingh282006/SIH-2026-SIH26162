/**
 * AnomalyFeed v2.0 — Interactive network graph + live feed
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Area, AreaChart, CartesianGrid
} from 'recharts';
import { fetchAnomalies, fetchStations, createLiveSocket } from '../api/client';
import './AnomalyFeed.css';

const SEV_ORDER = ['critical', 'high', 'medium', 'low'];
const SEV_COLORS = {
  critical: 'var(--red)',
  high:     'var(--orange)',
  medium:   'var(--amber)',
  low:      'var(--teal)',
};

/* ── Network Graph Canvas ───────────────────────────────────────── */
function NetworkGraph({ anomalies, stations }) {
  const canvasRef = useRef(null);
  const nodesRef  = useRef([]);
  const animRef   = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !anomalies.length) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width  = canvas.offsetWidth;
    let H = canvas.height = canvas.offsetHeight;

    // Build nodes from top stations involved
    const stationIds = [...new Set(anomalies.slice(0, 25).map(a => a.station_id))];
    const cx = W / 2, cy = H / 2;
    const r  = Math.min(W, H) * 0.35;

    const nodes = stationIds.map((sid, i) => {
      const angle = (i / stationIds.length) * Math.PI * 2 - Math.PI / 2;
      const severity = anomalies.find(a => a.station_id === sid)?.severity || 'low';
      const count    = anomalies.filter(a => a.station_id === sid).length;
      return {
        id: sid,
        x: cx + r * Math.cos(angle) + (Math.random() - 0.5) * 30,
        y: cy + r * Math.sin(angle) + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        severity,
        count,
        radius: Math.max(8, Math.min(24, count * 4)),
        color: SEV_COLORS[severity] || 'var(--cyan)',
        pulse: Math.random() * Math.PI * 2,
      };
    });

    // Central node
    nodes.push({ id: 'CENTER', x: cx, y: cy, vx: 0, vy: 0, severity: 'healthy', count: 0, radius: 16, color: 'var(--cyan)', pulse: 0, isCenter: true });

    nodesRef.current = nodes;

    let t = 0;
    function draw() {
      t += 0.02;
      ctx.clearRect(0, 0, W, H);

      // Draw edges from center to anomaly stations
      nodes.filter(n => !n.isCenter).forEach(node => {
        const center = nodes.find(n => n.isCenter);
        const dist = Math.hypot(node.x - center.x, node.y - center.y);
        const alpha = Math.max(0, 0.4 - dist / 400);

        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(node.x, node.y);
        ctx.strokeStyle = node.color.replace('var(', '').replace(')', '');
        const colMap = { 'var(--red)': '#EF4444', 'var(--orange)': '#F97316', 'var(--amber)': '#F59E0B', 'var(--teal)': '#00FFC8', 'var(--cyan)': '#00D4FF' };
        const col = colMap[node.color] || '#00D4FF';
        ctx.strokeStyle = col.replace('#', '');
        // use rgba instead
        const hexToRgb = hex => ({ r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) });
        const rgb = hexToRgb(col);
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha * 0.8})`;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Draw nodes
      nodes.forEach(node => {
        const pulse = Math.sin(t * 2 + node.pulse);

        if (!node.isCenter) {
          // Gentle drift
          node.x += node.vx;
          node.y += node.vy;
          const dx = node.x - cx, dy = node.y - cy;
          const dist = Math.hypot(dx, dy);
          if (dist > r * 1.2) { node.vx *= -0.8; node.vy *= -0.8; }
        }

        // Glow ring for critical
        if (node.severity === 'critical' || node.severity === 'high') {
          const gR = node.radius + 8 + pulse * 4;
          const colMap = { 'var(--red)': '#EF4444', 'var(--orange)': '#F97316' };
          const col = colMap[node.color] || '#EF4444';
          const rgb = col.slice(1).match(/.{2}/g).map(v => parseInt(v, 16));
          const grad = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, gR);
          grad.addColorStop(0, `rgba(${rgb},0.4)`);
          grad.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(node.x, node.y, gR, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Node circle
        const colStr = node.isCenter ? '#00D4FF' :
          node.severity === 'critical' ? '#EF4444' :
          node.severity === 'high'     ? '#F97316' :
          node.severity === 'medium'   ? '#F59E0B' : '#00FFC8';

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${colStr}33`;
        ctx.fill();
        ctx.strokeStyle = colStr;
        ctx.lineWidth = node.isCenter ? 2 : 1.5;
        ctx.stroke();

        // Center icon
        if (node.isCenter) {
          ctx.fillStyle = '#00D4FF';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('AI', node.x, node.y);
        } else {
          // Station label
          ctx.fillStyle = '#8BA3C7';
          ctx.font = '8px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.id, node.x, node.y + node.radius + 10);
          // Count
          if (node.count > 1) {
            ctx.fillStyle = colStr;
            ctx.font = 'bold 8px monospace';
            ctx.fillText(node.count, node.x, node.y);
          }
        }
      });

      animRef.current = requestAnimationFrame(draw);
    }
    draw();

    const onResize = () => {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, [anomalies]);

  return <canvas ref={canvasRef} className="network-canvas" />;
}

/* ── Severity donut chart (SVG) ──────────────────────────────────── */
function SeverityDonut({ anomalies }) {
  const counts = SEV_ORDER.reduce((acc, s) => {
    acc[s] = anomalies.filter(a => a.severity === s).length;
    return acc;
  }, {});
  const total = anomalies.length || 1;
  const colors = { critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#00FFC8' };

  let cum = 0;
  const r = 45, circ = 2 * Math.PI * r;
  const segments = SEV_ORDER.map(s => {
    const pct = counts[s] / total;
    const seg = { s, pct, offset: cum, dash: pct * circ, gap: circ };
    cum += pct;
    return seg;
  });

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 120 120" className="donut-svg">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--bg-surface-raised)" strokeWidth="14" />
        {segments.map(({ s, dash, offset }) => (
          dash > 0 && (
            <circle key={s} cx="60" cy="60" r={r} fill="none"
              stroke={colors[s]} strokeWidth="14"
              strokeDasharray={`${dash} ${circ}`}
              strokeDashoffset={circ - offset * circ}
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dasharray 0.8s ease' }}
            />
          )
        ))}
        <text x="60" y="58" textAnchor="middle" fill="var(--text-primary)" fontSize="16" fontWeight="700" fontFamily="var(--font-data)">{anomalies.length}</text>
        <text x="60" y="72" textAnchor="middle" fill="var(--text-muted)" fontSize="8">total</text>
      </svg>
      <div className="donut-legend">
        {SEV_ORDER.map(s => (
          <div key={s} className="donut-leg-item">
            <span className="donut-dot" style={{ background: colors[s] }} />
            <span className="donut-label">{s}</span>
            <span className="donut-count font-data" style={{ color: colors[s] }}>{counts[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Timeline bar chart ──────────────────────────────────────────── */
function TimelineChart({ anomalies }) {
  const buckets = {};
  anomalies.forEach(a => {
    const d = new Date(a.timestamp);
    const key = `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}h`;
    if (!buckets[key]) buckets[key] = { time: key, critical: 0, high: 0, medium: 0, low: 0 };
    if (a.severity) buckets[key][a.severity] = (buckets[key][a.severity] || 0) + 1;
  });
  const data = Object.values(buckets).slice(-12);
  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={data} barCategoryGap="30%">
        <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '11px' }}
          labelStyle={{ color: 'var(--text-secondary)' }}
        />
        <Bar dataKey="critical" stackId="a" fill="#EF4444" radius={[0,0,0,0]} />
        <Bar dataKey="high"     stackId="a" fill="#F97316" />
        <Bar dataKey="medium"   stackId="a" fill="#F59E0B" />
        <Bar dataKey="low"      stackId="a" fill="#00FFC8" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Anomaly card ────────────────────────────────────────────────── */
function AnomalyCard({ anomaly, index, expanded, onToggle }) {
  const isExp = expanded === index;
  const { severity, station_id, timestamp, root_cause, confidence, explanation, anomaly_id, shap_bars = [] } = anomaly;

  const totalShap = shap_bars.reduce((s, b) => s + (b.contribution || 0), 0) || 1;

  return (
    <div className={`anomaly-card${isExp ? ' expanded' : ''}${severity === 'critical' ? ' critical-pulse' : ''}`}
      style={{ '--sev-color': SEV_COLORS[severity] || 'var(--cyan)' }}>

      <div className="acard-main" onClick={() => onToggle(isExp ? null : index)}>
        <div className="acard-sev-bar" />
        <div className="acard-left">
          <span className={`badge badge-${severity}`}>{severity}</span>
          <div className="acard-meta">
            <span className="acard-station font-data">{station_id}</span>
            <span className="acard-time">{new Date(timestamp).toLocaleString()}</span>
          </div>
        </div>
        <div className="acard-center">
          <span className="acard-root-cause">{(root_cause || 'unknown').replace(/_/g, ' ')}</span>
        </div>
        <div className="acard-right">
          <div className="confidence-ring-sm">
            <svg viewBox="0 0 36 36" width="44" height="44">
              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--bg-surface-raised)" strokeWidth="3"/>
              <circle cx="18" cy="18" r="14" fill="none"
                stroke={SEV_COLORS[severity] || 'var(--cyan)'}
                strokeWidth="3"
                strokeDasharray={`${(confidence / 100) * 88} 88`}
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
              />
              <text x="18" y="22" textAnchor="middle" fill="var(--text-primary)" fontSize="8" fontFamily="var(--font-data)" fontWeight="600">
                {Math.round(confidence)}%
              </text>
            </svg>
          </div>
          <span className="expand-chevron">{isExp ? '▲' : '▼'}</span>
        </div>
      </div>

      {isExp && (
        <div className="acard-expanded">
          {explanation && (
            <div className="acard-explanation">
              <span className="explain-label">AI Reasoning</span>
              <p>{explanation}</p>
            </div>
          )}

          {shap_bars.length > 0 && (
            <div className="shap-bars">
              <span className="explain-label">Feature Attribution</span>
              {shap_bars.map((bar, i) => (
                <div key={i} className="shap-row">
                  <span className="shap-feature">{bar.feature}</span>
                  <div className="shap-bar-track">
                    <div className="shap-bar-fill"
                      style={{
                        width: `${(bar.contribution / totalShap) * 100}%`,
                        background: bar.direction === 'anomalous' ? SEV_COLORS[severity] || 'var(--cyan)' : 'var(--green)',
                      }}
                    />
                  </div>
                  <span className="shap-pct font-data">{bar.contribution?.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}

          <div className="acard-actions">
            <Link to={`/anomalies/${anomaly_id}`} className="btn btn-primary btn-sm">Explain Drill-Down →</Link>
            <Link to={`/stations/${station_id}`} className="btn btn-ghost btn-sm">View Station</Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */
const FILTERS = ['all', 'critical', 'high', 'medium', 'low'];

export default function AnomalyFeed() {
  const [anomalies, setAnomalies] = useState([]);
  const [stations,  setStations]  = useState([]);
  const [filter,    setFilter]    = useState('all');
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [view,      setView]      = useState('feed'); // 'feed' | 'network'
  const wsRef = useRef(null);

  useEffect(() => {
    Promise.all([fetchAnomalies({ limit: 200 }), fetchStations()]).then(([a, s]) => {
      setAnomalies(a);
      setStations(s);
      setLoading(false);
    }).catch(() => setLoading(false));

    wsRef.current = createLiveSocket((event) => {
      if (event.event_type === 'anomaly') {
        setAnomalies(prev => [event.payload, ...prev].slice(0, 200));
      }
    });
    return () => wsRef.current?.close();
  }, []);

  const filtered = filter === 'all' ? anomalies : anomalies.filter(a => a.severity === filter);
  const counts   = FILTERS.slice(1).reduce((acc, s) => ({ ...acc, [s]: anomalies.filter(a => a.severity === s).length }), {});

  return (
    <div className="page anomaly-page">
      {/* Header */}
      <div className="page-header">
        <div className="apage-title-row">
          <div>
            <h1 className="page-title">Anomaly Feed</h1>
            <p className="page-subtitle">Real-time alert centre — {anomalies.length} total events detected</p>
          </div>
          <div className="view-toggle">
            <button className={`vt-btn${view === 'feed' ? ' active' : ''}`} onClick={() => setView('feed')}>▦ Feed</button>
            <button className={`vt-btn${view === 'network' ? ' active' : ''}`} onClick={() => setView('network')}>◉ Network</button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="anomaly-stats-row">
        {FILTERS.slice(1).map(s => (
          <div key={s} className="a-stat-tile" style={{ '--s-color': SEV_COLORS[s] }}>
            <span className="a-stat-label">{s}</span>
            <span className="a-stat-val font-data">{counts[s] || 0}</span>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-label">Severity Distribution</div>
          <SeverityDonut anomalies={anomalies} />
        </div>
        <div className="chart-card timeline-chart-card">
          <div className="chart-label">Anomaly Timeline</div>
          <TimelineChart anomalies={anomalies} />
        </div>
      </div>

      {/* Network graph */}
      {view === 'network' && (
        <div className="network-section">
          <div className="chart-label">Station Anomaly Network</div>
          <p className="network-hint">Circle size ∝ anomaly count · Color = highest severity · Lines connect to AI hub</p>
          <div className="network-container">
            <NetworkGraph anomalies={anomalies} stations={stations} />
          </div>
        </div>
      )}

      {/* Filter pills */}
      {view === 'feed' && (
        <>
          <div className="filter-row">
            {FILTERS.map(s => (
              <button
                key={s}
                className={`filter-pill${filter === s ? ' active' : ''}`}
                style={filter === s && s !== 'all' ? { '--fp-color': SEV_COLORS[s] } : {}}
                onClick={() => setFilter(s)}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="fp-count font-data">{s === 'all' ? anomalies.length : counts[s] || 0}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="feed-loading"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="feed-empty card">
              <span className="feed-empty-icon">◉</span>
              <p>No anomalies at this severity level</p>
              <p className="text-muted text-sm">Network is behaving normally</p>
            </div>
          ) : (
            <div className="feed-list">
              {filtered.map((a, i) => (
                <AnomalyCard
                  key={a.anomaly_id || i}
                  anomaly={a}
                  index={i}
                  expanded={expanded}
                  onToggle={setExpanded}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
