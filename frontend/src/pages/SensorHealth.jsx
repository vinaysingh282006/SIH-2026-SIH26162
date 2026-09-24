/**
 * SensorHealth v2.0 — Premium health dashboard
 */
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts';
import { fetchAllHealth, fetchStations, createLiveSocket } from '../api/client';
import './SensorHealth.css';

const URGENCY_ORDER = ['critical', 'soon', 'monitor', 'none'];
const URGENCY_COLOR = {
  critical: '#EF4444',
  soon:     '#F97316',
  monitor:  '#F59E0B',
  none:     '#10B981',
};

/* ── Animated health ring ───────────────────────────────────────── */
function HealthRing({ score, size = 80 }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score > 75 ? 'var(--green)' : score > 45 ? 'var(--amber)' : 'var(--red)';
  const glowColor = score > 75 ? '#10B981' : score > 45 ? '#F59E0B' : '#EF4444';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="health-ring-svg">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-surface-raised)" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 6px ${glowColor}88)` }}
      />
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fill={color}
        fontSize={size * 0.18} fontFamily="var(--font-data)" fontWeight="700">
        {Math.round(score)}
      </text>
    </svg>
  );
}

/* ── Fleet radar chart ──────────────────────────────────────────── */
function FleetRadar({ healthData }) {
  const data = [
    { label: 'Health Score', value: healthData.length ? healthData.reduce((s, h) => s + h.health_score, 0) / healthData.length : 0 },
    { label: 'Comm Reliability', value: healthData.length ? healthData.reduce((s, h) => s + (h.comm_reliability_pct || 100), 0) / healthData.length : 100 },
    { label: 'Stability', value: Math.max(0, 100 - healthData.reduce((s, h) => s + (h.ema_anomaly_score || 0) * 50, 0) / (healthData.length || 1)) },
    { label: 'Data Quality', value: Math.max(0, 100 - healthData.reduce((s, h) => s + (h.anomaly_rate_pct || 0), 0) / (healthData.length || 1) * 5) },
    { label: 'Maintenance', value: Math.max(0, 100 - healthData.filter(h => h.maintenance_urgency !== 'none').length / (healthData.length || 1) * 100) },
  ];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="rgba(0,212,255,0.1)" />
        <PolarAngleAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
        <Radar name="Fleet" dataKey="value" stroke="var(--cyan)" fill="var(--cyan)" fillOpacity={0.12} strokeWidth={2} dot={{ r: 4, fill: 'var(--cyan)', stroke: 'var(--bg-base)', strokeWidth: 2 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ── Health bar chart (sorted) ───────────────────────────────────── */
function HealthBars({ healthData, stationMap }) {
  const sorted = [...healthData].sort((a, b) => a.health_score - b.health_score).slice(0, 12);
  const data = sorted.map(h => ({
    name: (stationMap[h.station_id]?.name || h.station_id).replace('AWS Station', '').trim(),
    score: Math.round(h.health_score),
    color: h.health_score > 75 ? '#10B981' : h.health_score > 45 ? '#F59E0B' : '#EF4444',
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ left: 60, right: 20 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '12px' }}
          formatter={(v) => [`${v}%`, 'Health Score']}
        />
        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Station health card ─────────────────────────────────────────── */
function HealthCard({ h, station, onClick }) {
  const urgColor = URGENCY_COLOR[h.maintenance_urgency] || '#8BA3C7';
  const trend = h.trend || 'stable';
  const trendIcon = trend === 'improving' ? '↑' : trend === 'degrading' ? '↓' : '→';
  const trendColor = trend === 'improving' ? 'var(--green)' : trend === 'degrading' ? 'var(--red)' : 'var(--text-muted)';

  return (
    <div className="h-card" onClick={onClick} style={{ '--urg-color': urgColor }}>
      <div className="hcard-top-bar" />

      <div className="hcard-header">
        <div className="hcard-info">
          <span className="hcard-name">{station?.name || h.station_id}</span>
          <span className="hcard-id font-data">{h.station_id}</span>
        </div>
        <HealthRing score={h.health_score || 0} size={72} />
      </div>

      <div className="hcard-metrics">
        <div className="hcard-metric">
          <span className="hm-label">Anomaly Rate</span>
          <span className="hm-val font-data">{(h.anomaly_rate_pct || 0).toFixed(1)}%</span>
        </div>
        <div className="hcard-metric">
          <span className="hm-label">Comm Reliability</span>
          <span className="hm-val font-data">{(h.comm_reliability_pct || 100).toFixed(1)}%</span>
        </div>
        <div className="hcard-metric">
          <span className="hm-label">EMA Score</span>
          <span className="hm-val font-data">{(h.ema_anomaly_score || 0).toFixed(3)}</span>
        </div>
      </div>

      <div className="hcard-footer">
        <span className="trend-pill" style={{ color: trendColor }}>
          {trendIcon} {trend}
        </span>
        <span className={`urgency-badge${h.maintenance_urgency !== 'none' ? ' urgent' : ''}`}
          style={{ borderColor: urgColor, color: urgColor }}>
          {h.maintenance_urgency === 'none' ? '✓ Healthy' :
           h.maintenance_urgency === 'monitor' ? '👁 Monitor' :
           h.maintenance_urgency === 'soon' ? '⚠ Soon' : '🚨 Critical'}
        </span>
      </div>

      {h.days_to_maintenance != null && h.maintenance_urgency !== 'none' && (
        <div className="maintenance-eta">
          ~{h.days_to_maintenance} days to maintenance
        </div>
      )}
    </div>
  );
}

export default function SensorHealth() {
  const [healthData, setHealth]   = useState([]);
  const [stations,   setStations] = useState({});
  const [sortBy,     setSortBy]   = useState('health_score');
  const [filter,     setFilter]   = useState('all');
  const navigate = useNavigate();
  const wsRef = useRef(null);

  useEffect(() => {
    Promise.all([fetchAllHealth(), fetchStations()]).then(([h, s]) => {
      setHealth(h);
      const map = {};
      s.forEach(st => { map[st.station_id] = st; });
      setStations(map);
    });

    wsRef.current = createLiveSocket((event) => {
      if (event.event_type === 'health_update') {
        setHealth(prev => {
          const next = [...prev];
          const idx = next.findIndex(h => h.station_id === event.payload.station_id);
          if (idx >= 0) next[idx] = event.payload;
          else next.push(event.payload);
          return next;
        });
      }
    });
    return () => wsRef.current?.close();
  }, []);

  const filtered = filter === 'all' ? healthData
    : filter === 'critical' ? healthData.filter(h => h.health_score < 30 || h.maintenance_urgency === 'critical')
    : filter === 'warning'  ? healthData.filter(h => h.health_score >= 30 && h.health_score < 75)
    : healthData.filter(h => h.health_score >= 75);

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'health_score') return a.health_score - b.health_score;
    if (sortBy === 'urgency')      return URGENCY_ORDER.indexOf(a.maintenance_urgency) - URGENCY_ORDER.indexOf(b.maintenance_urgency);
    if (sortBy === 'anomaly_rate') return b.anomaly_rate_pct - a.anomaly_rate_pct;
    return 0;
  });

  const avg     = healthData.length ? (healthData.reduce((s, h) => s + h.health_score, 0) / healthData.length).toFixed(1) : '—';
  const needsMaint = healthData.filter(h => h.maintenance_urgency !== 'none');

  return (
    <div className="page health-page">
      <div className="page-header">
        <h1 className="page-title">Sensor Health</h1>
        <p className="page-subtitle">Real-time degradation scoring and predictive maintenance across {healthData.length} stations</p>
      </div>

      {/* Summary tiles */}
      <div className="health-summary-grid">
        {[
          { label: 'Fleet Avg Health', value: avg + '%', color: 'var(--green)', icon: '◉' },
          { label: 'Critical Stations', value: healthData.filter(h => h.maintenance_urgency === 'critical').length, color: 'var(--red)', icon: '🚨' },
          { label: 'Needs Maintenance', value: needsMaint.length, color: 'var(--amber)', icon: '⚠' },
          { label: 'Fully Healthy', value: healthData.filter(h => h.maintenance_urgency === 'none').length, color: 'var(--green)', icon: '✓' },
        ].map(t => (
          <div key={t.label} className="health-summary-tile" style={{ '--t-color': t.color }}>
            <span className="hst-icon">{t.icon}</span>
            <span className="hst-val font-data">{t.value}</span>
            <span className="hst-label">{t.label}</span>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="health-charts-row">
        <div className="health-chart-card">
          <div className="hcc-label">Fleet Performance Radar</div>
          <FleetRadar healthData={healthData} />
        </div>
        <div className="health-chart-card">
          <div className="hcc-label">Station Health (bottom 12)</div>
          <HealthBars healthData={healthData} stationMap={stations} />
        </div>
      </div>

      {/* Urgent maintenance banner */}
      {needsMaint.length > 0 && (
        <div className="maint-banner">
          <div className="maint-banner-header">
            <span className="maint-banner-icon">⚡</span>
            <span>Maintenance Required — {needsMaint.length} station{needsMaint.length > 1 ? 's' : ''}</span>
          </div>
          <div className="maint-list">
            {needsMaint.slice(0, 8).map(h => (
              <div key={h.station_id} className="maint-row" style={{ '--urg': URGENCY_COLOR[h.maintenance_urgency] }}>
                <span className="urgency-dot" />
                <span className="maint-name font-data">{stations[h.station_id]?.name || h.station_id}</span>
                <span className="maint-urgency">{h.maintenance_urgency}</span>
                <span className="maint-eta">{h.days_to_maintenance != null ? `~${h.days_to_maintenance}d` : 'now'}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/stations/${h.station_id}`)}>View →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="health-controls">
        <div className="health-filter-row">
          {[['all', 'All Stations'], ['critical', 'Critical'], ['warning', 'Warning'], ['healthy', 'Healthy']].map(([val, label]) => (
            <button key={val} className={`filter-pill${filter === val ? ' active' : ''}`}
              onClick={() => setFilter(val)}>
              {label}
            </button>
          ))}
        </div>
        <div className="health-sort-row">
          <span className="text-muted text-xs">Sort:</span>
          {[['health_score', 'Health'], ['urgency', 'Urgency'], ['anomaly_rate', 'Anomaly Rate']].map(([val, label]) => (
            <button key={val} className={`sort-btn${sortBy === val ? ' active' : ''}`}
              onClick={() => setSortBy(val)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="health-grid-v2">
        {sorted.map(h => (
          <HealthCard
            key={h.station_id}
            h={h}
            station={stations[h.station_id]}
            onClick={() => navigate(`/stations/${h.station_id}`)}
          />
        ))}
      </div>
    </div>
  );
}
