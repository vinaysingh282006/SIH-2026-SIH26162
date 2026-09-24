"""
SkyGuard AI — Universal Ingestion Pipeline for DATASET/
========================================================
Processes and integrates all files from the user-provided DATASET/ directory:
  1. DATASET/RS_Session_246_AU1316_1.1.csv
     -> Real IMD Automatic Weather Stations (AWS) in Uttarakhand (25 stations)
  2. DATASET/RS_Session_255_AU_2113_1.csv & RS_Session_257_AU_2103_1.csv
     -> Official Ministry of Earth Sciences / Parliamentary AWS & ARG Census (37 States/UTs)
  3. DATASET/01/jena_climate_2009_2016.csv
     -> 420,000+ 10-minute real meteorological observations
  4. DATASET/02/ (temperature.csv, pressure.csv, humidity.csv, city_attributes.csv)
     -> Multi-city hourly meteorological dataset (converts Kelvin -> Celsius, merges coordinates)

Usage:
    python -m data.ingest_dataset_folder
"""

import json
import os
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

BASE_DIR = Path(__file__).parent.parent
DATASET_DIR = BASE_DIR / "DATASET"
GEN_DIR = BASE_DIR / "data" / "generated"


def process_uttarakhand_stations() -> list[dict]:
    """Parse real IMD AWS stations in Uttarakhand from Parliament Record."""
    csv_file = DATASET_DIR / "RS_Session_246_AU1316_1.1.csv"
    if not csv_file.exists():
        print(f"[warning] {csv_file} not found.")
        return []

    print("\n[1/4] Ingesting Uttarakhand AWS Stations (RS_Session_246)...")
    df = pd.read_csv(csv_file)
    stations = []

    # Map known approximate elevations in meters for Uttarakhand stations
    ELEVATIONS = {
        "Massouri": 2005, "Mukteshwar": 2171, "Nainital": 2084, "Joshimath": 1890,
        "Chamoli": 1300, "Munsyari": 2200, "Pithoragarh": 1627, "Dehradun": 640,
        "Roorkee": 268, "Pantnagar": 244, "Rudrapur": 210, "Uttar_kashi": 1158,
    }

    for idx, row in df.iterrows():
        name = str(row["Station"]).strip().replace("_", " ")
        district = str(row["District"]).strip().replace("_", " ")
        state = str(row["State"]).strip()
        lat = float(row["Lat."])
        lon = float(row["Long."])
        sid = f"UK_{idx+1:02d}"

        stations.append({
            "station_id":  sid,
            "name":        f"{name} ({district})",
            "district":    district,
            "state":       state,
            "lat":         lat,
            "lon":         lon,
            "elevation_m": ELEVATIONS.get(str(row["Station"]).strip(), 1200),
            "region":      "hills",
            "source":      "IMD / Rajya Sabha Session 246",
        })

    out_json = GEN_DIR / "uttarakhand_aws_stations.json"
    GEN_DIR.mkdir(parents=True, exist_ok=True)
    with open(out_json, "w") as f:
        json.dump(stations, f, indent=2)

    print(f"  [OK] Saved {len(stations)} Uttarakhand AWS stations -> {out_json}")
    return stations


