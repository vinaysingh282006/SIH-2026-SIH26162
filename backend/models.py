"""
SkyGuard AI — Pydantic Schemas (API models)
=============================================
Shared across all routers. Must match the frozen data schema in data/schema.py.
"""

from __future__ import annotations
from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


# ── Ingest ────────────────────────────────────────────────────────────────────

class ReadingIn(BaseModel):
    station_id:    str
    timestamp:     Optional[str] = None    # Defaults to now(UTC) if omitted
    temperature_c: Optional[float] = None
    pressure_hpa:  Optional[float] = None
    humidity_pct:  Optional[float] = None
    lat:           float = 0.0
    lon:           float = 0.0
    elevation_m:   float = 0.0


# ── Station ───────────────────────────────────────────────────────────────────

class StationOut(BaseModel):
    station_id:   str
    name:         str
    lat:          float
    lon:          float
    elevation_m:  float
    region:       str
    health_score: float = 100.0
    status:       str   = "healthy"   # healthy | warning | critical | offline


# ── Reading (processed, includes anomaly fields) ──────────────────────────────

class ReadingOut(BaseModel):
    station_id:    str
    timestamp:     str
    temperature_c: Optional[float]
    pressure_hpa:  Optional[float]
    humidity_pct:  Optional[float]
    lat:           float
    lon:           float
    elevation_m:   float
    is_anomaly:    bool  = False
    anomaly_score: float = 0.0
    severity:      Optional[str] = None
    root_cause:    Optional[str] = None
    confidence:    float = 0.0
    explanation:   Optional[str] = None
    corrected_temperature_c: Optional[float] = None
    corrected_pressure_hpa:  Optional[float] = None
    corrected_humidity_pct:  Optional[float] = None


# ── Anomaly event ─────────────────────────────────────────────────────────────

class AnomalyOut(BaseModel):
    anomaly_id:   str
    station_id:   str
    timestamp:    str
    severity:     str
    root_cause:   Optional[str]
    confidence:   float
    explanation:  Optional[str]
    layer_scores: dict[str, float] = {}
    shap_bars:    list[dict]        = []
    root_cause_confidence: dict[str, float] = {}
    reading:      Optional[ReadingOut] = None


# ── Health ────────────────────────────────────────────────────────────────────

class SensorHealthOut(BaseModel):
    station_id:             str
    health_score:           float
    anomaly_rate_pct:       float
    comm_reliability_pct:   float
    ema_anomaly_score:      float
    trend:                  str
    maintenance_urgency:    str
    days_to_maintenance:    Optional[float]


# ── Alert ─────────────────────────────────────────────────────────────────────

class AlertOut(BaseModel):
    alert_id:   str
    anomaly_id: str
    station_id: str
    timestamp:  str
    severity:   str
    message:    str
    channel:    str = "in_app"
    read:       bool = False


# ── Demo / Inject ─────────────────────────────────────────────────────────────

class InjectRequest(BaseModel):
    station_id:   str
    anomaly_type: str = Field(..., description=(
        "One of: spike, frozen, drift, dropout, noise_burst, cross_sensor, unit_flip"
    ))


class InjectResponse(BaseModel):
    status:         str
    station_id:     str
    anomaly_type:   str
    injected_reading: dict
    detection_result: dict


# ── WebSocket broadcast payload ───────────────────────────────────────────────

class LiveEvent(BaseModel):
    event_type: str   # "reading" | "anomaly" | "health_update"
    payload:    Any
