/**
 * Screen 2: Live Network Map
 * Leaflet map with station markers, side panel, click → station detail.
 */
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchStations, createLiveSocket } from '../api/client';
import './LiveMap.css';

const STATUS_COLOR = {
  healthy:  '#7C9B7E',
  warning:  '#D4804F',
  critical: '#A6394F',
  offline:  '#6B5F6A',
};

const SEVERITY_STYLE = {
  healthy:  { radius: 8,  fillOpacity: 0.85 },
  warning:  { radius: 10, fillOpacity: 0.9  },
  critical: { radius: 12, fillOpacity: 0.95 },
  offline:  { radius: 7,  fillOpacity: 0.6  },
};

export default function LiveMap() {
  const [stations, setStations]     = useState([]);
  const [selected, setSelected]     = useState(null);
  const [recentEvents, setRecent]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const wsRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStations().then(s => { setStations(s); setLoading(false); }).catch(() => setLoading(false));

    // Live WebSocket feed
    wsRef.current = createLiveSocket((event) => {
      if (event.event_type === 'snapshot') {
        setStations(event.payload.stations || []);
      }
      if (event.event_type === 'health_update') {
        setStations(prev => prev.map(s =>
          s.station_id === event.payload.station_id
            ? { ...s, health_score: event.payload.health_score,
                status: event.payload.health_score < 30 ? 'critical'
                      : event.payload.health_score < 60 ? 'warning' : 'healthy' }
            : s
        ));
      }
      if (event.event_type === 'anomaly') {
        setRecent(prev => [event.payload, ...prev].slice(0, 10));
        // Update station marker
        setStations(prev => prev.map(s =>
          s.station_id === event.payload.station_id
            ? { ...s, status: event.payload.severity === 'critical' ? 'critical' : 'warning' }
            : s
        ));
      }
    });

    return () => wsRef.current?.close();
  }, []);

  const sel = stations.find(s => s.station_id === selected);

  return (
    <div className="map-page">
      {/* ── Map ──────────────────────────────────────────────── */}
      <div className="map-container">
        {!loading && (
          <MapContainer
            center={[22.5, 82.5]}
            zoom={5}
            style={{ width: '100%', height: '100%' }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {stations.map(station => {
              const color  = STATUS_COLOR[station.status] || STATUS_COLOR.offline;
              const style  = SEVERITY_STYLE[station.status] || SEVERITY_STYLE.offline;
              return (
                <CircleMarker
                  key={station.station_id}
                  center={[station.lat, station.lon]}
                  radius={style.radius}
                  fillColor={color}
                  fillOpacity={style.fillOpacity}
                  color={color}
                  weight={station.status === 'critical' ? 2 : 1}
                  opacity={0.9}
                  eventHandlers={{ click: () => setSelected(station.station_id) }}
                >
                  <Tooltip>
                    <div className="marker-tooltip">
                      <strong>{station.name || station.station_id}</strong>
                      <div>Health: {station.health_score?.toFixed(0) ?? 'N/A'}%</div>
                      <div className={`badge badge-${station.status}`}>{station.status}</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}
        {loading && (
          <div className="map-loading">
            <div className="spinner" />
            <span className="text-secondary">Loading station network…</span>
          </div>
        )}
      </div>

      {/* ── Side panel ───────────────────────────────────────── */}
      <aside className="map-panel">
        {/* Summary stats */}
        <div className="panel-stats">
          {['healthy', 'warning', 'critical', 'offline'].map(status => {
            const count = stations.filter(s => s.status === status).length;
            return (
              <div key={status} className="panel-stat">
                <span className="panel-stat-num font-data">{count}</span>
                <span className={`badge badge-${status}`}>{status}</span>
              </div>
            );
          })}
        </div>

        {/* Station detail when selected */}
        {sel ? (
          <div className="station-detail card-raised" style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }}>
            <div className="station-detail-header">
              <div>
                <h3>{sel.name || sel.station_id}</h3>
                <span className="text-muted text-sm">{sel.station_id} · {sel.region}</span>
              </div>
              <span className={`badge badge-${sel.status}`}>{sel.status}</span>
            </div>
            <div className="station-detail-metrics">
              <div className="detail-row">
                <span className="text-muted text-sm">Health Score</span>
                <span className="font-data">{sel.health_score?.toFixed(1) ?? '—'}%</span>
              </div>
              <div className="detail-row">
                <span className="text-muted text-sm">Elevation</span>
                <span className="font-data">{sel.elevation_m}m</span>
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 'var(--space-4)' }}
              onClick={() => navigate(`/stations/${sel.station_id}`)}
            >
              View Station Detail →
            </button>
          </div>
        ) : (
          <p className="text-muted text-sm" style={{ padding: 'var(--space-4) 0' }}>
            Click a station marker to view details.
          </p>
        )}

        {/* Recent events */}
        <div className="recent-events">
          <h4 className="panel-section-title">Recent Events</h4>
          {recentEvents.length === 0 ? (
            <p className="text-muted text-sm">No events yet — watching…</p>
          ) : (
            recentEvents.map((ev, i) => (
              <div key={i} className="event-row">
                <span className={`badge badge-${ev.severity || 'low'}`}>{ev.severity || 'low'}</span>
                <div className="event-detail">
                  <span className="text-sm">{ev.station_id}</span>
                  <span className="text-muted text-xs">{ev.root_cause?.replace(/_/g, ' ')}</span>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }}
                  onClick={() => ev.anomaly_id && navigate(`/anomalies/${ev.anomaly_id}`)}
                >
                  →
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