def process_national_aws_census() -> dict:
    """Parse State-wise AWS and ARG counts from Parliament Record."""
    csv_file = DATASET_DIR / "RS_Session_257_AU_2103_1.csv"
    if not csv_file.exists():
        csv_file = DATASET_DIR / "RS_Session_255_AU_2113_1.csv"

    if not csv_file.exists():
        print("[warning] National census CSV not found.")
        return {}

    print("\n[2/4] Ingesting National AWS/ARG Deployment Census (RS_Session_257)...")
    df = pd.read_csv(csv_file)

    records = []
    total_aws = 0
    total_arg = 0
    total_agro = 0

    col_state = "State/UT"
    col_aws = [c for c in df.columns if "AWS" in c or "Automatic Weather Station" in c][0]
    col_arg = [c for c in df.columns if "ARG" in c or "Rain Gauge" in c][0]
    col_agro = [c for c in df.columns if "AGRO" in c]
    has_agro = len(col_agro) > 0

    for _, row in df.iterrows():
        st = str(row[col_state]).strip()
        if "Total" in st:
            continue
        try:
            aws_cnt = int(pd.to_numeric(row[col_aws], errors="coerce") or 0)
            arg_cnt = int(pd.to_numeric(row[col_arg], errors="coerce") or 0)
            agro_cnt = int(pd.to_numeric(row[col_agro[0]], errors="coerce") or 0) if has_agro else 0
        except Exception:
            continue

        total_aws += aws_cnt
        total_arg += arg_cnt
        total_agro += agro_cnt

        records.append({
            "state_ut": st,
            "aws_count": aws_cnt,
            "arg_count": arg_cnt,
            "agro_aws_count": agro_cnt,
            "total_telemetry_stations": aws_cnt + arg_cnt + agro_cnt,
        })

    census_data = {
        "metadata": {
            "source": "Ministry of Earth Sciences / Parliament of India (Rajya Sabha)",
            "description": "State-wise deployment of Automatic Weather Stations (AWS) & Automatic Rain Gauges (ARG)",
            "total_aws": total_aws,
            "total_arg": total_arg,
            "total_agro_aws": total_agro,
            "grand_total_stations": total_aws + total_arg + total_agro,
            "states_covered": len(records),
        },
        "states": records,
    }

    out_json = GEN_DIR / "national_aws_census.json"
    GEN_DIR.mkdir(parents=True, exist_ok=True)
    with open(out_json, "w") as f:
        json.dump(census_data, f, indent=2)

    print(f"  [OK] National Census Processed: {total_aws:,} AWS, {total_arg:,} ARG across {len(records)} States/UTs.")
    print(f"  [OK] Saved -> {out_json}")
    return census_data


def process_jena_climate(max_rows: Optional[int] = None) -> Path:
    """Normalize the Jena Climate dataset in DATASET/01."""
    input_file = DATASET_DIR / "01" / "jena_climate_2009_2016.csv"
    if not input_file.exists():
        input_file = BASE_DIR / "data" / "jena_climate_2009_2016.csv"

    out_file = GEN_DIR / "jena_climate_normalized.csv"
    if out_file.exists() and out_file.stat().st_size > 1000:
        print(f"\n[3/4] Jena Climate normalized dataset already exists -> {out_file}")
        return out_file

    print(f"\n[3/4] Ingesting Jena Climate Dataset from {input_file}...")
    df_raw = pd.read_csv(input_file, nrows=max_rows)

    df_clean = pd.DataFrame(index=df_raw.index)
    df_clean[FIELD_STATION_ID] = "JENA_01"
    df_clean[FIELD_TIMESTAMP] = pd.to_datetime(df_raw["Date Time"], errors="coerce", dayfirst=True).dt.strftime("%Y-%m-%d %H:%M:%S")
    df_clean[FIELD_TEMPERATURE] = pd.to_numeric(df_raw["T (degC)"], errors="coerce")
    df_clean[FIELD_PRESSURE] = pd.to_numeric(df_raw["p (mbar)"], errors="coerce")
    df_clean[FIELD_HUMIDITY] = pd.to_numeric(df_raw["rh (%)"], errors="coerce")
    df_clean[FIELD_LAT] = 50.9271
    df_clean[FIELD_LON] = 11.5892
    df_clean[FIELD_ELEVATION] = 155.0

    df_clean = df_clean.dropna(subset=[FIELD_TIMESTAMP, FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY])

    # Filter bounds
    for col in [FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY]:
        low, high = BOUNDS[col]
        df_clean = df_clean[(df_clean[col] >= low) & (df_clean[col] <= high)]

    GEN_DIR.mkdir(parents=True, exist_ok=True)
    df_clean.to_csv(out_file, index=False)
    print(f"  [OK] Saved {len(df_clean):,} clean records -> {out_file}")
    return out_file


