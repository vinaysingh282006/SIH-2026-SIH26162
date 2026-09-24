/**
 * SkyGuard AI — API Client
 * All REST + WebSocket calls to the backend.
 * Base URLs from env vars (Vite exposes VITE_ prefix).
 */

// Smart base URL resolution (handles Vite local dev, single Render URL, and split service deployments)
const resolveApiBase = () => {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== 'undefined') {
    if (window.location.port === '5173' || window.location.port === '5174') {
      return 'http://localhost:8000';
    }
    return window.location.origin;
  }
  return 'http://localhost:8000';
};

const resolveWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (typeof window !== 'undefined') {
    if (window.location.port === '5173' || window.location.port === '5174') {
      return 'ws://localhost:8000/live';
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/live`;
  }
  return 'ws://localhost:8000/live';
};

const API_BASE = resolveApiBase();
const WS_URL   = resolveWsUrl();

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Stations ──────────────────────────────────────────────────────
export const fetchStations      = ()    => apiFetch('/stations/');
export const fetchStation       = (id)  => apiFetch(`/stations/${id}`);
export const fetchStationReadings = (id, limit = 200) =>
  apiFetch(`/stations/${id}/readings?limit=${limit}`);

// ── Anomalies ─────────────────────────────────────────────────────
export const fetchAnomalies = (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null)
  ).toString();
  return apiFetch(`/anomalies/${qs ? '?' + qs : ''}`);
};
export const fetchAnomaly        = (id) => apiFetch(`/anomalies/${id}`);
export const fetchAnomalyExplain = (id) => apiFetch(`/anomalies/${id}/explain`);

// ── Health ────────────────────────────────────────────────────────
export const fetchAllHealth     = ()    => apiFetch('/sensor-health/');
export const fetchStationHealth = (id)  => apiFetch(`/sensor-health/${id}`);

// ── Alerts ────────────────────────────────────────────────────────
export const fetchAlerts   = (limit = 50) => apiFetch(`/alerts/?limit=${limit}`);
export const markAlertRead = (id)         => apiFetch(`/alerts/${id}/read`, { method: 'PATCH' });

// ── Demo Mode ─────────────────────────────────────────────────────
export const injectAnomaly = (station_id, anomaly_type) =>
  apiFetch('/inject-anomaly/', {
    method: 'POST',
    body: JSON.stringify({ station_id, anomaly_type }),
  });

// ── Config ────────────────────────────────────────────────────────
export const fetchSettings    = ()        => apiFetch('/config/settings');
export const updateSettings   = (updates) => apiFetch('/config/settings', {
  method: 'PATCH',
  body: JSON.stringify(updates),
});
export const fetchEvalResults = ()        => apiFetch('/config/eval-results');

// ── WebSocket factory ─────────────────────────────────────────────
export function createLiveSocket(onEvent) {
  const ws = new WebSocket(WS_URL);

  ws.onopen    = () => console.log('[WS] Connected to SkyGuard live feed');
  ws.onclose   = () => console.log('[WS] Disconnected');
  ws.onerror   = (e) => console.error('[WS] Error', e);
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
    } catch { /* ignore malformed */ }
  };

  return ws;
}
