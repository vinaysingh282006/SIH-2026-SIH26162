"""
SkyGuard AI — Self-Healing Imputation Module
=============================================
Proposes corrected values for anomalous readings.
Strategies (selected by best available context):
  1. Spatial interpolation (IDW from neighbours)  — preferred when neighbours available
  2. Seasonal-naive interpolation (same time-of-day, 7 readings ago)
  3. Linear interpolation from adjacent non-anomalous readings
  4. Last-known-good value (fallback)

All corrections are clearly marked as ESTIMATED — raw data is never overwritten.
An audit trail entry is returned with every correction.
"""

from datetime import datetime, timezone
from typing import Optional

from ml.spatial_consistency import _idw_estimate, _STATIONS
from data.schema import SENSOR_VARS, FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY


def _linear_interp(
    before_val: Optional[float],
    after_val:  Optional[float],
) -> Optional[float]:
    """Simple linear midpoint interpolation."""
    if before_val is None and after_val is None:
        return None
    if before_val is None:
        return after_val
    if after_val is None:
        return before_val
    return (before_val + after_val) / 2.0


def _seasonal_naive(
    history: list[dict],
    sensor: str,
    period: int = 288,   # 24h at 5-min = 288 steps
) -> Optional[float]:
    """Return reading from `period` steps ago (same time yesterday)."""
    if len(history) < period:
        return None
    val = history[-period].get(sensor)
    return val


def impute(
    reading: dict,
    history: list[dict],
    neighbour_readings: list[dict],
) -> dict:
    """
    Compute corrected values for a suspect reading.

    Returns a dict with:
      corrected_{sensor}:   corrected value (or None if unable)
      imputation_strategy:  which strategy was used per sensor
      audit_trail:          human-readable log entry
      is_estimated:         True (always)
    """
    lat = reading.get("lat")
    lon = reading.get("lon")

    corrections   = {}
    strategies    = {}
    audit_entries = []

    for sensor in SENSOR_VARS:
        raw_val = reading.get(sensor)
        corrected = None
        strategy  = None

        # Strategy 1: Spatial IDW (best quality)
        if neighbour_readings and lat is not None and lon is not None:
            idw_val = _idw_estimate(lat, lon, neighbour_readings, sensor)
            if idw_val is not None:
                corrected = round(idw_val, 2)
                strategy  = "spatial_idw"

        # Strategy 2: Seasonal naive (if spatial unavailable)
        if corrected is None and history:
            sn_val = _seasonal_naive(history, sensor)
            if sn_val is not None:
                corrected = round(float(sn_val), 2)
                strategy  = "seasonal_naive"

        # Strategy 3: Linear interpolation from before/after
        if corrected is None and len(history) >= 2:
            before = history[-2].get(sensor) if len(history) >= 2 else None
            after  = None   # we don't have future readings at inference time
            lin_val = _linear_interp(before, after)
            if lin_val is not None:
                corrected = round(float(lin_val), 2)
                strategy  = "linear_interpolation"

        # Strategy 4: Last-known-good
        if corrected is None and history:
            for past in reversed(history[:-1]):
                if past.get(sensor) is not None:
                    corrected = round(float(past[sensor]), 2)
                    strategy  = "last_known_good"
                    break

        corrections[f"corrected_{sensor}"] = corrected
        strategies[sensor] = strategy

        if raw_val is None:
            audit_entries.append(
                f"{sensor}: raw=MISSING → corrected={corrected} via {strategy}"
            )
        elif corrected is not None and abs(float(raw_val) - corrected) > 0.01:
            audit_entries.append(
                f"{sensor}: raw={raw_val:.2f} → corrected={corrected} via {strategy}"
            )

    return {
        **corrections,
        "imputation_strategies": strategies,
        "audit_trail":           " | ".join(audit_entries) if audit_entries else "no correction needed",
        "is_estimated":          True,
        "imputation_timestamp":  datetime.now(timezone.utc).isoformat(),
    }
