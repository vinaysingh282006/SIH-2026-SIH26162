from fastapi import APIRouter
from backend.models import ReadingIn
from backend.state import state
from backend.pipeline import process_reading

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/", summary="Ingest a new reading from an AWS station or simulator")
def ingest(reading: ReadingIn):
    r = reading.model_dump()
    result = process_reading(r, state, broadcast=True)
    return {
        "status":       "ok",
        "is_anomaly":   result.get("is_anomaly", False),
        "anomaly_score": result.get("anomaly_score", 0.0),
        "severity":     result.get("severity"),
        "anomaly_id":   result.get("anomaly_id"),
    }
