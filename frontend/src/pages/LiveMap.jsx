/**
 * Screen 2: Enhanced Live Meteorological & Station Map
 * =====================================================
 * Upgraded with:
 * - Multi-source weather overlay layers (Precipitation Radar, Cloud Cover, Temperature, Wind Speed)
 * - Dynamic Layer Control & meteorological legend UI
 * - Click-to-inspect on any point on Earth with multi-provider telemetry consensus
 * - Deep Space Blue mission control styling & touch responsiveness
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchStations, createLiveSocket } from '../api/client';
import { fetchUnifiedWeather } from '../services/weatherProviders/index.js';
import WeatherComparisonPanel from '../components/WeatherComparisonPanel';
import './LiveMap.css';

// Ensure MapLibre Web Worker loads correctly inside Vite bundles
if (typeof window !== 'undefined') {
  window.maplibregl = maplibregl;
}
try {
  setWorkerUrl(workerUrl);
} catch (e) {
  // worker URL fallback handled internally
}

const STATUS_COLOR = {
  healthy:  '#00FFC8',
  warning:  '#F59E0B',
  critical: '#EF4444',
  offline:  '#4A6080',
};

const SEVERITY_STYLE = {
  healthy:  { radius: 8,  fillOpacity: 0.85 },
  warning:  { radius: 10, fillOpacity: 0.9  },
  critical: { radius: 12, fillOpacity: 0.95 },
  offline:  { radius: 7,  fillOpacity: 0.6  },
};

// Weather layer options
const WEATHER_LAYERS = [
  { id: 'none',          label: 'Off',            icon: '⚪' },
  { id: 'precipitation', label: 'Precip / Radar', icon: '🌧️' },
  { id: 'clouds',        label: 'Clouds',         icon: '☁️' },
  { id: 'temp',          label: 'Temperature',    icon: '🌡️' },
  { id: 'wind',          label: 'Wind Speed',     icon: '💨' },
];

/**
 * OpenFreeMap vector layer powered by MapLibre GL
 */
function OpenFreeMapLayer({ styleName = 'liberty' }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    let glLayer = null;
    try {
      glLayer = L.maplibreGL({
        style: `https://tiles.openfreemap.org/styles/${styleName}`,
        attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      });
      glLayer.addTo(map);
    } catch (err) {
      console.warn('[OpenFreeMap] GL Layer init notice:', err);
    }

    return () => {
      if (glLayer && map) {
        try {
          map.removeLayer(glLayer);
        } catch (e) {
          // ignore cleanup errors
        }
      }
    };
  }, [map, styleName]);

  return null;
}

/**
 * Controller to smoothly pan/zoom map to specific coordinates (e.g. India)
 */
function MapController({ targetCenter, targetZoom }) {
  const map = useMap();
  useEffect(() => {
    if (targetCenter) {
      map.flyTo(targetCenter, targetZoom || 5, { duration: 1.2 });
    }
  }, [targetCenter, targetZoom, map]);
  return null;
}

/**
 * Child component to capture click events anywhere on the Leaflet map canvas
 */
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

