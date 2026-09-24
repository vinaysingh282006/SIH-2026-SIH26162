"""
SkyGuard AI — Bootstrap History
=================================
Called by backend/main.py on startup to pre-seed the in-memory state with
24h of historical readings + a sample of pre-detected anomalies so the
dashboard isn't empty on first load.
"""

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

import numpy as np

from data.synthetic_data import generate_all_stations
from data.schema import (
    FIELD_STATION_ID, FIELD_TIMESTAMP,
    FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY,
    FIELD_LAT, FIELD_LON, FIELD_ELEVATION,
)

if TYPE_CHECKING:
    from backend.state import AppState


def bootstrap(state: "AppState", hours: int = 24) -> None:
    """
    Generate `hours` of synthetic history and load it into `state`.

    Fast path: seed all readings directly (skip pipeline) so startup is < 5s.
    Then run detection on a sample of readings to pre-populate the anomaly feed.
    """
    from backend.pipeline import process_reading
    from data.generate_stations import get_all_stations

    stations = get_all_stations()
    print(f"[bootstrap] Generating {hours}h of history for {len(stations)} stations…")
    df = generate_all_stations(hours=hours)

    # Register all stations in state
    for s in stations:
        state.upsert_station(s)

    rows = df.to_dict(orient="records")

    # Seed raw readings fast (no ML inference on every reading)
    for row in rows:
        reading = {
            "station_id":    row[FIELD_STATION_ID],
            "timestamp":     row[FIELD_TIMESTAMP] if isinstance(row[FIELD_TIMESTAMP], str)
                             else str(row[FIELD_TIMESTAMP]),
            "temperature_c": row[FIELD_TEMPERATURE],
            "pressure_hpa":  row[FIELD_PRESSURE],
            "humidity_pct":  row[FIELD_HUMIDITY],
            "lat":           row[FIELD_LAT],
            "lon":           row[FIELD_LON],
            "elevation_m":   row[FIELD_ELEVATION],
            "is_anomaly":    False,
            "anomaly_score": 0.0,
        }
        state.push_reading(reading)

    # Seed health scores at 100% for each station
    for s in stations:
        state.update_health(s["station_id"], {
            "station_id":           s["station_id"],
            "health_score":         100.0,
            "anomaly_rate_pct":     0.0,
            "comm_reliability_pct": 100.0,
            "ema_anomaly_score":    0.0,
            "trend":                "stable",
            "maintenance_urgency":  "none",
            "days_to_maintenance":  None,
        })

    # Run detection on 1 in 30 readings (sample) to pre-seed anomaly feed
    sample = rows[::30]
    for row in sample:
        reading = {
            "station_id":    row[FIELD_STATION_ID],
            "timestamp":     row[FIELD_TIMESTAMP] if isinstance(row[FIELD_TIMESTAMP], str)
                             else str(row[FIELD_TIMESTAMP]),
            "temperature_c": row[FIELD_TEMPERATURE],
            "pressure_hpa":  row[FIELD_PRESSURE],
            "humidity_pct":  row[FIELD_HUMIDITY],
            "lat":           row[FIELD_LAT],
            "lon":           row[FIELD_LON],
            "elevation_m":   row[FIELD_ELEVATION],
        }
        try:
            process_reading(reading, state, broadcast=False)
        except Exception:
            pass  # never block startup

    n_readings  = sum(len(list(state.get_readings(s["station_id"]))) for s in stations)
    n_anomalies = len(state.all_anomalies())
    print(f"[bootstrap] Done — {n_readings:,} readings, {n_anomalies} anomalies seeded.")

