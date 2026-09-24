"""
Demo / Judge Mode — Inject Anomaly endpoint
============================================
POST /inject-anomaly

Calls data/anomaly_injector.py directly on a live reading dict, then
feeds the result through the SAME pipeline.process_reading() as real data.
Demo Mode exercises the actual detection path — not a mocked response.
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone

from backend.models import InjectRequest
from backend.state import state
from backend.pipeline import process_reading
from data.anomaly_injector import inject_single_reading
from data.generate_stations import get_station_by_id

router = APIRouter(prefix="/inject-anomaly", tags=["demo"])


@router.post("/", summary="[Demo Mode] Inject a synthetic anomaly into the live pipeline")
def inject_anomaly(req: InjectRequest):
    station = get_station_by_id(req.station_id)
    if not station:
        raise HTTPException(404, detail=f"Station {req.station_id} not found")

    # Build a baseline reading using the latest available reading for this station
    history = state.get_readings(req.station_id, limit=5)
    if history:
        base = dict(history[-1])
    else:
        # Fallback: synthetic baseline
        from data.synthetic_data import generate_station_readings
        from datetime import timedelta
        import numpy as np
        now = datetime.now(timezone.utc)
        rows = generate_station_readings(
            station,
            start_dt=now - timedelta(minutes=10),
            end_dt=now,
            rng=np.random.default_rng(),
        )
        base = rows[-1] if rows else {
            "station_id": req.station_id,
            "temperature_c": 25.0,
            "pressure_hpa": 1013.0,
            "humidity_pct": 60.0,
            "lat": station["lat"],
            "lon": station["lon"],
            "elevation_m": station["elevation_m"],
        }

    # Stamp with current time
    base["timestamp"] = datetime.now(timezone.utc).isoformat()

    # Inject the anomaly (corrupts the reading)
    import numpy as np
    corrupted = inject_single_reading(base, req.anomaly_type, rng=np.random.default_rng())

    # Feed through the live pipeline (same path as real ingest)
    result = process_reading(corrupted, state, broadcast=True)

    return {
        "status":           "injected",
        "station_id":       req.station_id,
        "anomaly_type":     req.anomaly_type,
        "injected_reading": corrupted,
        "detection_result": {
            "is_anomaly":    result.get("is_anomaly"),
            "severity":      result.get("severity"),
            "confidence":    result.get("confidence"),
            "root_cause":    result.get("root_cause"),
            "explanation":   result.get("explanation"),
            "anomaly_id":    result.get("anomaly_id"),
        },
    }
