from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from backend.state import state

router = APIRouter(prefix="/anomalies", tags=["anomalies"])


@router.get("/", summary="List anomaly events (filterable by severity/station)")
def list_anomalies(
    severity:   Optional[str] = Query(None, description="low|medium|high|critical"),
    station_id: Optional[str] = Query(None),
    limit:      int           = Query(100, le=500),
):
    return state.all_anomalies(severity=severity, station_id=station_id, limit=limit)


@router.get("/{anomaly_id}", summary="Get one anomaly event")
def get_anomaly(anomaly_id: str):
    a = state.get_anomaly(anomaly_id)
    if not a:
        raise HTTPException(404, detail=f"Anomaly {anomaly_id} not found")
    return a


@router.get("/{anomaly_id}/explain", summary="Get explainability breakdown for one anomaly")
def explain_anomaly(anomaly_id: str):
    a = state.get_anomaly(anomaly_id)
    if not a:
        raise HTTPException(404, detail=f"Anomaly {anomaly_id} not found")
    return {
        "anomaly_id":            anomaly_id,
        "station_id":            a.get("station_id"),
        "timestamp":             a.get("timestamp"),
        "severity":              a.get("severity"),
        "confidence":            a.get("confidence"),
        "root_cause":            a.get("root_cause"),
        "reasoning_text":        a.get("explanation"),
        "shap_bars":             a.get("shap_bars", []),
        "root_cause_confidence": a.get("root_cause_confidence", {}),
        "layer_scores":          a.get("layer_scores", {}),
    }
