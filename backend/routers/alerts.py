from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from backend.state import state

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/", summary="Get recent in-app alerts")
def list_alerts(limit: int = Query(50, le=200)):
    return state.all_alerts(limit=limit)


@router.patch("/{alert_id}/read", summary="Mark alert as read")
def mark_read(alert_id: str):
    state.mark_alert_read(alert_id)
    return {"status": "ok", "alert_id": alert_id}