export default function LiveMap() {
  const [stations, setStations]           = useState([]);
  const [selectedStation, setSelected]   = useState(null);
  const [recentEvents, setRecent]         = useState([]);
  const [loading, setLoading]             = useState(true);

  // Weather overlay & inspection state
  const [activeLayer, setActiveLayer]     = useState('precipitation');
  const [baseMapStyle, setBaseMapStyle]   = useState('openfreemap'); // 'openfreemap' | 'dark' | 'osm'
  const [inspectedPoint, setInspected]    = useState(null);
  const [inspectWeather, setInspectWeather] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError]   = useState(null);
  const [primarySource, setPrimarySource] = useState('open-meteo');

  // Real-time radar timestamp path from RainViewer (covers India Doppler radars)
  const [radarPath, setRadarPath]         = useState(null);
  const [mapTarget, setMapTarget]         = useState({ center: [22.5, 82.5], zoom: 5 });

  const wsRef = useRef(null);
  const navigate = useNavigate();

  // Environment key check for OpenWeatherMap tile overlays
  const owmKey = import.meta.env.VITE_OPENWEATHERMAP_API_KEY || '';
  const hasOwmKey = Boolean(owmKey && !owmKey.includes('your_'));

  // Fetch real-time RainViewer radar frame
  useEffect(() => {
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then((r) => r.json())
      .then((data) => {
        const past = data.radar?.past;
        if (Array.isArray(past) && past.length > 0) {
          setRadarPath(past[past.length - 1].path);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStations()
      .then((s) => {
        setStations(s);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Live WebSocket feed
    wsRef.current = createLiveSocket((event) => {
      if (event.event_type === 'snapshot') {
        setStations(event.payload.stations || []);
      }
      if (event.event_type === 'health_update') {
        setStations((prev) =>
          prev.map((s) =>
            s.station_id === event.payload.station_id
              ? {
                  ...s,
                  health_score: event.payload.health_score,
                  status:
                    event.payload.health_score < 30
                      ? 'critical'
                      : event.payload.health_score < 60
                      ? 'warning'
                      : 'healthy',
                }
              : s
          )
        );
      }
      if (event.event_type === 'anomaly') {
        setRecent((prev) => [event.payload, ...prev].slice(0, 10));
        setStations((prev) =>
          prev.map((s) =>
            s.station_id === event.payload.station_id
              ? { ...s, status: event.payload.severity === 'critical' ? 'critical' : 'warning' }
              : s
          )
        );
      }
    });

    return () => wsRef.current?.close();
  }, []);

  // Fetch weather when inspecting a coordinate or station
  const loadPointWeather = useCallback(async (lat, lon, preferredSource = primarySource, bypassCache = false) => {
    setInspectLoading(true);
    setInspectError(null);
    try {
      const data = await fetchUnifiedWeather({
        lat,
        lon,
        primarySourceId: preferredSource,
        bypassCache,
      });
      setInspectWeather(data);
    } catch (err) {
      setInspectError(err.message || 'Failed to fetch weather for selected point.');
      setInspectWeather(null);
    } finally {
      setInspectLoading(false);
    }
  }, [primarySource]);

  // Handle map click for click-to-inspect
  const handleMapClick = (latlng) => {
    const lat = Number(latlng.lat.toFixed(4));
    const lon = Number(latlng.lng.toFixed(4));
    setInspected({ lat, lon, name: `Location (${lat}°, ${lon}°)` });
    setSelected(null); // Switch focus to inspected point
    loadPointWeather(lat, lon);
  };

  // Handle station marker click
  const handleStationClick = (station) => {
    setSelected(station.station_id);
    setInspected({
      lat: station.lat,
      lon: station.lon,
      name: station.name || station.station_id,
      stationId: station.station_id,
      region: station.region,
    });
    loadPointWeather(station.lat, station.lon);
  };

  const sel = stations.find((s) => s.station_id === selectedStation);

  // Determine active overlay tile URL
  const getOverlayTileUrl = () => {
    if (activeLayer === 'none') return null;

    // Precipitation radar: ALWAYS use the live RainViewer Doppler radar network!
    // It is 100% free, updated continuously, and never throws 401 key latency.
    if (activeLayer === 'precipitation') {
      if (radarPath) {
        return `https://tilecache.rainviewer.com${radarPath}/256/{z}/{x}/{y}/2/1_1.png`;
      }
      return 'https://tilecache.rainviewer.com/v2/radar/nowcast_5/256/{z}/{x}/{y}/2/1_1.png';
    }

    // Clouds, Temperature, Wind: stream from OpenWeatherMap when key is configured
    if (hasOwmKey) {
      const layerName = {
        clouds: 'clouds_new',
        temp: 'temp_new',
        wind: 'wind_new',
      }[activeLayer];
      if (layerName) {
        return `https://tile.openweathermap.org/map/${layerName}/{z}/{x}/{y}.png?appid=${owmKey}`;
      }
    }

    // For other layers without key, fall back cleanly
    return null;
  };

  const overlayUrl = getOverlayTileUrl();

  return (
    <div className="map-page">
      {/* ── Map Canvas Container ───────────────────────────────── */}
      <div className="map-container">
        {!loading && (
          <MapContainer
            center={mapTarget.center}
            zoom={mapTarget.zoom}
            minZoom={3}
            maxZoom={18}
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
          >
            {/* Smooth Pan / Zoom Controller */}
            <MapController targetCenter={mapTarget.center} targetZoom={mapTarget.zoom} />

            {/* Click-to-inspect listener */}
            <MapClickHandler onMapClick={handleMapClick} />

            {/* Base Tile Layer: OpenFreeMap Vector, Dark Space, or OSM */}
            {baseMapStyle === 'openfreemap' ? (
              <OpenFreeMapLayer styleName="liberty" />
            ) : baseMapStyle === 'dark' ? (
              <TileLayer
                attribution='&copy; <a href="https://www.esri.com/">Esri</a>, USGS, NOAA'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                maxZoom={16}
              />
            ) : (
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
            )}

            {/* Weather Overlay Tile Layer with maxNativeZoom to prevent zoom-not-supported tiles */}
            {overlayUrl && (
              <TileLayer
                key={`${activeLayer}-${hasOwmKey ? 'owm' : 'radar'}-${radarPath}`}
                url={overlayUrl}
                opacity={0.65}
                zIndex={20}
                maxZoom={18}
                maxNativeZoom={hasOwmKey ? 12 : 7}
              />
            )}

            {/* Station Circle Markers */}
            {stations.map((station) => {
              const color = STATUS_COLOR[station.status] || STATUS_COLOR.offline;
              const style = SEVERITY_STYLE[station.status] || SEVERITY_STYLE.offline;
              const isSelected = selectedStation === station.station_id;

              return (
                <CircleMarker
                  key={station.station_id}
                  center={[station.lat, station.lon]}
                  radius={isSelected ? style.radius + 4 : style.radius}
                  fillColor={color}
                  fillOpacity={style.fillOpacity}
                  color={isSelected ? '#FFFFFF' : color}
                  weight={isSelected ? 3 : station.status === 'critical' ? 2 : 1}
                  opacity={0.95}
                  eventHandlers={{
                    click: (e) => {
                      e.originalEvent?.stopPropagation();
                      handleStationClick(station);
                    },
                  }}
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

            {/* Inspected Point Marker */}
            {inspectedPoint && (
              <CircleMarker
                center={[inspectedPoint.lat, inspectedPoint.lon]}
                radius={11}
                fillColor="#00D4FF"
                fillOpacity={0.8}
                color="#FFFFFF"
                weight={2}
                className="inspected-pulse-marker"
              >
                <Popup>
                  <div className="inspect-popup">
                    <strong>{inspectedPoint.name}</strong>
                    <div className="text-xs text-muted">
                      {inspectedPoint.lat.toFixed(4)}°N, {inspectedPoint.lon.toFixed(4)}°E
                    </div>
                    {inspectLoading && <p className="text-xs text-secondary">Fetching multi-source telemetry...</p>}
                    {inspectWeather && inspectWeather.primary && (
                      <div className="inspect-popup-weather">
                        <span className="ipw-temp">{inspectWeather.primary.icon} {inspectWeather.primary.tempC}°C</span>
                        <span className="ipw-cond">{inspectWeather.primary.condition}</span>
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            )}
          </MapContainer>
        )}

        {loading && (
          <div className="map-loading">
            <div className="spinner" />
            <span className="text-secondary">Initializing mission-control telemetry grid…</span>
          </div>
        )}

        {/* ── Floating Layer Controls & Legend ───────────────────── */}
        <div className="map-overlay-controls">
          <div className="layer-picker-card">
            <div className="layer-picker-header">
              <span className="layer-picker-title">WEATHER OVERLAYS</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-snap-india"
                  onClick={() => setMapTarget({ center: [22.5, 82.5], zoom: 5 })}
                  title="Center on India Meteorological Network"
                >
                  🇮🇳 India
                </button>
                <span className="layer-source-tag">
                  {hasOwmKey ? 'OWM PRO' : activeLayer === 'precipitation' ? 'OPEN RADAR' : 'SIM'}
                </span>
              </div>
            </div>

            <div className="layer-buttons-row">
              {WEATHER_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  className={`layer-btn ${activeLayer === layer.id ? 'active' : ''}`}
                  onClick={() => setActiveLayer(layer.id)}
                  title={`Toggle ${layer.label}`}
                >
                  <span className="layer-btn-icon">{layer.icon}</span>
                  <span className="layer-btn-label">{layer.label}</span>
                </button>
              ))}
            </div>

            {/* Free key helper notice when OpenWeatherMap key is unconfigured */}
            {!hasOwmKey && (activeLayer === 'clouds' || activeLayer === 'temp' || activeLayer === 'wind') && (
              <div className="layer-key-notice">
                <span className="lkn-msg">
                  ⚠️ <strong>Weather Overlay:</strong> Colored satellite tiles for <em>{activeLayer}</em> require an OpenWeatherMap API key in <code>.env</code>.
                </span>
                <span className="lkn-hint">
                  ✓ The <strong>Dark Space</strong> base map is 100% free and needs no key.
                  <br />
                  💡 Tap any station circle on the map to see real live {activeLayer} readings from Open-Meteo without a key!
                </span>
              </div>
            )}

            {/* Base map style toggle: OpenFreeMap, Dark Space, or OSM */}
            <div className="basemap-toggle-row">
              <span className="text-xs text-muted">Base Map:</span>
              <button
                className={`basemap-btn ${baseMapStyle === 'openfreemap' ? 'active' : ''}`}
                onClick={() => setBaseMapStyle('openfreemap')}
                title="Vector tile street map powered by OpenFreeMap"
              >
                OpenFreeMap
              </button>
              <button
                className={`basemap-btn ${baseMapStyle === 'dark' ? 'active' : ''}`}
                onClick={() => setBaseMapStyle('dark')}
                title="Dark Space (Clean & Watermark-Free Esri Canvas)"
              >
                Dark Space
              </button>
              <button
                className={`basemap-btn ${baseMapStyle === 'osm' ? 'active' : ''}`}
                onClick={() => setBaseMapStyle('osm')}
                title="Standard OpenStreetMap"
              >
                OSM
              </button>
            </div>

            {/* Dynamic Legend */}
            {activeLayer !== 'none' && (
              <div className="map-legend">
                <div className="legend-label-row">
                  <span>
                    {activeLayer === 'precipitation' && 'Rain Intensity (mm/h)'}
                    {activeLayer === 'clouds' && 'Cloud Density (%)'}
                    {activeLayer === 'temp' && 'Temperature (°C)'}
                    {activeLayer === 'wind' && 'Wind Speed (km/h)'}
                  </span>
                </div>
                <div className={`legend-bar legend-bar-${activeLayer}`} />
                <div className="legend-scale-row">
                  {activeLayer === 'precipitation' && <><span>Light</span><span>Moderate</span><span>Heavy</span></>}
                  {activeLayer === 'clouds' && <><span>0%</span><span>50%</span><span>100%</span></>}
                  {activeLayer === 'temp' && <><span>-10°</span><span>15°</span><span>40°C</span></>}
                  {activeLayer === 'wind' && <><span>0</span><span>40</span><span>100+</span></>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Click-to-inspect helper pill */}
        <div className="map-inspect-hint">
          <span className="hint-icon">🎯</span>
          <span>Click anywhere on the map to inspect live multi-source weather</span>
        </div>
      </div>

      {/* ── Side Telemetry Panel ───────────────────────────────── */}
      <aside className="map-panel">
        {/* Network summary stats */}
        <div className="panel-stats">
          {['healthy', 'warning', 'critical', 'offline'].map((status) => {
            const count = stations.filter((s) => s.status === status).length;
            return (
              <div key={status} className="panel-stat">
                <span className="panel-stat-num font-data">{count}</span>
                <span className={`badge badge-${status}`}>{status}</span>
              </div>
            );
          })}
        </div>

        {/* Station or Inspected Point Card */}
        {inspectedPoint ? (
          <div className="inspection-card card-raised">
            <div className="inspection-card-header">
              <div>
                <span className="inspection-badge">
                  {selectedStation ? 'STATION TELEMETRY' : 'GEOSPATIAL INSPECTION'}
                </span>
                <h3 className="inspection-title">{inspectedPoint.name}</h3>
                <span className="text-muted text-xs font-mono">
                  {inspectedPoint.lat.toFixed(4)}°N, {inspectedPoint.lon.toFixed(4)}°E
                </span>
              </div>
              <button
                className="btn-close-inspect"
                onClick={() => {
                  setInspected(null);
                  setSelected(null);
                  setInspectWeather(null);
                }}
                title="Dismiss inspection"
              >
                ✕
              </button>
            </div>

            {selectedStation && sel && (
              <div className="station-quick-meta">
                <div className="detail-row">
                  <span className="text-muted text-sm">Station Health</span>
                  <span className={`badge badge-${sel.status}`}>
                    {sel.health_score?.toFixed(1) ?? '—'}% ({sel.status})
                  </span>
                </div>
                <div className="detail-row">
                  <span className="text-muted text-sm">Elevation</span>
                  <span className="font-data">{sel.elevation_m}m</span>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '0.75rem' }}
                  onClick={() => navigate(`/stations/${sel.station_id}`)}
                >
                  Full Station Analytics & Forecast →
                </button>
              </div>
            )}

            {/* Live Weather Comparison Panel */}
            <WeatherComparisonPanel
              weatherData={inspectWeather}
              isLoading={inspectLoading}
              onSelectPrimary={(newPrimaryId) => {
                setPrimarySource(newPrimaryId);
                loadPointWeather(inspectedPoint.lat, inspectedPoint.lon, newPrimaryId, false);
              }}
              onRefresh={() => {
                loadPointWeather(inspectedPoint.lat, inspectedPoint.lon, primarySource, true);
              }}
            />

            {inspectError && (
              <div className="inspect-error-box">
                <span className="text-xs text-red">⚠️ {inspectError}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-selection-card">
            <div className="empty-icon">📍</div>
            <h4>Geospatial Inspector Active</h4>
            <p className="text-muted text-sm">
              Click any weather station circle or tap anywhere on the map to trigger multi-provider cross-validation.
            </p>
          </div>
        )}

        {/* Recent Anomaly Events */}
        <div className="recent-events">
          <h4 className="panel-section-title">Live Anomaly Stream</h4>
          {recentEvents.length === 0 ? (
            <p className="text-muted text-sm">Monitoring atmospheric sensors in real-time…</p>
          ) : (
            recentEvents.map((ev, i) => (
              <div key={i} className="event-row">
                <span className={`badge badge-${ev.severity || 'low'}`}>{ev.severity || 'low'}</span>
                <div className="event-detail">
                  <span className="text-sm font-data">{ev.station_id}</span>
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
