"""
SkyGuard AI — Universal Real Dataset Ingester & Normalizer
============================================================
Converts arbitrary external weather datasets (IMD AWS, MOSDAC, Kaggle, NOAA, Jena Climate)
into SkyGuard's unified AWS schema for training and live evaluation.

Features:
  - Smart automatic column detection (matches temperature, humidity, pressure, timestamps)
  - Unit auto-detection & conversion (Kelvin/Fahrenheit -> Celsius, Pa/inHg -> hPa)
  - Single-station dataset support (assigns default station ID)
  - Anomaly & NaN cleanup based on meteorological physical bounds

Usage:
    python -m data.ingest_real_dataset --input path/to/external_weather.csv
    python -m data.ingest_real_dataset --input jena_climate.csv --station-id ST_JENA
    python -m data.ingest_real_dataset --input imd_raw.csv --col-temp Air_Temp --col-humidity RH --col-pressure SLP
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

# Add repo root to import path
sys.path.insert(0, str(Path(__file__).parent.parent))

from data.schema import (
    FIELD_STATION_ID, FIELD_TIMESTAMP,
    FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY,
    FIELD_LAT, FIELD_LON, FIELD_ELEVATION,
    BOUNDS,
)


def guess_column(df_columns: list[str], candidates: list[str]) -> Optional[str]:
    """Find the best matching column name case-insensitively."""
    cols_lower = {c.lower(): c for c in df_columns}
    for candidate in candidates:
        cand_lower = candidate.lower()
        if cand_lower in cols_lower:
            return cols_lower[cand_lower]
        for c, original in cols_lower.items():
            if cand_lower in c:
                return original
    return None


def convert_temperature_to_celsius(series: pd.Series, unit_hint: Optional[str] = None) -> pd.Series:
    """Auto-detect or convert temperature to Celsius."""
    if unit_hint == "k" or (unit_hint is None and series.dropna().mean() > 200):
        print("  [units] Detected Kelvin temperature -> Converting to Celsius (K - 273.15)")
        return series - 273.15
    elif unit_hint == "f":
        print("  [units] Converting Fahrenheit to Celsius ((F - 32) * 5/9)")
        return (series - 32.0) * (5.0 / 9.0)
    return series


def convert_pressure_to_hpa(series: pd.Series) -> pd.Series:
    """Auto-detect or convert pressure to hPa."""
    mean_val = series.dropna().mean()
    if mean_val > 50000:   # Pascals
        print("  [units] Detected Pascals pressure -> Converting to hPa (Pa / 100)")
        return series / 100.0
    elif mean_val < 50:    # inHg (typically 28-31 inHg)
        print("  [units] Detected inHg pressure -> Converting to hPa (* 33.8639)")
        return series * 33.8639
    return series


def ingest_file(
    input_path: str,
    output_path: str = "data/generated/real_normalized.csv",
    station_id_default: str = "REAL_AWS_01",
    col_station: Optional[str] = None,
    col_timestamp: Optional[str] = None,
    col_temp: Optional[str] = None,
    col_pressure: Optional[str] = None,
    col_humidity: Optional[str] = None,
    temp_unit: Optional[str] = None,
) -> pd.DataFrame:
    input_file = Path(input_path)
    if not input_file.exists():
        raise FileNotFoundError(f"Input file not found: {input_file}")

    print("=" * 65)
    print(f"  SkyGuard AI — Ingesting Real Weather Dataset: {input_file.name}")
    print("=" * 65)

    # Read CSV
    df_raw = pd.read_csv(input_file)
    print(f"Loaded raw file: {len(df_raw):,} rows, {len(df_raw.columns)} columns.")

    # Match or use provided columns
    target_station = col_station or guess_column(df_raw.columns, ["station_id", "station", "station_name", "id", "stn_id"])
    target_time    = col_timestamp or guess_column(df_raw.columns, ["timestamp", "date_time", "datetime", "date", "time", "date (utc)"])
    target_temp    = col_temp or guess_column(df_raw.columns, ["temperature_c", "temperature", "temp", "air_temp", "t (degc)", "temp_c"])
    target_press   = col_pressure or guess_column(df_raw.columns, ["pressure_hpa", "pressure", "p (mbar)", "slp", "surface_pressure", "baro", "pres"])
    target_hum     = col_humidity or guess_column(df_raw.columns, ["humidity_pct", "humidity", "rh", "rh (%)", "relative_humidity", "relativehumidity"])

    print("Column Mappings Resolved:")
    print(f"  - Station:     {target_station or f'[Default: {station_id_default}]'}")
    print(f"  - Timestamp:   {target_time}")
    print(f"  - Temperature: {target_temp}")
    print(f"  - Pressure:    {target_press}")
    print(f"  - Humidity:    {target_hum}")

    if not all([target_time, target_temp, target_press, target_hum]):
        missing = []
        if not target_time: missing.append("timestamp")
        if not target_temp: missing.append("temperature")
        if not target_press: missing.append("pressure")
        if not target_hum: missing.append("humidity")
        raise ValueError(f"Could not automatically detect columns for: {missing}. Specify with --col-temp, etc.")

    # Build standardized dataframe
    df_clean = pd.DataFrame(index=df_raw.index)
    if target_station and target_station in df_raw.columns:
        df_clean[FIELD_STATION_ID] = df_raw[target_station].astype(str).str.strip()
    else:
        df_clean[FIELD_STATION_ID] = station_id_default

    # Parse timestamps (support international DD.MM.YYYY and ISO formats)
    df_clean[FIELD_TIMESTAMP] = pd.to_datetime(df_raw[target_time], errors="coerce", dayfirst=True).dt.strftime("%Y-%m-%d %H:%M:%S")

    # Values and conversions
    df_clean[FIELD_TEMPERATURE] = convert_temperature_to_celsius(pd.to_numeric(df_raw[target_temp], errors="coerce"), temp_unit)
    df_clean[FIELD_PRESSURE]    = convert_pressure_to_hpa(pd.to_numeric(df_raw[target_press], errors="coerce"))
    df_clean[FIELD_HUMIDITY]    = pd.to_numeric(df_raw[target_hum], errors="coerce")

    # Optional coordinates
    lat_col = guess_column(df_raw.columns, ["lat", "latitude"])
    lon_col = guess_column(df_raw.columns, ["lon", "long", "longitude"])
    elev_col = guess_column(df_raw.columns, ["elevation", "elevation_m", "altitude"])

    df_clean[FIELD_LAT] = pd.to_numeric(df_raw[lat_col], errors="coerce") if lat_col else 20.5937
    df_clean[FIELD_LON] = pd.to_numeric(df_raw[lon_col], errors="coerce") if lon_col else 78.9629
    df_clean[FIELD_ELEVATION] = pd.to_numeric(df_raw[elev_col], errors="coerce") if elev_col else 100.0

    # Drop invalid rows
    before_len = len(df_clean)
    df_clean = df_clean.dropna(subset=[FIELD_TIMESTAMP, FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY])

    # Filter physical extremes according to schema bounds
    for col in [FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY]:
        low, high = BOUNDS[col]
        df_clean = df_clean[(df_clean[col] >= low) & (df_clean[col] <= high)]

    # Sort
    df_clean = df_clean.sort_values(by=[FIELD_STATION_ID, FIELD_TIMESTAMP]).reset_index(drop=True)
    after_len = len(df_clean)

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    df_clean.to_csv(out_file, index=False)

    print("=" * 65)
    print(f"[OK] Cleaned dataset saved to: {out_file}")
    print(f"  Rows retained: {after_len:,} / {before_len:,} ({(after_len/before_len)*100:.1f}%)")
    print(f"  Stations count: {df_clean[FIELD_STATION_ID].nunique()}")
    print(f"  Time range: {df_clean[FIELD_TIMESTAMP].min()} -> {df_clean[FIELD_TIMESTAMP].max()}")
    print("=" * 65)

    return df_clean


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest and normalize external weather datasets for SkyGuard AI")
    parser.add_argument("--input", "-i", type=str, required=True, help="Path to raw CSV dataset")
    parser.add_argument("--output", "-o", type=str, default="data/generated/real_normalized.csv", help="Clean output CSV path")
    parser.add_argument("--station-id", type=str, default="REAL_AWS_01", help="Default station ID if not in CSV")
    parser.add_argument("--col-station", type=str, help="Column name for station ID")
    parser.add_argument("--col-timestamp", type=str, help="Column name for timestamp")
    parser.add_argument("--col-temp", type=str, help="Column name for temperature")
    parser.add_argument("--col-pressure", type=str, help="Column name for pressure")
    parser.add_argument("--col-humidity", type=str, help="Column name for humidity")
    parser.add_argument("--temp-unit", type=str, choices=["c", "k", "f"], help="Explicit temperature unit (c, k, f)")
    args = parser.parse_args()

    ingest_file(
        input_path=args.input,
        output_path=args.output,
        station_id_default=args.station_id,
        col_station=args.col_station,
        col_timestamp=args.col_timestamp,
        col_temp=args.col_temp,
        col_pressure=args.col_pressure,
        col_humidity=args.col_humidity,
        temp_unit=args.temp_unit,
    )