def process_dataset02_cities(selected_cities: Optional[list[str]] = None, max_hours: Optional[int] = 10000) -> Path:
    """Ingest DATASET/02 (temperature, pressure, humidity across cities)."""
    dir02 = DATASET_DIR / "02"
    if not (dir02 / "temperature.csv").exists():
        print(f"[warning] DATASET/02 not found.")
        return Path()

    out_file = GEN_DIR / "kaggle_cities_normalized.csv"
    print("\n[4/4] Ingesting Kaggle City Weather (DATASET/02)...")

    # Read city coordinates
    attrs = pd.read_csv(dir02 / "city_attributes.csv")
    city_coords = {
        row["City"]: {"lat": float(row["Latitude"]), "lon": float(row["Longitude"]), "country": str(row["Country"])}
        for _, row in attrs.iterrows()
    }

    # Load hourly sensor matrices
    print("  Loading temperature, pressure, and humidity matrices...")
    df_temp = pd.read_csv(dir02 / "temperature.csv", nrows=max_hours)
    df_pres = pd.read_csv(dir02 / "pressure.csv", nrows=max_hours)
    df_hum  = pd.read_csv(dir02 / "humidity.csv", nrows=max_hours)

    cities = selected_cities or [c for c in df_temp.columns if c != "datetime"]
    print(f"  Processing {len(cities)} cities across {len(df_temp):,} hourly timestamps...")

    merged_rows = []
    timestamps = pd.to_datetime(df_temp["datetime"]).dt.strftime("%Y-%m-%d %H:%M:%S").values

    for city in cities:
        if city not in df_pres.columns or city not in df_hum.columns:
            continue

        c_info = city_coords.get(city, {"lat": 20.0, "lon": 78.0})
        # Convert Kelvin to Celsius (K - 273.15)
        raw_temp_k = df_temp[city].values
        temp_c = raw_temp_k - 273.15
        pres_hpa = df_pres[city].values
        hum_pct = df_hum[city].values
        sid = f"CTY_{city[:8].upper()}"

        for t, temp, pres, hum in zip(timestamps, temp_c, pres_hpa, hum_pct):
            if np.isnan(temp) or np.isnan(pres) or np.isnan(hum):
                continue
            if not (BOUNDS[FIELD_TEMPERATURE][0] <= temp <= BOUNDS[FIELD_TEMPERATURE][1]):
                continue
            if not (BOUNDS[FIELD_PRESSURE][0] <= pres <= BOUNDS[FIELD_PRESSURE][1]):
                continue
            if not (BOUNDS[FIELD_HUMIDITY][0] <= hum <= BOUNDS[FIELD_HUMIDITY][1]):
                continue

            merged_rows.append({
                FIELD_STATION_ID:  sid,
                FIELD_TIMESTAMP:   t,
                FIELD_TEMPERATURE: round(float(temp), 2),
                FIELD_PRESSURE:    round(float(pres), 1),
                FIELD_HUMIDITY:    round(float(hum), 1),
                FIELD_LAT:         c_info["lat"],
                FIELD_LON:         c_info["lon"],
                FIELD_ELEVATION:   100.0,
            })

    df_out = pd.DataFrame(merged_rows)
    df_out = df_out.sort_values(by=[FIELD_STATION_ID, FIELD_TIMESTAMP]).reset_index(drop=True)
    GEN_DIR.mkdir(parents=True, exist_ok=True)
    df_out.to_csv(out_file, index=False)

    print(f"  [OK] Saved {len(df_out):,} hourly readings across {df_out[FIELD_STATION_ID].nunique()} cities -> {out_file}")
    return out_file


def main():
    print("=" * 65)
    print("  SkyGuard AI — Ingesting Entire DATASET/ Folder")
    print("=" * 65)

    # 1. Uttarakhand AWS Stations
    uk_stations = process_uttarakhand_stations()

    # 2. National AWS Census
    census = process_national_aws_census()

    # 3. Jena Climate
    jena_file = process_jena_climate(max_rows=100000)

    # 4. Kaggle Cities (process top 12 representative cities with 10k hours each)
    representative_cities = [
        "Seattle", "San Francisco", "Los Angeles", "Phoenix", "Denver",
        "Chicago", "Miami", "New York", "Boston", "Vancouver", "Houston", "Atlanta"
    ]
    cities_file = process_dataset02_cities(selected_cities=representative_cities, max_hours=12000)

    print("\n" + "=" * 65)
    print("[OK] ALL DATASETS INGESTED & INTEGRATED SUCCESSFULLY!")
    print(f"  - Uttarakhand AWS Stations:  {len(uk_stations)} stations mapped")
    print(f"  - National AWS Census:       {census.get('metadata', {}).get('grand_total_stations', 0):,} stations cataloged")
    print(f"  - Jena Climate Dataset:      {jena_file}")
    print(f"  - Multi-City Weather Data:   {cities_file}")
    print("=" * 65)


if __name__ == "__main__":
    main()
