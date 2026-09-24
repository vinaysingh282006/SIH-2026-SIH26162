"""
SkyGuard AI — Spatial Consistency Layer
========================================
Layer 5: Compares a station's reading against interpolated values from its
k nearest neighbours (Inverse Distance Weighting).

A large deviation from the IDW estimate separates a genuine local sensor
fault from a real regional weather event (where all neighbours agree).
"""

import math
from typing import Optional

from data.generate_stations import get_all_stations
from data.schema import SENSOR_VARS, FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY

# Pre-compute station coordinates
_STATIONS = {s["station_id"]: (s["lat"], s["lon"]) for s in get_all_stations()}

K_NEIGHBOURS = 4          # number of nearest stations to consult
IDW_POWER    = 2          # inverse distance weighting power
SPATIAL_THRESHOLD = 5.0  # °C (or hPa) deviation from IDW estimate → flag


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def _idw_estimate(
    target_lat: float,
    target_lon: float,
    neighbour_readings: list[dict],
    sensor: str,
) -> Optional[float]:
    """
    Compute IDW-weighted estimate of `sensor` value at target location
    using available neighbour readings.
    """
    weights = []
    values  = []
    for r in neighbour_readings:
        sid = r.get("station_id")
        val = r.get(sensor)
        if sid not in _STATIONS or val is None:
            continue
        lat2, lon2 = _STATIONS[sid]
        dist = max(_haversine_km(target_lat, target_lon, lat2, lon2), 0.1)  # avoid div/0
        w = 1.0 / (dist ** IDW_POWER)
        weights.append(w)
        values.append(val)

    if not weights:
        return None
    total_w = sum(weights)
    return sum(w * v for w, v in zip(weights, values)) / total_w


def detect_spatial(
    reading: dict,
    neighbour_readings: list[dict],
) -> dict:
    """
    Check a single reading against IDW estimates from neighbours.

    Args:
        reading:           the suspect reading dict
        neighbour_readings: list of current readings from other stations

    Returns:
        {score, is_anomaly, flags, idw_estimates, layer}
    """
    if not neighbour_readings:
        return {"score": 0.0, "is_anomaly": False, "flags": ["no_neighbours"], "layer": "spatial"}

    lat = reading.get("lat")
    lon = reading.get("lon")
    if lat is None or lon is None:
        return {"score": 0.0, "is_anomaly": False, "flags": [], "layer": "spatial"}

    # Sort neighbours by distance, take closest K
    def dist_to_target(r: dict) -> float:
        sid = r.get("station_id")
        if sid not in _STATIONS:
            return float("inf")
        la, lo = _STATIONS[sid]
        return _haversine_km(lat, lon, la, lo)

    closest = sorted(neighbour_readings, key=dist_to_target)[:K_NEIGHBOURS]

    flags         = []
    scores        = []
    idw_estimates = {}

    for sensor in SENSOR_VARS:
        val = reading.get(sensor)
        if val is None:
            continue
        estimate = _idw_estimate(lat, lon, closest, sensor)
        if estimate is None:
            continue
        idw_estimates[sensor] = round(estimate, 3)
        deviation = abs(val - estimate)

        # Scale threshold by sensor: temperature sensitive to 5°C, pressure to 15hPa, humidity to 20%
        thresholds = {
            FIELD_TEMPERATURE: 5.0,
            FIELD_PRESSURE:    15.0,
            FIELD_HUMIDITY:    20.0,
        }
        thresh = thresholds.get(sensor, SPATIAL_THRESHOLD)
        if deviation > thresh:
            ratio = deviation / thresh
            flags.append(f"{sensor}_spatial_dev={deviation:.1f}(est={estimate:.1f})")
            scores.append(min(ratio, 2.0))

    score = max(scores) if scores else 0.0
    is_anomaly = score > 0.8  # only flag if clearly out of range vs neighbours

    return {
        "score":         round(score, 4),
        "is_anomaly":    is_anomaly,
        "flags":         flags,
        "idw_estimates": idw_estimates,
        "layer":         "spatial",
    }
