"""
SkyGuard AI — Anomaly Injector
================================
Core anomaly injection functions. **Importable** — used by both:
  - `data/simulate_stream.py` (offline batch injection for evaluation)
  - `backend/routers/demo.py` (live Demo/Judge Mode — runs through real pipeline)

All functions take a DataFrame or list of readings and return the same type
with anomalous values inserted. They also return injection metadata so the
evaluator knows ground truth.
"""

import random
import math
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from data.schema import (
    FIELD_STATION_ID, FIELD_TIMESTAMP,
    FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY,
    AnomalyType, Severity,
)


@dataclass
class InjectionRecord:
    """Ground-truth label for one injected anomaly window."""
    station_id:   str
    anomaly_type: str
    start_idx:    int
    end_idx:      int
    sensor:       Optional[str]     = None
    severity:     str               = Severity.HIGH
    params:       dict              = field(default_factory=dict)


# ── Individual injection functions ─────────────────────────────────────────────

def inject_spike(
    df: pd.DataFrame,
    station_id: str,
    sensor: str = FIELD_TEMPERATURE,
    magnitude: float = 20.0,
    duration_steps: int = 1,
    rng: Optional[np.random.Generator] = None,
) -> tuple[pd.DataFrame, InjectionRecord]:
    """Add a sharp spike (single or multi-step) to a sensor column."""
    if rng is None:
        rng = np.random.default_rng()
    df = df.copy()
    mask = df[FIELD_STATION_ID] == station_id
    indices = df[mask].index.tolist()
    if len(indices) < duration_steps + 2:
        raise ValueError(f"Not enough rows for station {station_id}")
    start = rng.integers(len(indices) // 4, 3 * len(indices) // 4)
    target_indices = indices[start : start + duration_steps]
    sign = rng.choice([-1, 1])
    df.loc[target_indices, sensor] += sign * magnitude
    return df, InjectionRecord(
        station_id=station_id, anomaly_type=AnomalyType.SPIKE,
        start_idx=target_indices[0], end_idx=target_indices[-1],
        sensor=sensor, severity=Severity.HIGH,
        params={"magnitude": sign * magnitude, "duration_steps": duration_steps},
    )


def inject_frozen(
    df: pd.DataFrame,
    station_id: str,
    sensor: str = FIELD_TEMPERATURE,
    duration_steps: int = 12,
    rng: Optional[np.random.Generator] = None,
) -> tuple[pd.DataFrame, InjectionRecord]:
    """Freeze a sensor at a constant value (stuck-at fault)."""
    if rng is None:
        rng = np.random.default_rng()
    df = df.copy()
    mask = df[FIELD_STATION_ID] == station_id
    indices = df[mask].index.tolist()
    start = rng.integers(len(indices) // 4, len(indices) // 2)
    target_indices = indices[start : start + duration_steps]
    frozen_val = float(df.loc[target_indices[0], sensor])
    df.loc[target_indices, sensor] = frozen_val
    return df, InjectionRecord(
        station_id=station_id, anomaly_type=AnomalyType.FROZEN,
        start_idx=target_indices[0], end_idx=target_indices[-1],
        sensor=sensor, severity=Severity.MEDIUM,
        params={"frozen_value": frozen_val, "duration_steps": duration_steps},
    )


def inject_drift(
    df: pd.DataFrame,
    station_id: str,
    sensor: str = FIELD_TEMPERATURE,
    drift_per_step: float = 0.5,
    duration_steps: int = 24,
    rng: Optional[np.random.Generator] = None,
) -> tuple[pd.DataFrame, InjectionRecord]:
    """Gradually drift a sensor reading linearly (calibration drift)."""
    if rng is None:
        rng = np.random.default_rng()
    df = df.copy()
    mask = df[FIELD_STATION_ID] == station_id
    indices = df[mask].index.tolist()
    start = rng.integers(0, max(1, len(indices) - duration_steps - 1))
    target_indices = indices[start : start + duration_steps]
    sign = rng.choice([-1, 1])
    for i, idx in enumerate(target_indices):
        df.loc[idx, sensor] += sign * drift_per_step * (i + 1)
    return df, InjectionRecord(
        station_id=station_id, anomaly_type=AnomalyType.DRIFT,
        start_idx=target_indices[0], end_idx=target_indices[-1],
        sensor=sensor, severity=Severity.MEDIUM,
        params={"drift_per_step": sign * drift_per_step, "duration_steps": duration_steps},
    )


def inject_dropout(
    df: pd.DataFrame,
    station_id: str,
    duration_steps: int = 6,
    rng: Optional[np.random.Generator] = None,
) -> tuple[pd.DataFrame, InjectionRecord]:
    """Set all sensor values to NaN for a block (comms dropout)."""
    if rng is None:
        rng = np.random.default_rng()
    df = df.copy()
    mask = df[FIELD_STATION_ID] == station_id
    indices = df[mask].index.tolist()
    start = rng.integers(len(indices) // 4, 3 * len(indices) // 4)
    target_indices = indices[start : start + duration_steps]
    for sensor in [FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY]:
        df.loc[target_indices, sensor] = float("nan")
    return df, InjectionRecord(
        station_id=station_id, anomaly_type=AnomalyType.DROPOUT,
        start_idx=target_indices[0], end_idx=target_indices[-1],
        sensor=None, severity=Severity.HIGH,
        params={"duration_steps": duration_steps},
    )


def inject_noise_burst(
    df: pd.DataFrame,
    station_id: str,
    sensor: str = FIELD_HUMIDITY,
    noise_std: float = 15.0,
    duration_steps: int = 8,
    rng: Optional[np.random.Generator] = None,
) -> tuple[pd.DataFrame, InjectionRecord]:
    """High-frequency random noise on a sensor channel."""
    if rng is None:
        rng = np.random.default_rng()
    df = df.copy()
    mask = df[FIELD_STATION_ID] == station_id
    indices = df[mask].index.tolist()
    start = rng.integers(len(indices) // 4, 3 * len(indices) // 4)
    target_indices = indices[start : start + duration_steps]
    df.loc[target_indices, sensor] += rng.normal(0, noise_std, size=len(target_indices))
    if sensor == FIELD_HUMIDITY:
        df.loc[target_indices, sensor] = df.loc[target_indices, sensor].clip(0, 100)
    return df, InjectionRecord(
        station_id=station_id, anomaly_type=AnomalyType.NOISE_BURST,
        start_idx=target_indices[0], end_idx=target_indices[-1],
        sensor=sensor, severity=Severity.MEDIUM,
        params={"noise_std": noise_std, "duration_steps": duration_steps},
    )


def inject_cross_sensor(
    df: pd.DataFrame,
    station_id: str,
    rng: Optional[np.random.Generator] = None,
) -> tuple[pd.DataFrame, InjectionRecord]:
    """
    Introduce cross-sensor inconsistency:
    temperature spikes but pressure/humidity stay flat — physically implausible.
    """
    if rng is None:
        rng = np.random.default_rng()
    df = df.copy()
    mask = df[FIELD_STATION_ID] == station_id
    indices = df[mask].index.tolist()
    start = rng.integers(len(indices) // 4, 3 * len(indices) // 4)
    duration = rng.integers(2, 6)
    target_indices = indices[start : start + duration]
    # Spike temperature, freeze pressure and humidity
    df.loc[target_indices, FIELD_TEMPERATURE] += rng.uniform(12, 20)
    ref_p = float(df.loc[target_indices[0], FIELD_PRESSURE])
    ref_h = float(df.loc[target_indices[0], FIELD_HUMIDITY])
    df.loc[target_indices, FIELD_PRESSURE] = ref_p
    df.loc[target_indices, FIELD_HUMIDITY]  = ref_h
    return df, InjectionRecord(
        station_id=station_id, anomaly_type=AnomalyType.CROSS_SENSOR,
        start_idx=target_indices[0], end_idx=target_indices[-1],
        sensor=None, severity=Severity.HIGH,
        params={"temp_spike": True, "pres_frozen": True, "hum_frozen": True},
    )


def inject_unit_flip(
    df: pd.DataFrame,
    station_id: str,
    rng: Optional[np.random.Generator] = None,
) -> tuple[pd.DataFrame, InjectionRecord]:
    """
    Unit flip: temperature reported in Fahrenheit instead of Celsius.
    Turns a 30°C reading into 86°C — obviously out-of-range.
    """
    if rng is None:
        rng = np.random.default_rng()
    df = df.copy()
    mask = df[FIELD_STATION_ID] == station_id
    indices = df[mask].index.tolist()
    start = rng.integers(len(indices) // 4, 3 * len(indices) // 4)
    duration = rng.integers(4, 12)
    target_indices = indices[start : start + duration]
    # C → F conversion applied (simulating the flip)
    df.loc[target_indices, FIELD_TEMPERATURE] = (
        df.loc[target_indices, FIELD_TEMPERATURE] * 9 / 5 + 32
    )
    return df, InjectionRecord(
        station_id=station_id, anomaly_type=AnomalyType.UNIT_FLIP,
        start_idx=target_indices[0], end_idx=target_indices[-1],
        sensor=FIELD_TEMPERATURE, severity=Severity.CRITICAL,
        params={"unit": "Fahrenheit_as_Celsius"},
    )


# ── Convenience: inject one anomaly by type name ───────────────────────────────

INJECTION_DISPATCH = {
    AnomalyType.SPIKE:        inject_spike,
    AnomalyType.FROZEN:       inject_frozen,
    AnomalyType.DRIFT:        inject_drift,
    AnomalyType.DROPOUT:      inject_dropout,
    AnomalyType.NOISE_BURST:  inject_noise_burst,
    AnomalyType.CROSS_SENSOR: inject_cross_sensor,
    AnomalyType.UNIT_FLIP:    inject_unit_flip,
}


def inject_by_type(
    df: pd.DataFrame,
    station_id: str,
    anomaly_type: str,
    rng: Optional[np.random.Generator] = None,
    **kwargs,
) -> tuple[pd.DataFrame, InjectionRecord]:
    """Dispatch to the correct injector by anomaly type string."""
    fn = INJECTION_DISPATCH.get(anomaly_type)
    if fn is None:
        raise ValueError(f"Unknown anomaly type: {anomaly_type!r}. "
                         f"Choose from: {list(INJECTION_DISPATCH)}")
    return fn(df, station_id, rng=rng, **kwargs)


def inject_single_reading(
    reading: dict,
    anomaly_type: str,
    rng: Optional[np.random.Generator] = None,
) -> dict:
    """
    Inject an anomaly into a **single reading dict** (used by Demo Mode in the
    backend to corrupt one live reading before feeding it into the pipeline).
    """
    if rng is None:
        rng = np.random.default_rng()
    r = deepcopy(reading)
    if anomaly_type == AnomalyType.SPIKE:
        sensor = rng.choice([FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY])
        magnitude = {"temperature_c": 20.0, "pressure_hpa": 30.0, "humidity_pct": 35.0}[sensor]
        r[sensor] += float(rng.choice([-1, 1])) * magnitude
    elif anomaly_type == AnomalyType.FROZEN:
        # The "frozen" effect is spread over time; for a single reading we flag it but don't mutate much
        pass
    elif anomaly_type == AnomalyType.DRIFT:
        r[FIELD_TEMPERATURE] += float(rng.uniform(5, 12))
    elif anomaly_type == AnomalyType.DROPOUT:
        r[FIELD_TEMPERATURE] = None
        r[FIELD_PRESSURE]    = None
        r[FIELD_HUMIDITY]    = None
    elif anomaly_type == AnomalyType.NOISE_BURST:
        r[FIELD_HUMIDITY] = float(np.clip(r[FIELD_HUMIDITY] + rng.normal(0, 20), 0, 100))
    elif anomaly_type == AnomalyType.CROSS_SENSOR:
        r[FIELD_TEMPERATURE] += float(rng.uniform(12, 20))
    elif anomaly_type == AnomalyType.UNIT_FLIP:
        r[FIELD_TEMPERATURE] = r[FIELD_TEMPERATURE] * 9 / 5 + 32
    return r
