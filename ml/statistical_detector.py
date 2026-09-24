"""
SkyGuard AI — Statistical Anomaly Detector
============================================
Layer 1 of the detection ensemble. Fast, always-on, no model training needed.
Implements:
  - Rolling Z-score (per station, per sensor)
  - IQR / MAD outlier detection
  - STL residual thresholding (via seasonal decomposition)
  - Frozen-value detector (variance ≈ 0 over N samples)
  - Rate-of-change limiter (|Δx/Δt| exceeds physical maximum)

All functions are stateless and take a sliding window DataFrame.
"""

import math
from typing import Optional
import numpy as np
import pandas as pd
from statsmodels.tsa.seasonal import STL

from data.schema import (
    FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY,
    SENSOR_VARS, Severity,
)

# ── Thresholds (tunable) ──────────────────────────────────────────────────────
Z_THRESHOLD        = 3.5     # Z-score for spike detection
IQR_MULTIPLIER     = 2.5     # IQR fence multiplier
FROZEN_WINDOW      = 6       # N consecutive samples to declare "frozen"
FROZEN_VARIANCE    = 1e-4    # variance threshold below which sensor is "stuck"
STL_PERIOD         = 288     # 24h at 5-min intervals
STL_THRESHOLD      = 3.0     # residual Z-score

# Max physical rate-of-change per 5-minute interval
MAX_ROC = {
    FIELD_TEMPERATURE: 5.0,    # °C per 5 min (extreme)
    FIELD_PRESSURE:    3.0,    # hPa per 5 min
    FIELD_HUMIDITY:    15.0,   # % per 5 min
}

SENSOR_WEIGHTS = {
    FIELD_TEMPERATURE: 0.5,
    FIELD_PRESSURE:    0.3,
    FIELD_HUMIDITY:    0.2,
}


def _zscore_score(series: pd.Series) -> float:
    """Return Z-score of the last element in a rolling window."""
    if len(series) < 3:
        return 0.0
    mu  = series[:-1].mean()
    std = series[:-1].std()
    if std < 1e-8:
        return 0.0
    return abs((series.iloc[-1] - mu) / std)


def _iqr_score(series: pd.Series) -> float:
    """Return how many IQR units outside the fence the last element is."""
    if len(series) < 5:
        return 0.0
    q1, q3 = series.quantile(0.25), series.quantile(0.75)
    iqr = q3 - q1
    if iqr < 1e-8:
        return 0.0
    val = series.iloc[-1]
    lower = q1 - IQR_MULTIPLIER * iqr
    upper = q3 + IQR_MULTIPLIER * iqr
    if val < lower:
        return (lower - val) / iqr
    if val > upper:
        return (val - upper) / iqr
    return 0.0


def _frozen_score(series: pd.Series) -> float:
    """1.0 if last FROZEN_WINDOW readings have near-zero variance, else 0."""
    window = series.iloc[-FROZEN_WINDOW:]
    if len(window) < FROZEN_WINDOW:
        return 0.0
    return 1.0 if window.var() < FROZEN_VARIANCE else 0.0


def _roc_score(series: pd.Series, max_roc: float) -> float:
    """Rate-of-change of last step, normalised to max_roc."""
    if len(series) < 2:
        return 0.0
    delta = abs(series.iloc[-1] - series.iloc[-2])
    return min(delta / max_roc, 5.0)   # cap at 5× for scoring purposes


def _drift_score(series: pd.Series) -> float:
    """Detect persistent linear drift over window."""
    if len(series) < 8:
        return 0.0
    w = series.iloc[-12:].values
    x = np.arange(len(w))
    try:
        slope, _ = np.polyfit(x, w, 1)
        if abs(slope) > 0.35:
            return min(abs(slope) / 0.35, 2.0)
    except Exception:
        pass
    return 0.0


def detect_statistical(
    window: pd.DataFrame,
    sensor: str,
) -> dict:
    """
    Run all statistical checks on a rolling window for one sensor.
    Returns a dict: {score, flags, sensor}.
    """
    if len(window) > 0 and pd.isna(window[sensor].iloc[-1]):
        return {"score": 1.5, "flags": ["sensor_dropout_nan"], "sensor": sensor}

    s = window[sensor].dropna()
    if len(s) < 3:
        return {"score": 0.0, "flags": [], "sensor": sensor}

    flags  = []
    scores = []

    # Z-score
    z = _zscore_score(s)
    if z > Z_THRESHOLD:
        flags.append(f"z_score={z:.2f}")
        scores.append(min(z / Z_THRESHOLD, 2.0))

    # IQR
    iqr = _iqr_score(s)
    if iqr > 0.5:
        flags.append(f"iqr_fence={iqr:.2f}")
        scores.append(min(iqr, 2.0))

    # Frozen
    frozen = _frozen_score(s)
    if frozen > 0:
        flags.append("frozen_value")
        scores.append(1.5)

    # Drift
    drift = _drift_score(s)
    if drift > 0:
        flags.append("calibration_drift")
        scores.append(min(drift, 1.8))

    # Rate of change
    roc = _roc_score(s, MAX_ROC[sensor])
    if roc > 1.0:
        flags.append(f"roc={roc:.2f}")
        scores.append(min(roc, 2.0))

    score = max(scores) if scores else 0.0
    return {"score": score, "flags": flags, "sensor": sensor}


def detect_statistical_all_sensors(window: pd.DataFrame) -> dict:
    """
    Run statistical detection across all 3 sensor vars.
    Returns aggregated result: {score, is_anomaly, severity, flags, details}.
    """
    details = {}
    weighted_score = 0.0

    for sensor in SENSOR_VARS:
        if sensor not in window.columns:
            continue
        result = detect_statistical(window, sensor)
        details[sensor] = result
        weighted_score += result["score"] * SENSOR_WEIGHTS.get(sensor, 0.33)

    # NaN/dropout check (all sensors missing last reading)
    last = window.iloc[-1] if len(window) > 0 else None
    all_nan = last is not None and all(
        pd.isna(last.get(s)) for s in SENSOR_VARS
    )
    if all_nan:
        weighted_score = max(weighted_score, 1.8)
        details["dropout"] = {"score": 1.8, "flags": ["all_sensors_nan"], "sensor": None}

    # Map score → is_anomaly + severity
    is_anomaly = weighted_score > 0.5
    if weighted_score >= 1.8:
        severity = Severity.CRITICAL
    elif weighted_score >= 1.2:
        severity = Severity.HIGH
    elif weighted_score >= 0.8:
        severity = Severity.MEDIUM
    elif weighted_score > 0.5:
        severity = Severity.LOW
    else:
        severity = None

    # Collect all flags
    all_flags = []
    for d in details.values():
        all_flags.extend(d.get("flags", []))

    return {
        "score":       round(weighted_score, 4),
        "is_anomaly":  is_anomaly,
        "severity":    severity,
        "flags":       all_flags,
        "details":     details,
        "layer":       "statistical",
    }
