from fastapi import APIRouter, Depends, HTTPException
from backend.state import state

router = APIRouter(prefix="/stations", tags=["stations"])


import json
from pathlib import Path

@router.get("/", summary="List all stations with current health and status")
def list_stations():
    return state.all_stations()


@router.get("/census/national", summary="Official MoES/IMD National AWS & ARG Deployment Census")
def get_national_census():
    census_file = Path(__file__).parent.parent.parent / "data" / "generated" / "national_aws_census.json"
    if census_file.exists():
        with open(census_file) as f:
            return json.load(f)
    return {"message": "Census data not yet ingested"}


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
