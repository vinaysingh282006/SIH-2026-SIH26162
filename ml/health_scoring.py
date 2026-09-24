"""
SkyGuard AI — Sensor Health Scoring + Predictive Maintenance
=============================================================
Computes a per-station health score (0–100) based on:
  - Anomaly frequency over a rolling 24h window
  - Drift trend magnitude (exponential smoothing of anomaly scores)
  - Communication reliability (dropout rate)
  - Rate-of-change stability

Also forecasts degradation trend and produces maintenance recommendations.
"""

import math
from collections import deque
from datetime import datetime, timezone, timedelta
from typing import Optional

HEALTH_WINDOW_HOURS = 24
MAX_READINGS_PER_WINDOW = 288  # 24h at 5-min intervals

# Weights for health sub-components
W_ANOMALY_RATE  = 0.40
W_DRIFT_TREND   = 0.25
W_COMM_RELIAB   = 0.20
W_ROC_STABILITY = 0.15


class StationHealthTracker:
    """Maintains rolling state for one station's health scoring."""

    def __init__(self, station_id: str):
        self.station_id = station_id
        self._readings: deque = deque(maxlen=MAX_READINGS_PER_WINDOW)
        self._scores:   deque = deque(maxlen=MAX_READINGS_PER_WINDOW)  # anomaly scores
        self._dropouts: deque = deque(maxlen=MAX_READINGS_PER_WINDOW)  # 1 if dropout
        self._ema_score: float = 0.0   # exponential moving average of anomaly score
        self._health_history: list[float] = []  # for trend forecasting

    def push(self, reading: dict, anomaly_score: float) -> None:
        """Update tracker with a new reading and its anomaly score."""
        is_dropout = reading.get("temperature_c") is None
        self._readings.append(reading)
        self._scores.append(anomaly_score)
        self._dropouts.append(1.0 if is_dropout else 0.0)

        # EMA of anomaly score (α = 0.05 for slow smoothing)
        alpha = 0.05
        self._ema_score = alpha * anomaly_score + (1 - alpha) * self._ema_score

    def compute_health(self) -> dict:
        """
        Compute current health score [0–100] and supporting metrics.
        100 = perfectly healthy, 0 = completely degraded.
        """
        n = len(self._scores)
        if n == 0:
            return {
                "health_score":        100.0,
                "anomaly_rate_pct":    0.0,
                "comm_reliability_pct": 100.0,
                "ema_anomaly_score":   0.0,
                "trend":               "stable",
                "maintenance_urgency": "none",
                "days_to_maintenance": None,
            }

        # ── Sub-scores ─────────────────────────────────────────────────────
        anomaly_rate = sum(1 for s in self._scores if s > 0.30) / n
        anomaly_component = max(0.0, 1.0 - anomaly_rate * 4)      # 0.25 rate → 0 health

        drift_component = max(0.0, 1.0 - self._ema_score * 3)

        dropout_rate = sum(self._dropouts) / n
        comm_component = max(0.0, 1.0 - dropout_rate * 5)

        # Rate-of-change stability: std of consecutive diffs in anomaly scores
        if n >= 2:
            diffs = [abs(self._scores[i] - self._scores[i-1]) for i in range(1, n)]
            roc_stability = max(0.0, 1.0 - (sum(diffs) / len(diffs)) * 5)
        else:
            roc_stability = 1.0

        raw_health = (
            W_ANOMALY_RATE  * anomaly_component
            + W_DRIFT_TREND   * drift_component
            + W_COMM_RELIAB   * comm_component
            + W_ROC_STABILITY * roc_stability
        )
        health_score = round(raw_health * 100, 1)
        self._health_history.append(health_score)

        # ── Trend forecasting ───────────────────────────────────────────────
        trend, days_to_maintenance = self._forecast_maintenance(health_score)

        # ── Urgency label ───────────────────────────────────────────────────
        if health_score < 30:
            urgency = "critical"
        elif health_score < 55:
            urgency = "soon"
        elif health_score < 75:
            urgency = "monitor"
        else:
            urgency = "none"

        return {
            "health_score":          health_score,
            "anomaly_rate_pct":      round(anomaly_rate * 100, 1),
            "comm_reliability_pct":  round((1 - dropout_rate) * 100, 1),
            "ema_anomaly_score":     round(self._ema_score, 4),
            "trend":                 trend,
            "maintenance_urgency":   urgency,
            "days_to_maintenance":   days_to_maintenance,
        }

    def _forecast_maintenance(
        self, current_health: float
    ) -> tuple[str, Optional[float]]:
        """
        Simple linear regression on health history to forecast days until
        health drops below 30 (maintenance threshold).
        """
        history = self._health_history[-50:]  # last 50 readings
        if len(history) < 10:
            return "stable", None

        n = len(history)
        xs = list(range(n))
        x_mean = sum(xs) / n
        y_mean = sum(history) / n
        num = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, history))
        den = sum((x - x_mean) ** 2 for x in xs) + 1e-8
        slope = num / den   # health points per reading

        if slope >= 0:
            return "improving" if slope > 0.1 else "stable", None

        # slope is negative → degrading
        readings_to_threshold = (current_health - 30) / abs(slope)
        # Convert readings (5-min intervals) to days
        days = readings_to_threshold * 5 / (60 * 24)
        trend = "degrading" if slope < -0.05 else "stable"
        return trend, round(days, 1)


# ── Global registry ───────────────────────────────────────────────────────────

_trackers: dict[str, StationHealthTracker] = {}


def get_or_create(station_id: str) -> StationHealthTracker:
    if station_id not in _trackers:
        _trackers[station_id] = StationHealthTracker(station_id)
    return _trackers[station_id]


def update(reading: dict, anomaly_score: float) -> dict:
    """Update health tracking for a station and return its current health dict."""
    sid = reading.get("station_id", "unknown")
    tracker = get_or_create(sid)
    tracker.push(reading, anomaly_score)
    return tracker.compute_health()


def get_all_health() -> dict[str, dict]:
    """Return current health for all tracked stations."""
    return {sid: t.compute_health() for sid, t in _trackers.items()}
