"""
SkyGuard AI — Synthetic AWS Time-Series Generator
===================================================
Produces realistic temperature / pressure / humidity readings per station
with seasonal, diurnal, and random-noise components. No real IMD data needed.

Usage:
    python synthetic_data.py --hours 48        # 48h of data for all stations
    python synthetic_data.py --hours 24 --out data/generated/history.parquet
"""

import argparse
import math
import random
from datetime import datetime, timedelta, timezone
from typing import Generator

import pandas as pd
import numpy as np

from data.generate_stations import get_all_stations
from data.schema import (
    FIELD_STATION_ID, FIELD_TIMESTAMP,
    FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY,
    FIELD_LAT, FIELD_LON, FIELD_ELEVATION,
    SCHEMA_COLUMNS,
)

# Reading frequency: one sample every 5 minutes
INTERVAL_MINUTES = 5

# ── Physical baseline models per station ─────────────────────────────────────

def _lapse_rate_temp(elevation_m: float) -> float:
    """Environmental lapse rate: ~6.5°C per 1000m."""
    return -elevation_m * 0.0065

def _pressure_at_elevation(elevation_m: float) -> float:
    """Standard atmosphere pressure (hPa) at elevation."""
    return 1013.25 * math.exp(-elevation_m / 8500.0)

def _lat_baseline_temp(lat: float) -> float:
    """Rough latitude → annual-mean temperature offset."""
    # Equator ~30°C, poles ~-30°C — crude sine approximation
    return 30.0 - abs(lat) * 0.7

def _lat_baseline_humidity(lat: float, region: str) -> float:
    """Rough regional humidity baseline."""
    bases = {"coast": 80, "plains": 60, "hills": 65, "desert": 25, "northeast": 85}
    return bases.get(region, 65)

# ── Diurnal cycles ────────────────────────────────────────────────────────────

def _diurnal_temp(hour_of_day: float) -> float:
    """Temperature diurnal: peak ~14:00, trough ~05:00, amplitude ~8°C."""
    return 8.0 * math.sin(2 * math.pi * (hour_of_day - 5) / 24)

def _diurnal_pressure(hour_of_day: float) -> float:
    """Pressure has a semi-diurnal cycle (~1.5 hPa amplitude)."""
    return 1.5 * math.sin(4 * math.pi * hour_of_day / 24)

def _diurnal_humidity(hour_of_day: float) -> float:
    """Humidity is inverse to temperature (anti-phase)."""
    return -10.0 * math.sin(2 * math.pi * (hour_of_day - 5) / 24)

# ── Seasonal cycles ───────────────────────────────────────────────────────────

def _seasonal_temp(day_of_year: int, lat: float) -> float:
    """Annual temperature cycle, ~12°C amplitude, min in winter."""
    phase = 2 * math.pi * (day_of_year - 172) / 365  # peak ~June 21
    if lat < 0:
        phase += math.pi  # flip for southern hemisphere
    return 12.0 * math.sin(phase)

def _seasonal_humidity(day_of_year: int, region: str) -> float:
    """Monsoon season boost (June–September in India)."""
    if region in ("coast", "northeast", "plains"):
        peak_day = 180  # ~late June
        boost = 20.0 * math.exp(-((day_of_year - peak_day) ** 2) / (2 * 40 ** 2))
        return boost
    return 0.0

# ── Main generator ────────────────────────────────────────────────────────────

