from datetime import datetime, timezone
from fastapi import APIRouter
from backend.models import ReadingIn
from backend.state import state
from backend.pipeline import process_reading

router = APIRouter(tags=["ingest"])


@router.post("/ingest", summary="Ingest a new reading from an AWS station or simulator")
@router.post("/ingest/", summary="Ingest a new reading from an AWS station or simulator")
def ingest(reading: ReadingIn):
    r = reading.model_dump()
    if not r.get("timestamp"):
        r["timestamp"] = datetime.now(timezone.utc).isoformat()
    result = process_reading(r, state, broadcast=True)
    return {
        "status":        "ok",
        "is_anomaly":    bool(result.get("is_anomaly", False)),
        "anomaly_score": float(result.get("anomaly_score", 0.0)),
        "severity":      str(result.get("severity") or ""),
        "anomaly_id":    result.get("anomaly_id"),
    }
