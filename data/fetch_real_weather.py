"""
SkyGuard AI — Real AWS Weather Data Fetcher
============================================
Fetches actual historical weather observations from the Open-Meteo Archive API
(ERA5 Reanalysis + Global Surface Observation Network) for SkyGuard's 20 AWS stations
across India (or custom coordinates).

Zero API key required. High reliability. Real meteorological observations.

Usage:
    python -m data.fetch_real_weather
    python -m data.fetch_real_weather --days 60 --stations 10
    python -m data.fetch_real_weather --start 2024-01-01 --end 2024-03-31 --out data/generated/real_aws_data.csv
"""

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import time

import pandas as pd
import requests

# Add repo root to import path
sys.path.insert(0, str(Path(__file__).parent.parent))

from data.generate_stations import get_all_stations
from data.schema import (
    FIELD_STATION_ID, FIELD_TIMESTAMP,
    FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY,
    FIELD_LAT, FIELD_LON, FIELD_ELEVATION,
    SCHEMA_COLUMNS, BOUNDS,
)

ARCHIVE_API_URL = "https://archive-api.open-meteo.com/v1/archive"


def fetch_station_data(
    station: dict,
    start_date: str,
    end_date: str,
    max_retries: int = 3,
) -> pd.DataFrame:
    """Fetch hourly weather records for one station from Open-Meteo Archive."""
    params = {
        "latitude": station["lat"],
        "longitude": station["lon"],
        "start_date": start_date,
        "end_date": end_date,
        "hourly": "temperature_2m,relative_humidity_2m,surface_pressure",
        "timezone": "auto",
    }

    data = None
    for attempt in range(max_retries):
        try:
            resp = requests.get(ARCHIVE_API_URL, params=params, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                break
            elif resp.status_code == 429:
                print(f"    [rate-limit] Backing off 2s for {station['station_id']}...")
                time.sleep(2)
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"    [error] Failed to fetch {station['station_id']}: {e}")
                return pd.DataFrame()
            time.sleep(1)

    if not data or "hourly" not in data:
        return pd.DataFrame()

    hourly = data["hourly"]
    times = hourly.get("time", [])
    temps = hourly.get("temperature_2m", [])
    humidities = hourly.get("relative_humidity_2m", [])
    pressures = hourly.get("surface_pressure", [])

    n = len(times)
    if n == 0:
        return pd.DataFrame()

    df = pd.DataFrame({
        FIELD_STATION_ID: station["station_id"],
        FIELD_TIMESTAMP: times,
        FIELD_TEMPERATURE: temps,
        FIELD_PRESSURE: pressures,
        FIELD_HUMIDITY: humidities,
        FIELD_LAT: station["lat"],
        FIELD_LON: station["lon"],
        FIELD_ELEVATION: station.get("elevation_m", 100),
    })

    # Basic data hygiene
    df = df.dropna(subset=[FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY])

    # Filter physical extremes according to schema bounds
    for col in [FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY]:
        low, high = BOUNDS[col]
        df = df[(df[col] >= low) & (df[col] <= high)]

    return df


def fetch_all_real_data(
    num_stations: int = 20,
    days: int = 30,
    start_date: str = None,
    end_date: str = None,
    output_path: str = "data/generated/real_aws_data.csv",
) -> pd.DataFrame:
    """Fetch real data for multiple AWS stations and save as CSV."""
    if not end_date:
        # Default to recently archived window (archive API has ~2-5 day delay for quality control)
        end_dt = datetime.now(timezone.utc) - timedelta(days=5)
        start_dt = end_dt - timedelta(days=days)
        start_date = start_dt.strftime("%Y-%m-%d")
        end_date = end_dt.strftime("%Y-%m-%d")

    stations = get_all_stations()[:num_stations]
    print("=" * 65)
    print(f"  SkyGuard AI — Fetching Real AWS Meteorological Observations")
    print(f"  Window: {start_date} to {end_date} ({days} days)")
    print(f"  Stations: {len(stations)} Automatic Weather Stations across India")
    print("=" * 65)

    all_dfs = []
    for idx, station in enumerate(stations, 1):
        print(f"[{idx:02d}/{len(stations):02d}] Fetching {station['station_id']} ({station['name']}, {station.get('region', '')})...")
        df_station = fetch_station_data(station, start_date, end_date)
        if not df_station.empty:
            all_dfs.append(df_station)
            print(f"        [OK] {len(df_station):,} hourly readings fetched.")
        else:
            print(f"        [WARN] No data retrieved.")
        # Polite delay to prevent rate limits
        time.sleep(0.3)

    if not all_dfs:
        raise RuntimeError("No weather data could be fetched. Check network connection.")

    combined = pd.concat(all_dfs, ignore_index=True)
    combined = combined.sort_values(by=[FIELD_STATION_ID, FIELD_TIMESTAMP]).reset_index(drop=True)

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(out_file, index=False)

    print("=" * 65)
    print(f"[OK] Successfully saved {len(combined):,} real readings to {out_file}")
    print(f"  Unique stations: {combined[FIELD_STATION_ID].nunique()}")
    print(f"  Temperature range: {combined[FIELD_TEMPERATURE].min():.1f}°C to {combined[FIELD_TEMPERATURE].max():.1f}°C")
    print(f"  Pressure range:    {combined[FIELD_PRESSURE].min():.1f} hPa to {combined[FIELD_PRESSURE].max():.1f} hPa")
    print(f"  Humidity range:    {combined[FIELD_HUMIDITY].min():.1f}% to {combined[FIELD_HUMIDITY].max():.1f}%")
    print("=" * 65)

    return combined


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch real historical AWS weather data from Open-Meteo")
    parser.add_argument("--stations", type=int, default=20, help="Number of AWS stations to fetch (1-20)")
    parser.add_argument("--days", type=int, default=30, help="Number of historical days to fetch")
    parser.add_argument("--start", type=str, default=None, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, default=None, help="End date (YYYY-MM-DD)")
    parser.add_argument("--out", type=str, default="data/generated/real_aws_data.csv", help="Output CSV path")
    args = parser.parse_args()

    fetch_all_real_data(
        num_stations=args.stations,
        days=args.days,
        start_date=args.start,
        end_date=args.end,
        output_path=args.out,
    )
