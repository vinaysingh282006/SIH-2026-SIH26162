"""
SkyGuard AI — In-Memory Application State
==========================================
Single shared state object. No database dependency — intentional for demo:
  - Fast, zero-setup, restartable
  - Pre-seeded from bootstrap on startup
  - Reset between demo runs just by restarting the process

NOTE: A restart clears all state. Do not restart mid-demo.
For production, replace with TimescaleDB + Redis pub/sub.
"""

import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Optional

from backend.models import (
    StationOut, ReadingOut, AnomalyOut, SensorHealthOut, AlertOut
)

# Rolling window size per station for in-memory readings (keep last 24h × 5-min = 288)
MAX_READINGS_PER_STATION = 288


def to_native(obj):
    """Recursively convert numpy types to native Python types for JSON serialization."""
    if isinstance(obj, dict):
        return {k: to_native(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, deque)):
        return [to_native(v) for v in obj]
    elif hasattr(obj, "item"):
        return obj.item()
    return obj


class AppState:
    """Thread-safe-ish in-memory state. FastAPI is async-single-threaded, so no locks needed."""

    def __init__(self):
        # Station metadata
        self._stations:   dict[str, dict] = {}

        # Per-station deque of raw reading dicts
        self._readings:   dict[str, deque] = defaultdict(lambda: deque(maxlen=MAX_READINGS_PER_STATION))

        # Anomaly events (all, not per-station — kept in insertion order)
        self._anomalies:  dict[str, dict] = {}          # anomaly_id → AnomalyOut dict
        self._anomaly_order: list[str] = []             # ordered list of anomaly_ids

        # Alerts
        self._alerts:     dict[str, dict] = {}
        self._alert_order: list[str] = []

        # Health (latest snapshot per station)
        self._health:     dict[str, dict] = {}

        # Eval results (loaded from ml/models/eval_results.json at startup)
        self.eval_results: dict = {}

        # Detection settings (tunable from the Settings screen)
        self.settings: dict = {
            "z_threshold":    3.5,
            "iqr_multiplier": 2.5,
            "min_confidence": 30.0,  # %
            "alert_severity_threshold": "medium",
        }

    # ── Stations ──────────────────────────────────────────────────────────────

    def upsert_station(self, station_dict: dict) -> None:
        sid = station_dict["station_id"]
        self._stations[sid] = to_native(station_dict)

    def get_station(self, station_id: str) -> Optional[dict]:
        return self._stations.get(station_id)

    def all_stations(self) -> list[dict]:
        stations = []
        for sid, s in self._stations.items():
            health = self._health.get(sid, {})
            score  = health.get("health_score", 100.0)
            urgency = health.get("maintenance_urgency", "none")
            status = (
                "critical" if score < 30
                else "warning"  if score < 60
                else "offline"  if urgency == "critical"
                else "healthy"
            )
            stations.append({**s, "health_score": score, "status": status})
        return stations

    # ── Readings ──────────────────────────────────────────────────────────────

    def push_reading(self, reading: dict) -> None:
        sid = reading.get("station_id", "unknown")
        self._readings[sid].append(to_native(reading))

    def get_readings(self, station_id: str, limit: int = 200) -> list[dict]:
        return list(self._readings[station_id])[-limit:]

    def all_readings(self) -> list[dict]:
        all_r = []
        for readings in self._readings.values():
            all_r.extend(readings)
        return all_r

    def latest_readings(self) -> dict[str, dict]:
        """Latest reading per station."""
        return {
            sid: self._readings[sid][-1]
            for sid in self._readings
            if self._readings[sid]
        }

    # ── Anomalies ─────────────────────────────────────────────────────────────

    def push_anomaly(self, anomaly: dict) -> str:
        aid = str(uuid.uuid4())[:8]
        anomaly["anomaly_id"] = aid
        native_anomaly = to_native(anomaly)
        self._anomalies[aid] = native_anomaly
        self._anomaly_order.append(aid)
        return aid

    def get_anomaly(self, anomaly_id: str) -> Optional[dict]:
        return self._anomalies.get(anomaly_id)

    def all_anomalies(
        self,
        severity: Optional[str] = None,
        station_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict]:
        anomalies = [self._anomalies[aid] for aid in reversed(self._anomaly_order)]
        if severity:
            anomalies = [a for a in anomalies if a.get("severity") == severity]
        if station_id:
            anomalies = [a for a in anomalies if a.get("station_id") == station_id]
        return anomalies[:limit]

    # ── Alerts ────────────────────────────────────────────────────────────────

    def push_alert(self, alert: dict) -> str:
        alid = str(uuid.uuid4())[:8]
        alert["alert_id"] = alid
        native_alert = to_native(alert)
        self._alerts[alid] = native_alert
        self._alert_order.append(alid)
        return alid

    def all_alerts(self, limit: int = 50) -> list[dict]:
        return [self._alerts[aid] for aid in reversed(self._alert_order)][:limit]

    def mark_alert_read(self, alert_id: str) -> None:
        if alert_id in self._alerts:
            self._alerts[alert_id]["read"] = True

    # ── Health ────────────────────────────────────────────────────────────────

    def update_health(self, station_id: str, health: dict) -> None:
        self._health[station_id] = to_native(health)

    def get_health(self, station_id: str) -> Optional[dict]:
        return self._health.get(station_id)

    def all_health(self) -> list[dict]:
        return list(self._health.values())


# ── Singleton ─────────────────────────────────────────────────────────────────
state = AppState()
