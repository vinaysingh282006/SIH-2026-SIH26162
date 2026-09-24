/**
 * SkyGuard AI — Unified Multi-Source Weather Aggregator
 * ======================================================
 * Features:
 * - Parallel fetching across all registered providers
 * - Automatic fallback if the primary provider fails or times out
 * - In-memory and localStorage cache with 10-minute TTL to respect API quotas
 * - Side-by-side delta calculation for the multi-source comparison panel
 */

import { OpenMeteoProvider } from './openMeteo.js';
import { OpenWeatherMapProvider } from './openWeatherMap.js';
import { NwsProvider } from './nws.js';
import { MeteoblueProvider } from './meteoblue.js';

export const ALL_PROVIDERS = [
  OpenMeteoProvider,
  OpenWeatherMapProvider,
  NwsProvider,
  MeteoblueProvider,
];

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const memoryCache = new Map();

function getCacheKey(lat, lon) {
  return `skyguard_weather_${lat.toFixed(3)}_${lon.toFixed(3)}`;
}

function readCache(key) {
  // Check in-memory first
  const memEntry = memoryCache.get(key);
  if (memEntry && Date.now() - memEntry.timestamp < CACHE_TTL_MS) {
    return memEntry.data;
  }

  // Check localStorage
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        memoryCache.set(key, parsed);
        return parsed.data;
      } else {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {
    // localStorage might be unavailable or disabled
  }
  return null;
}

function writeCache(key, data) {
  const entry = { timestamp: Date.now(), data };
  memoryCache.set(key, entry);
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    // Silently ignore quota exceeded or security errors
  }
}

/**
 * Returns metadata about which providers are active and configured.
 */
export function getAvailableProviders() {
  return ALL_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    isEnabled: p.isEnabled(),
  }));
}

/**
 * Main aggregator: queries all enabled providers in parallel, calculates deltas,
 * handles fallback, and caches results.
 * 
 * @param {Object} params
 * @param {number} params.lat - Latitude
 * @param {number} params.lon - Longitude
 * @param {string} [params.primarySourceId] - Preferred primary provider ID (defaults to 'open-meteo')
 * @param {boolean} [params.bypassCache=false] - Force fresh network fetch
 */
export async function fetchUnifiedWeather({ lat, lon, primarySourceId = 'open-meteo', bypassCache = false }) {
  const cacheKey = getCacheKey(lat, lon);

  if (!bypassCache) {
    const cached = readCache(cacheKey);
    if (cached) {
      return { ...cached, cacheHit: true };
    }
  }

  // Fetch in parallel across all registered providers
  const promises = ALL_PROVIDERS.map(async (provider) => {
    if (!provider.isEnabled()) {
      return {
        sourceId: provider.id,
        sourceName: provider.name,
        status: 'disabled',
        error: `Provider '${provider.name}' is disabled (API key or credentials not configured).`,
        data: null,
      };
    }

    try {
      const data = await provider.fetchWeather({ lat, lon });
      return {
        sourceId: provider.id,
        sourceName: provider.name,
        status: 'success',
        data,
      };
    } catch (err) {
      console.warn(`[SkyGuard Weather] ${provider.name} failed:`, err.message);
      return {
        sourceId: provider.id,
        sourceName: provider.name,
        status: 'error',
        error: err.message || 'Unknown network error',
        data: null,
      };
    }
  });

  const results = await Promise.all(promises);

  // Find preferred primary provider, or fallback to first successful one
  let primaryResult = results.find((r) => r.sourceId === primarySourceId && r.status === 'success');
  if (!primaryResult) {
    primaryResult = results.find((r) => r.status === 'success');
  }

  if (!primaryResult || !primaryResult.data) {
    throw new Error('All weather providers failed or are unavailable for this coordinate.');
  }

  const primaryData = primaryResult.data;

  // Build comparison summaries with delta calculations
  const comparisons = results.map((r) => {
    if (r.status === 'success' && r.data) {
      const diff = Number((r.data.tempC - primaryData.tempC).toFixed(1));
      return {
        sourceId: r.sourceId,
        sourceName: r.sourceName,
        status: 'success',
        tempC: r.data.tempC,
        tempF: r.data.tempF,
        condition: r.data.condition,
        icon: r.data.icon,
        humidity: r.data.humidity,
        windSpeed: r.data.windSpeed,
        tempDiffC: diff,
        isPrimary: r.sourceId === primaryResult.sourceId,
      };
    }
    return {
      sourceId: r.sourceId,
      sourceName: r.sourceName,
      status: r.status,
      error: r.error,
      isPrimary: false,
    };
  });

  const responsePayload = {
    primary: primaryData,
    comparisons,
    allData: results.filter((r) => r.status === 'success').map((r) => r.data),
    cacheHit: false,
    timestamp: Date.now(),
  };

  writeCache(cacheKey, responsePayload);
  return responsePayload;
}

export function clearWeatherCache() {
  memoryCache.clear();
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith('skyguard_weather_')) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {
    // Ignore
  }
}
