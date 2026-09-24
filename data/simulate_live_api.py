"""
SkyGuard AI — Real-Time Live API Stream Simulator
===================================================
Streams authentic real-time meteorological observations from the free Open-Meteo Live API
(covers Delhi, Mumbai, Bengaluru, Kolkata, Chennai, Jaipur, Shimla, etc.) directly into
SkyGuard AI's ingestion pipeline.

Zero API key required. 100% genuine live weather conditions.

Features:
  - Fetches authentic live weather for 20 Indian stations in a single API call
  - Adds realistic sensor ADC micro-jitter between readings (simulates 5s telemetry loop)
  - Optionally injects synthetic sensor hardware anomalies (spikes, frozen sensors, drift)
  - Can stream to local backend or directly to your deployed Render URL

Usage:
    # 1. Stream real-time weather to local backend:
    python -m data.simulate_live_api --interval 3

    # 2. Stream real-time weather with 10% anomaly injection:
    python -m data.simulate_live_api --interval 3 --inject-anomalies --inject-prob 0.10

    # 3. Stream real-time weather directly to your live deployed Render website:
    python -m data.simulate_live_api --url https://your-app.onrender.com/ingest --interval 4
"""

import argparse
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests

# Add repo root to import path
sys.path.insert(0, str(Path(__file__).parent.parent))

from data.generate_stations import get_all_stations
from data.anomaly_injector import inject_single_reading
from data.schema import (
    FIELD_STATION_ID, FIELD_TIMESTAMP,
    FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY,
    FIELD_LAT, FIELD_LON, FIELD_ELEVATION,
    ALL_ANOMALY_TYPES,
)

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


class RealTimeWeatherFeeder:
    def __init__(self, stations: list[dict]):
        self.stations = stations
        self.station_map = {s["station_id"]: s for s in stations}
        self.last_fetch_time = 0
        self.cached_weather = {}   # sid -> {temp, pressure, humidity}

    def fetch_live_weather(self) -> bool:
        """Fetch current weather for all stations in one single batched API query."""
        lats = ",".join(str(s["lat"]) for s in self.stations)
        lons = ",".join(str(s["lon"]) for s in self.stations)

        params = {
            "latitude": lats,
            "longitude": lons,
            "current": "temperature_2m,relative_humidity_2m,surface_pressure",
            "timezone": "auto",
        }

        try:
            resp = requests.get(OPEN_METEO_FORECAST_URL, params=params, timeout=12)
            if resp.status_code != 200:
                print(f"[live-api] Warning: API returned HTTP {resp.status_code}")
                return False

            data = resp.json()
            # If multiple coordinates, data is a list of dicts
            results = data if isinstance(data, list) else [data]

            for s, item in zip(self.stations, results):
                current = item.get("current", {})
                sid = s["station_id"]
                self.cached_weather[sid] = {
                    "temperature_c": float(current.get("temperature_2m", 25.0)),
                    "pressure_hpa":  float(current.get("surface_pressure", 1013.25)),
                    "humidity_pct":  float(current.get("relative_humidity_2m", 50.0)),
                }

            self.last_fetch_time = time.time()
            return True
        except Exception as e:
            print(f"[live-api] Network error fetching Open-Meteo: {e}")
            return False

    def get_real_reading(self, station: dict) -> dict:
        """Returns realistic live reading with micro-fluctuations simulating continuous sensor ADC."""
        sid = station["station_id"]

        # Re-fetch genuine weather from API every 15 minutes
        if not self.cached_weather or (time.time() - self.last_fetch_time > 900):
            print("[live-api] Syncing latest live weather observations from Open-Meteo...")
            self.fetch_live_weather()

        base = self.cached_weather.get(sid, {
            "temperature_c": 26.0,
            "pressure_hpa": 1012.0,
            "humidity_pct": 55.0,
        })

        # Micro-variations around the real current baseline
        temp = round(base["temperature_c"] + random.gauss(0, 0.08), 2)
        pres = round(base["pressure_hpa"]  + random.gauss(0, 0.12), 2)
        hum  = round(base["humidity_pct"]  + random.gauss(0, 0.25), 1)
        hum  = max(5.0, min(100.0, hum))

        return {
            FIELD_STATION_ID:  sid,
            FIELD_TIMESTAMP:   datetime.now(timezone.utc).isoformat(),
            FIELD_TEMPERATURE: temp,
            FIELD_PRESSURE:    pres,
            FIELD_HUMIDITY:    hum,
            FIELD_LAT:         station["lat"],
            FIELD_LON:         station["lon"],
            FIELD_ELEVATION:   station.get("elevation_m", 100),
        }


def stream_real_weather(
    url: str,
    num_stations: int = 20,
    interval_s: float = 3.0,
    inject_anomalies: bool = False,
    inject_prob: float = 0.08,
):
    stations = get_all_stations()[:num_stations]
    feeder = RealTimeWeatherFeeder(stations)

    print("=" * 65)
    print("  SkyGuard AI — Real-Time Live API Weather Streamer")
    print(f"  Target Ingest URL: {url}")
    print(f"  Active Stations:   {len(stations)} Automatic Weather Stations")
    print(f"  Stream Interval:   Every {interval_s} seconds")
    print(f"  Anomaly Injection: {'ENABLED (' + str(int(inject_prob * 100)) + '%)' if inject_anomalies else 'DISABLED'}")
    print("=" * 65)

    # Initial sync
    feeder.fetch_live_weather()
    print("[live-api] Initial meteorological snapshot synchronized. Starting telemetry broadcast...\n")

    rng = np.random.default_rng()

    while True:
        # Pick a round-robin or randomized subset of stations each tick to generate continuous traffic
        selected_stations = random.sample(stations, min(4, len(stations)))

        for s in selected_stations:
            reading = feeder.get_real_reading(s)
            injected_type = None

            if inject_anomalies and random.random() < inject_prob:
                injected_type = random.choice(ALL_ANOMALY_TYPES)
                reading = inject_single_reading(reading, injected_type, rng=rng)

            try:
                resp = requests.post(url, json=reading, timeout=5)
                status_str = f"[{injected_type.upper()}]" if injected_type else "OK"
                t = reading.get(FIELD_TEMPERATURE)
                p = reading.get(FIELD_PRESSURE)
                h = reading.get(FIELD_HUMIDITY)
                print(f"  {s['station_id']} ({s['name'][:18]:<18}) T={t:>5.1f}C | P={p:>7.1f}hPa | H={h:>5.1f}% -> HTTP {resp.status_code} {status_str}")
            except requests.ConnectionError:
                print(f"  [{s['station_id']}] Connection failed to {url}. Is backend running?")
            except Exception as e:
                print(f"  [{s['station_id']}] Ingestion error: {e}")

        time.sleep(interval_s)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stream authentic real-time weather into SkyGuard AI")
    parser.add_argument("--url", default="http://localhost:8000/ingest", help="Ingest API URL (local or Render URL)")
    parser.add_argument("--stations", type=int, default=20, help="Number of AWS stations (1-20)")
    parser.add_argument("--interval", type=float, default=3.0, help="Seconds between telemetry bursts")
    parser.add_argument("--inject-anomalies", action="store_true", help="Randomly inject sensor hardware faults")
    parser.add_argument("--inject-prob", type=float, default=0.08, help="Anomaly injection probability (0.01 - 0.5)")
    args = parser.parse_args()

    stream_real_weather(
        url=args.url,
        num_stations=args.stations,
        interval_s=args.interval,
        inject_anomalies=args.inject_anomalies,
        inject_prob=args.inject_prob,
    )
