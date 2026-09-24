from fastapi import APIRouter, Depends, HTTPException
from backend.state import state

router = APIRouter(prefix="/stations", tags=["stations"])


@router.get("/", summary="List all stations with current health and status")
def list_stations():
    return state.all_stations()


@router.get("/{station_id}", summary="Get one station's metadata + health")
def get_station(station_id: str):
    s = state.get_station(station_id)
    if not s:
        raise HTTPException(404, detail=f"Station {station_id} not found")
    health = state.get_health(station_id) or {}
    return {**s, **health}


@router.get("/{station_id}/readings", summary="Get recent readings for a station")
def get_readings(station_id: str, limit: int = 200):
    readings = state.get_readings(station_id, limit=limit)
    if not readings:
        raise HTTPException(404, detail=f"No readings for station {station_id}")
    return readings
