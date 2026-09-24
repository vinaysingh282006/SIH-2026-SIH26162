import React from 'react';
import './WeatherComparisonPanel.css';

/**
 * SkyGuard AI — Multi-Source Weather Comparison Panel
 * ====================================================
 * Displays side-by-side consensus across Open-Meteo, OpenWeatherMap, NOAA NWS, and Meteoblue.
 * Shows temperature deltas, provider status, and lets users toggle primary provider.
 */

export default function WeatherComparisonPanel({
  weatherData,
  onSelectPrimary,
  onRefresh,
  isLoading = false,
}) {
  if (!weatherData) return null;

  const { primary, comparisons = [], cacheHit, timestamp } = weatherData;

  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  return (
    <div className="weather-comparison-panel">
      {/* Header */}
      <div className="wcp-header">
        <div className="wcp-title-group">
          <div className="wcp-icon-badge">📡</div>
          <div>
            <h4 className="wcp-title">Multi-Source Meteorological Consensus</h4>
            <p className="wcp-subtitle">
              Synchronized cross-validation across global meteorological providers
            </p>
          </div>
        </div>

        <div className="wcp-actions">
          {cacheHit && (
            <span className="wcp-cache-badge" title="Data cached locally to conserve rate limits (10m TTL)">
              ⚡ Cached ({formattedTime})
            </span>
          )}
          {onRefresh && (
            <button
              className="wcp-refresh-btn"
              onClick={onRefresh}
              disabled={isLoading}
              title="Force fresh network fetch from all providers"
            >
              {isLoading ? 'Fetching...' : '↻ Refresh'}
            </button>
          )}
        </div>
      </div>

      {/* Primary Banner */}
      {primary && (
        <div className="wcp-primary-card">
          <div className="wcp-primary-left">
            <span className="wcp-primary-tag">PRIMARY SOURCE: {primary.source}</span>
            <div className="wcp-primary-temp-row">
              <span className="wcp-primary-icon">{primary.icon}</span>
              <span className="wcp-primary-temp">{primary.tempC}°C</span>
              <span className="wcp-primary-temp-f">({primary.tempF}°F)</span>
              <span className="wcp-primary-cond">{primary.condition}</span>
            </div>
          </div>

          <div className="wcp-primary-metrics">
            <div className="wcp-metric-item">
              <span className="wcp-metric-label">Feels Like</span>
              <span className="wcp-metric-val">{primary.feelsLike}°C</span>
            </div>
            <div className="wcp-metric-item">
              <span className="wcp-metric-label">Humidity</span>
              <span className="wcp-metric-val">{primary.humidity}%</span>
            </div>
            <div className="wcp-metric-item">
              <span className="wcp-metric-label">Wind</span>
              <span className="wcp-metric-val">{primary.windSpeed} km/h</span>
            </div>
            <div className="wcp-metric-item">
              <span className="wcp-metric-label">Precip</span>
              <span className="wcp-metric-val">{primary.precipitation} mm</span>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Grid */}
      <div className="wcp-grid">
        {comparisons.map((c) => {
          const isSuccess = c.status === 'success';
          const isDisabled = c.status === 'disabled';
          const isErr = c.status === 'error';

          return (
            <div
              key={c.sourceId}
              className={`wcp-source-card ${c.isPrimary ? 'is-active-primary' : ''} ${isDisabled ? 'is-disabled' : ''}`}
            >
              <div className="wcp-sc-top">
                <span className="wcp-sc-name">{c.sourceName}</span>
                {c.isPrimary ? (
                  <span className="wcp-badge-primary">Active</span>
                ) : isSuccess ? (
                  <button
                    className="wcp-btn-set-primary"
                    onClick={() => onSelectPrimary && onSelectPrimary(c.sourceId)}
                    title="Promote to Primary Source"
                  >
                    Set Primary
                  </button>
                ) : isDisabled ? (
                  <span className="wcp-badge-unconfigured" title={c.error}>
                    No API Key
                  </span>
                ) : (
                  <span className="wcp-badge-error" title={c.error}>
                    Offline
                  </span>
                )}
              </div>

              {isSuccess ? (
                <div className="wcp-sc-body">
                  <div className="wcp-sc-reading">
                    <span className="wcp-sc-icon">{c.icon}</span>
                    <span className="wcp-sc-temp">{c.tempC}°C</span>
                    {c.tempDiffC !== undefined && (
                      <span
                        className={`wcp-sc-delta ${
                          c.tempDiffC === 0
                            ? 'delta-zero'
                            : c.tempDiffC > 0
                            ? 'delta-pos'
                            : 'delta-neg'
                        }`}
                        title="Variance from primary provider"
                      >
                        {c.tempDiffC > 0 ? `+${c.tempDiffC}` : c.tempDiffC}°C
                      </span>
                    )}
                  </div>
                  <div className="wcp-sc-meta">
                    <span>{c.condition}</span>
                    <span>💨 {c.windSpeed} km/h</span>
                    <span>💧 {c.humidity}%</span>
                  </div>
                </div>
              ) : (
                <div className="wcp-sc-fallback-note">
                  <p className="wcp-sc-err-msg">{c.error || 'Provider data currently unavailable'}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
