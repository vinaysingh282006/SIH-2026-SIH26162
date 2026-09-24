"""
SkyGuard AI — Frozen Data Schema
=================================
Single source of truth for the AWS reading schema.
Every module (data, ML, backend) imports field names from here.
"""

from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime

# ── Schema field names (use these constants everywhere) ─────────────────────
FIELD_STATION_ID     = "station_id"
FIELD_TIMESTAMP      = "timestamp"
FIELD_TEMPERATURE    = "temperature_c"
FIELD_PRESSURE       = "pressure_hpa"
FIELD_HUMIDITY       = "humidity_pct"
FIELD_LAT            = "lat"
FIELD_LON            = "lon"
FIELD_ELEVATION      = "elevation_m"

# Sensor variables that carry measurements (excludes metadata fields)
SENSOR_VARS = [FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY]

# Full ordered column list for DataFrames
SCHEMA_COLUMNS = [
    FIELD_STATION_ID,
    FIELD_TIMESTAMP,
    FIELD_TEMPERATURE,
    FIELD_PRESSURE,
    FIELD_HUMIDITY,
    FIELD_LAT,
    FIELD_LON,
    FIELD_ELEVATION,
]

# ── Physical plausibility bounds (hard limits for validation) ────────────────
BOUNDS = {
    FIELD_TEMPERATURE: (-50.0, 60.0),    # °C — extreme world range
    FIELD_PRESSURE:    (850.0, 1060.0),  # hPa — sea-level + high elevation
    FIELD_HUMIDITY:    (0.0, 100.0),     # %
    FIELD_ELEVATION:   (-500.0, 8850.0), # m — Dead Sea to Everest
}

# ── Anomaly types (used by injector, detector labels, and frontend) ──────────
class AnomalyType:
    SPIKE          = "spike"
    FROZEN         = "frozen"
    DRIFT          = "drift"
    DROPOUT        = "dropout"        # NaN / missing data gap
    NOISE_BURST    = "noise_burst"
    CROSS_SENSOR   = "cross_sensor"   # inconsistency between sensors
    UNIT_FLIP      = "unit_flip"      # e.g. Fahrenheit reported as Celsius

ALL_ANOMALY_TYPES = [
    AnomalyType.SPIKE,
    AnomalyType.FROZEN,
    AnomalyType.DRIFT,
    AnomalyType.DROPOUT,
    AnomalyType.NOISE_BURST,
    AnomalyType.CROSS_SENSOR,
    AnomalyType.UNIT_FLIP,
]

# ── Severity levels ──────────────────────────────────────────────────────────
class Severity:
    LOW      = "low"
    MEDIUM   = "medium"
    HIGH     = "high"
    CRITICAL = "critical"

SEVERITY_ORDER = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]

# ── Root-cause classes (used by explainability + alert routing) ──────────────
class RootCause:
    SENSOR_FAULT        = "sensor_fault"
    CALIBRATION_DRIFT   = "calibration_drift"
    COMMS_FAILURE       = "comms_failure"
    POWER_FLUCTUATION   = "power_fluctuation"
    ENVIRONMENTAL       = "environmental_extreme"
    DATA_CORRUPTION     = "data_corruption"
    UNKNOWN             = "unknown"


@dataclass
class StationReading:
    """A single AWS reading — the atomic unit that flows through the pipeline."""
    station_id:    str
    timestamp:     datetime
    temperature_c: float
    pressure_hpa:  float
    humidity_pct:  float
    lat:           float
    lon:           float
    elevation_m:   float

    # Optional fields added by the pipeline
    is_anomaly:    Optional[bool]  = None
    anomaly_score: Optional[float] = None   # 0.0 – 1.0 unified probability
    severity:      Optional[str]   = None
    root_cause:    Optional[str]   = None
    confidence:    Optional[float] = None   # calibrated 0–100 %
    explanation:   Optional[str]   = None   # plain-language reason
    corrected_temperature_c: Optional[float] = None
    corrected_pressure_hpa:  Optional[float] = None
    corrected_humidity_pct:  Optional[float] = None

    def to_dict(self) -> dict:
        return {
            FIELD_STATION_ID:  self.station_id,
            FIELD_TIMESTAMP:   self.timestamp.isoformat(),
            FIELD_TEMPERATURE: self.temperature_c,
            FIELD_PRESSURE:    self.pressure_hpa,
            FIELD_HUMIDITY:    self.humidity_pct,
            FIELD_LAT:         self.lat,
            FIELD_LON:         self.lon,
            FIELD_ELEVATION:   self.elevation_m,
            "is_anomaly":      self.is_anomaly,
            "anomaly_score":   self.anomaly_score,
            "severity":        self.severity,
            "root_cause":      self.root_cause,
            "confidence":      self.confidence,
            "explanation":     self.explanation,
            "corrected_temperature_c": self.corrected_temperature_c,
            "corrected_pressure_hpa":  self.corrected_pressure_hpa,
            "corrected_humidity_pct":  self.corrected_humidity_pct,
        }
