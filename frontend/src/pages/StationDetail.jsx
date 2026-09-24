/**
 * Screen 3: Station Detail — Time-series charts with anomaly overlays
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend
} from 'recharts';
import { fetchStation, fetchStationReadings, fetchStationHealth } from '../api/client';
import { fetchUnifiedWeather } from '../services/weatherProviders/index.js';
import WeatherComparisonPanel from '../components/WeatherComparisonPanel';
import { useWeather } from '../context/WeatherContext';
import './StationDetail.css';

const SENSOR_CONFIG = [
  { key: 'temperature_c',  corrected: 'corrected_temperature_c', label: 'Temperature',  unit: '°C',   color: '#00D4FF', domain: [-10, 55] },
  { key: 'pressure_hpa',   corrected: 'corrected_pressure_hpa',  label: 'Pressure',     unit: ' hPa', color: '#00FFC8', domain: [850, 1060] },
  { key: 'humidity_pct',   corrected: 'corrected_humidity_pct',  label: 'Humidity',     unit: '%',    color: '#F59E0B', domain: [0, 100] },
];

const CustomDot = (props) => {
  const { cx, cy, payload } = props;
  if (!payload.is_anomaly) return null;
  const sevColors = { critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#00FFC8' };
  const c = sevColors[payload.severity] || '#EF4444';
  return <circle cx={cx} cy={cy} r={5} fill={c} stroke="#050A18" strokeWidth={2} />;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-time">{new Date(label).toLocaleTimeString()}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="tooltip-row">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-data">{p.value?.toFixed(2)}</span>
        </div>
      ))}
      {d?.is_anomaly && (
        <div className="tooltip-anomaly">
          ⚡ {d.severity?.toUpperCase()} — {d.root_cause?.replace(/_/g, ' ')}
        </div>
      )}
    </div>
  );
};

export default function StationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setCurrentCondition } = useWeather();
  const [station,  setStation]  = useState(null);
  const [readings, setReadings] = useState([]);
  const [health,   setHealth]   = useState(null);
  const [showCorrected, setShowCorrected] = useState(false);
  const [loading,  setLoading]  = useState(true);

  // Multi-source weather consensus state
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [primarySource, setPrimarySource] = useState('open-meteo');

  const loadStationWeather = async (lat, lon, preferred = primarySource, bypass = false) => {
    setWeatherLoading(true);
    try {
      const data = await fetchUnifiedWeather({
        lat,
        lon,
        primarySourceId: preferred,
        bypassCache: bypass,
      });
      setWeatherData(data);
      if (data.primary?.condition) {
        setCurrentCondition(data.primary.condition);
      }
    } catch (e) {
      console.warn('[StationDetail] Multi-source fetch error:', e);
    } finally {
      setWeatherLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchStation(id),
      fetchStationReadings(id, 288),
      fetchStationHealth(id),
    ]).then(([st, rd, hlt]) => {
      setStation(st);
      setReadings(rd.map(r => ({ ...r, ts: new Date(r.timestamp).getTime() })));
      setHealth(hlt);
      setLoading(false);
      if (st?.lat && st?.lon) {
        loadStationWeather(st.lat, st.lon);
      }
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!station) return (
    <div className="page">
      <p className="text-secondary">Station not found. <Link to="/map">Back to map</Link></p>
    </div>
  );

  const anomalyReadings = readings.filter(r => r.is_anomaly);

  return (
    <div className="page station-detail-page">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="page-header">
        <button className="btn btn-ghost" style={{ marginBottom: 'var(--space-3)' }} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div className="station-header">
          <div>
            <h1 className="page-title">{station.name || id}</h1>
            <p className="page-subtitle text-muted">{id} · {station.region} · {station.elevation_m}m elevation</p>
          </div>
          <div className="header-badges">
            <span className={`badge badge-${station.status || 'healthy'}`}>{station.status || 'healthy'}</span>
            {health && (
              <div className="health-badge-group">
                <span className="text-muted text-xs">Health</span>
                <span className="font-data" style={{
                  color: health.health_score > 75 ? 'var(--accent-green-bright)'
                       : health.health_score > 45 ? 'var(--accent-amber-bright)'
                       : 'var(--accent-maroon-bright)'
                }}>
                  {health.health_score?.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="toggle-row">
          <button
            className={`btn ${showCorrected ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setShowCorrected(v => !v)}
          >
            {showCorrected ? '◉' : '○'} Show Corrected Values
          </button>
          <span className="text-muted text-xs">
            {anomalyReadings.length} anomalies in last 24h
          </span>
        </div>
      </div>

      {/* ── Multi-Source Weather Consensus Panel ───────────── */}
      {station?.lat && station?.lon && (
        <div style={{ marginBottom: '1.5rem' }}>
          <WeatherComparisonPanel
            weatherData={weatherData}
            isLoading={weatherLoading}
            onSelectPrimary={(newPrimary) => {
              setPrimarySource(newPrimary);
              loadStationWeather(station.lat, station.lon, newPrimary, false);
            }}
            onRefresh={() => {
              loadStationWeather(station.lat, station.lon, primarySource, true);
            }}
          />
        </div>
      )}

      {/* ── Charts ──────────────────────────────────────────── */}
      <div className="charts-stack">
        {SENSOR_CONFIG.map(sensor => (
          <div key={sensor.key} className="card chart-card">
            <div className="chart-header">
              <h3 className="chart-title">{sensor.label}</h3>
              <span className="text-muted text-xs">{sensor.unit}</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={readings} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="ts"
                  tickFormatter={v => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  stroke="var(--text-muted)"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={sensor.domain}
                  stroke="var(--text-muted)"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-data)' }}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Anomaly reference lines */}
                {anomalyReadings.slice(-20).map((r, i) => (
                  <ReferenceLine
                    key={i}
                    x={r.ts}
                    stroke={r.severity === 'critical' ? '#A6394F' : '#B5693F'}
                    strokeDasharray="4 2"
                    strokeOpacity={0.5}
                  />
                ))}

                <Line
                  type="monotone"
                  dataKey={sensor.key}
                  stroke={sensor.color}
                  strokeWidth={1.5}
                  dot={<CustomDot />}
                  activeDot={{ r: 5, fill: sensor.color }}
                  name="Raw"
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {showCorrected && (
                  <Line
                    type="monotone"
                    dataKey={sensor.corrected}
                    stroke={sensor.color}
                    strokeWidth={1}
                    strokeDasharray="5 3"
                    dot={false}
                    name="Estimated"
                    opacity={0.7}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      {/* ── Anomaly list ─────────────────────────────────────── */}
      {anomalyReadings.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Anomaly Events</h3>
          <div className="anomaly-list">
            {anomalyReadings.slice(-10).reverse().map((r, i) => (
              <div key={i} className="anomaly-row">
                <span className={`badge badge-${r.severity || 'low'}`}>{r.severity}</span>
                <span className="font-data text-sm">{new Date(r.timestamp).toLocaleString()}</span>
                <span className="text-secondary text-sm">{r.root_cause?.replace(/_/g, ' ')}</span>
                <span className="text-muted text-xs">{r.confidence?.toFixed(0)}% conf.</span>
                {r.anomaly_id && (
                  <Link to={`/anomalies/${r.anomaly_id}`} className="btn btn-ghost" style={{ padding: '2px 10px' }}>
                    Explain →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
