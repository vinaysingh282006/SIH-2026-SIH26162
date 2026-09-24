from fastapi import APIRouter, HTTPException
from backend.state import state

router = APIRouter(prefix="/sensor-health", tags=["health"])


@router.get("/", summary="Get health scores for all stations")
def all_health():
    return state.all_health()


@router.get("/{station_id}", summary="Get health for one station")
def station_health(station_id: str):
    h = state.get_health(station_id)
    if not h:
        raise HTTPException(404, detail=f"No health data for station {station_id}")
    return h
