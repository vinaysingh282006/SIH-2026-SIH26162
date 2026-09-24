"""
SkyGuard AI — Live Stream Simulator
======================================
CLI: replays synthetic data to the backend ingest endpoint in real time,
simulating a live AWS network feed. Optionally injects anomalies at random.

Usage:
    python data/simulate_stream.py --stations 5 --interval 5 --inject-anomalies
    python data/simulate_stream.py --url http://localhost:8000/ingest
"""

import argparse
import random
import time
import json
import math
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Ensure repo root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import requests
import numpy as np

from data.generate_stations import get_all_stations, STATIONS
from data.synthetic_data import generate_station_readings
from data.anomaly_injector import inject_single_reading
from data.schema import AnomalyType, ALL_ANOMALY_TYPES


def stream(
    url: str,
    station_ids: list[str],
    interval_s: float,
    inject_prob: float,
    verbose: bool,
):
    all_stations = {s["station_id"]: s for s in get_all_stations()}
    rngs = {sid: np.random.default_rng(seed=i) for i, sid in enumerate(station_ids)}

    # Track rolling "previous" reading for each station to maintain AR continuity
    prev_row = {}

    print(f"[stream] Sending {len(station_ids)} stations → {url} every {interval_s}s")
    print(f"[stream] Anomaly injection probability: {inject_prob:.0%}")
    print("[stream] Press Ctrl+C to stop.\n")

    while True:
        ts = datetime.now(timezone.utc)
        for sid in station_ids:
            station = all_stations[sid]
            rng = rngs[sid]

            # Generate a single step of synthetic data
            rows = generate_station_readings(
                station,
                start_dt=ts - timedelta(minutes=5),
                end_dt=ts,
                rng=rng,
            )
            if not rows:
                continue
            reading = rows[-1]
            reading["timestamp"] = ts.isoformat()

            # Maybe inject an anomaly
            injected_type = None
            if random.random() < inject_prob:
                anomaly_type = random.choice(ALL_ANOMALY_TYPES)
                reading = inject_single_reading(reading, anomaly_type, rng=rng)
                injected_type = anomaly_type

            try:
                resp = requests.post(url, json=reading, timeout=5)
                if verbose:
                    status = f"[ANOMALY:{injected_type}]" if injected_type else ""
                    t_str = f"{reading.get('temperature_c'):.2f}" if reading.get('temperature_c') is not None else "None"
                    p_str = f"{reading.get('pressure_hpa'):.2f}" if reading.get('pressure_hpa') is not None else "None"
                    h_str = f"{reading.get('humidity_pct'):.2f}" if reading.get('humidity_pct') is not None else "None"
                    print(f"  {sid}  T={t_str:>7}°C  P={p_str:>8}hPa  H={h_str:>6}%  → {resp.status_code} {status}")
            except requests.ConnectionError:
                print(f"  [{sid}] Connection refused — is the backend running at {url}?")

        time.sleep(interval_s)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SkyGuard AI live stream simulator")
    parser.add_argument("--url",       default="http://localhost:8000/ingest")
    parser.add_argument("--stations",  type=int,   default=20,  help="Number of stations to simulate (1–20)")
    parser.add_argument("--interval",  type=float, default=5.0, help="Seconds between batches")
    parser.add_argument("--inject-anomalies", action="store_true")
    parser.add_argument("--inject-prob", type=float, default=0.05, help="Probability of anomaly per reading")
    parser.add_argument("--live-api", action="store_true", help="Fetch and stream authentic real-time weather from Open-Meteo")
    parser.add_argument("--verbose",   action="store_true", default=True)
    args = parser.parse_args()

    if args.live_api:
        from data.simulate_live_api import stream_real_weather
        stream_real_weather(
            url=args.url,
            num_stations=args.stations,
            interval_s=args.interval,
            inject_anomalies=args.inject_anomalies,
            inject_prob=args.inject_prob,
        )
        sys.exit(0)

    all_ids = [s["station_id"] for s in get_all_stations()]
    station_ids = all_ids[: min(args.stations, len(all_ids))]
    inject_prob = args.inject_prob if args.inject_anomalies else 0.0

    stream(args.url, station_ids, args.interval, inject_prob, args.verbose)