def generate_station_readings(
    station: dict,
    start_dt: datetime,
    end_dt: datetime,
    rng: np.random.Generator,
) -> list[dict]:
    """
    Generate one reading every INTERVAL_MINUTES for a station between start/end.
    Returns a list of dicts matching SCHEMA_COLUMNS (no anomaly labels).
    """
    sid      = station["station_id"]
    lat      = station["lat"]
    lon      = station["lon"]
    elev     = station["elevation_m"]
    region   = station["region"]

    # Stable baselines for this station
    base_temp     = _lat_baseline_temp(lat) + _lapse_rate_temp(elev)
    base_pressure = _pressure_at_elevation(elev)
    base_humidity = _lat_baseline_humidity(lat, region)

    # Slow-moving weather background (changes every ~4h, shared across sensors)
    weather_state = {"temp": 0.0, "pres": 0.0, "hum": 0.0}
    weather_step  = INTERVAL_MINUTES / (4 * 60)  # fraction of a 4h window per step

    # AR(1) process noise coefficients
    AR_COEF = 0.92  # autocorrelation — realistic sensor persistence

    rows = []
    current = start_dt
    prev_noise = {"temp": 0.0, "pres": 0.0, "hum": 0.0}

    while current < end_dt:
        hour    = current.hour + current.minute / 60.0
        doy     = current.timetuple().tm_yday

        # Diurnal + seasonal components
        temp_signal = (
            base_temp
            + _diurnal_temp(hour)
            + _seasonal_temp(doy, lat)
            + weather_state["temp"]
        )
        pres_signal = (
            base_pressure
            + _diurnal_pressure(hour)
            + weather_state["pres"]
        )
        hum_signal = (
            base_humidity
            + _diurnal_humidity(hour)
            + _seasonal_humidity(doy, region)
            + weather_state["hum"]
        )

        # AR(1) noise
        noise_t = AR_COEF * prev_noise["temp"] + rng.normal(0, 0.3)
        noise_p = AR_COEF * prev_noise["pres"] + rng.normal(0, 0.2)
        noise_h = AR_COEF * prev_noise["hum"]  + rng.normal(0, 0.5)

        temp = round(temp_signal + noise_t, 2)
        pres = round(max(700.0, pres_signal + noise_p), 2)
        hum  = round(min(100.0, max(0.0, hum_signal + noise_h)), 2)

        rows.append({
            FIELD_STATION_ID:  sid,
            FIELD_TIMESTAMP:   current.isoformat(),
            FIELD_TEMPERATURE: temp,
            FIELD_PRESSURE:    pres,
            FIELD_HUMIDITY:    hum,
            FIELD_LAT:         lat,
            FIELD_LON:         lon,
            FIELD_ELEVATION:   elev,
        })

        # Evolve weather state slowly (random walk bounded by ±5 / ±3 / ±10)
        weather_state["temp"] = max(-5, min(5,  weather_state["temp"] + rng.normal(0, 0.05)))
        weather_state["pres"] = max(-3, min(3,  weather_state["pres"] + rng.normal(0, 0.03)))
        weather_state["hum"]  = max(-10, min(10, weather_state["hum"] + rng.normal(0, 0.1)))

        prev_noise = {"temp": noise_t, "pres": noise_p, "hum": noise_h}
        current += timedelta(minutes=INTERVAL_MINUTES)

    return rows


def generate_all_stations(
    hours: int = 48,
    end_dt: datetime | None = None,
) -> pd.DataFrame:
    """Generate `hours` of normal readings for all 20 stations."""
    if end_dt is None:
        end_dt = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    start_dt = end_dt - timedelta(hours=hours)

    all_rows = []
    stations = get_all_stations()
    for station in stations:
        rng = np.random.default_rng(seed=hash(station["station_id"]) % (2**31))
        rows = generate_station_readings(station, start_dt, end_dt, rng)
        all_rows.extend(rows)

    df = pd.DataFrame(all_rows)
    df[FIELD_TIMESTAMP] = pd.to_datetime(df[FIELD_TIMESTAMP], utc=True)
    return df.sort_values([FIELD_STATION_ID, FIELD_TIMESTAMP]).reset_index(drop=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic AWS time-series")
    parser.add_argument("--hours", type=int, default=48, help="Hours of history to generate")
    parser.add_argument("--out", type=str, default="data/generated/history.parquet")
    args = parser.parse_args()

    from pathlib import Path
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    df = generate_all_stations(hours=args.hours)
    df.to_parquet(args.out, index=False)
    print(f"Generated {len(df):,} rows for {df[FIELD_STATION_ID].nunique()} stations → {args.out}")
