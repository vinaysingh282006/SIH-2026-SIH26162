"""
SkyGuard AI — Cross-Sensor Consistency Layer
=============================================
Layer 4: Physical plausibility rules + learned correlation checks.

Checks:
  1. Dew-point consistency: if humidity is low, temperature shouldn't be near or
     below the computed dew point.
  2. Pressure-temperature correlation: a rapid temperature spike without any
     pressure change is physically unusual (for sensor-fault scenarios).
  3. Rate-of-change cross-check: if temperature spikes but pressure/humidity
     remain flat, flag cross-sensor inconsistency.
"""

import math
from data.schema import (
    FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY, Severity
)


def _dewpoint(temp_c: float, humidity_pct: float) -> float:
    """Magnus formula dew point (°C)."""
    a, b = 17.27, 237.7
    alpha = (a * temp_c) / (b + temp_c) + math.log(max(humidity_pct, 1) / 100.0)
    return (b * alpha) / (a - alpha)


def detect_cross_sensor(window_readings: list[dict]) -> dict:
    """
    Check a short window (last 3–6 readings) for cross-sensor inconsistencies.

    Args:
        window_readings: list of reading dicts (latest last)

    Returns:
        {score, is_anomaly, flags, layer}
    """
    if len(window_readings) < 2:
        return {"score": 0.0, "is_anomaly": False, "flags": [], "layer": "cross_sensor"}

    latest = window_readings[-1]
    prev   = window_readings[-2]

    flags  = []
    scores = []

    t1 = latest.get(FIELD_TEMPERATURE)
    p1 = latest.get(FIELD_PRESSURE)
    h1 = latest.get(FIELD_HUMIDITY)
    t0 = prev.get(FIELD_TEMPERATURE)
    p0 = prev.get(FIELD_PRESSURE)
    h0 = prev.get(FIELD_HUMIDITY)

    if any(v is None for v in [t1, p1, h1, t0, p0, h0]):
        return {"score": 0.5, "is_anomaly": True, "flags": ["missing_values"], "layer": "cross_sensor"}

    # ── Rule 1: Dew-point physical plausibility ──────────────────────────────
    try:
        dp = _dewpoint(t1, h1)
        if t1 < dp - 0.5:
            flags.append(f"temp_below_dewpoint(T={t1:.1f},DP={dp:.1f})")
            scores.append(1.4)
        elif t1 < dp + 1.0:
            flags.append(f"temp_near_dewpoint(T={t1:.1f},DP={dp:.1f})")
            scores.append(0.6)
    except (ValueError, ZeroDivisionError):
        pass

    # ── Rule 2: Humidity out of plausible range given temperature ────────────
    # Hot desert sensor (>45°C) rarely above 90% humidity
    if t1 > 45 and h1 > 90:
        flags.append(f"hot_high_humidity(T={t1:.1f},H={h1:.1f})")
        scores.append(1.2)

    # ── Rule 3: Cross-sensor spike detection ─────────────────────────────────
    delta_t = abs(t1 - t0)
    delta_p = abs(p1 - p0)
    delta_h = abs(h1 - h0)

    # Large temperature jump with no pressure/humidity movement
    if delta_t > 8.0 and delta_p < 0.3 and delta_h < 2.0:
        flags.append(f"temp_spike_no_pressure_change(ΔT={delta_t:.1f})")
        scores.append(1.6)

    # Large pressure jump with no temperature movement (possible sensor fault)
    if delta_p > 10.0 and delta_t < 1.0:
        flags.append(f"pressure_spike_no_temp_change(ΔP={delta_p:.1f})")
        scores.append(1.3)

    # Both temperature and humidity jump in opposite direction (physically expected)
    # — if they don't (both jump same direction), suspicious
    if delta_t > 5.0 and delta_h > 10.0:
        # Normally temp ↑ → humidity ↓ (inverse). If both go up together → flag
        if (t1 - t0) > 0 and (h1 - h0) > 0:
            flags.append(f"temp_hum_both_spike(ΔT={t1-t0:.1f},ΔH={h1-h0:.1f})")
            scores.append(0.9)

    score = max(scores) if scores else 0.0
    is_anomaly = score > 0.5

    return {
        "score":      round(score, 4),
        "is_anomaly": is_anomaly,
        "flags":      flags,
        "layer":      "cross_sensor",
    }
