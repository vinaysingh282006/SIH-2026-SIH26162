"""
SkyGuard AI — Detection Pipeline
==================================
Wires: ingested reading → 5-layer ensemble → health update → alert dispatch →
        WebSocket broadcast → state storage.

Design decisions (from implementation plan):
  - Statistical layer runs SYNCHRONOUSLY on every reading (fast, always-on)
  - Isolation Forest runs synchronously (fast, already fitted)
  - LSTM-AE runs synchronously but is a no-op if not fitted (returns 0.0)
  - Cross-sensor runs synchronously on last 6 readings
  - Spatial runs synchronously on latest neighbour readings

  All layers complete in < 50ms on CPU — well within the <2s latency budget.
  The `broadcast` flag lets bootstrap skip WebSocket calls (no clients yet).
"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import pandas as pd

from ml.statistical_detector import detect_statistical_all_sensors
from ml.isolation_forest import score_reading as if_score
from ml.lstm_autoencoder import score_reading as lstm_score
from ml.cross_sensor import detect_cross_sensor
from ml.spatial_consistency import detect_spatial
from ml.ensemble_fusion import fuse
from ml.explainability import generate_explanation
from ml.health_scoring import update as health_update
from ml.imputation import impute

from data.schema import SENSOR_VARS, Severity

if TYPE_CHECKING:
    from backend.state import AppState

# Minimum unified score to generate an alert
ALERT_SEVERITY_MAP = {
    Severity.LOW:      "low",
    Severity.MEDIUM:   "medium",
    Severity.HIGH:     "high",
    Severity.CRITICAL: "critical",
}
ALERT_MIN_SEVERITY = Severity.MEDIUM   # only alert if >= medium


def process_reading(
    reading: dict,
    state: "AppState",
    broadcast: bool = True,
) -> dict:
    """
    Full detection pipeline for one reading.
    Returns the enriched reading dict (with anomaly/health fields).
    """
    sid = reading.get("station_id", "unknown")

    # ── Build feature window for this station ─────────────────────────────────
    history = state.get_readings(sid, limit=50)
    window  = history + [reading]
    df_win  = _to_df(window)

    # ── Latest readings from all other stations (spatial layer) ───────────────
    latest_others = [
        r for sid2, r in state.latest_readings().items()
        if sid2 != sid and r.get("temperature_c") is not None
    ]

    # ── Run all 5 layers ──────────────────────────────────────────────────────
    stat_result    = detect_statistical_all_sensors(df_win)
    if_result      = if_score(reading)
    lstm_result    = lstm_score(reading)
    cross_result   = detect_cross_sensor(window[-6:])
    spatial_result = detect_spatial(reading, latest_others)

    # ── Fuse ──────────────────────────────────────────────────────────────────
    fusion = fuse(stat_result, if_result, lstm_result, cross_result, spatial_result)

    # ── Explainability ────────────────────────────────────────────────────────
    explanation_data = {}
    if fusion["is_anomaly"]:
        explanation_data = generate_explanation(
            reading, fusion, stat_result, cross_result, spatial_result, window
        )

    # ── Self-healing imputation ────────────────────────────────────────────────
    imputation_data = {}
    if fusion["is_anomaly"]:
        imputation_data = impute(reading, history, latest_others)

    # ── Health update ─────────────────────────────────────────────────────────
    health = health_update(reading, fusion["unified_score"])
    state.update_health(sid, {**health, "station_id": sid})

    # ── Enrich reading ────────────────────────────────────────────────────────
    enriched = {
        **reading,
        "is_anomaly":    fusion["is_anomaly"],
        "anomaly_score": fusion["unified_score"],
        "severity":      fusion.get("severity"),
        "root_cause":    fusion.get("root_cause"),
        "confidence":    fusion.get("confidence", 0.0),
        "explanation":   explanation_data.get("reasoning_text"),
        "layer_scores":  fusion.get("layer_scores", {}),
        "shap_bars":     explanation_data.get("shap_bars", []),
        "root_cause_confidence": explanation_data.get("root_cause_confidence", {}),
        **{k: v for k, v in imputation_data.items()
           if k.startswith("corrected_")},
    }

    # ── Store reading ─────────────────────────────────────────────────────────
    state.push_reading(enriched)

    # ── Store anomaly + alert ─────────────────────────────────────────────────
    anomaly_id = None
    if fusion["is_anomaly"]:
        anomaly_id = state.push_anomaly({
            "station_id":  sid,
            "timestamp":   reading.get("timestamp", datetime.now(timezone.utc).isoformat()),
            "severity":    fusion["severity"],
            "root_cause":  fusion["root_cause"],
            "confidence":  fusion["confidence"],
            "explanation": explanation_data.get("reasoning_text"),
            "layer_scores": fusion.get("layer_scores", {}),
            "shap_bars":    explanation_data.get("shap_bars", []),
            "root_cause_confidence": explanation_data.get("root_cause_confidence", {}),
            "reading":     enriched,
        })
        enriched["anomaly_id"] = anomaly_id

        sev_order = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]
        threshold_idx = sev_order.index(ALERT_MIN_SEVERITY)
        current_idx   = sev_order.index(fusion["severity"]) if fusion.get("severity") in sev_order else 0

        if current_idx >= threshold_idx:
            station_name = (state.get_station(sid) or {}).get("name", sid)
            alert_msg = (
                f"[{fusion['severity'].upper()}] Station {station_name}: "
                f"{explanation_data.get('reasoning_text', 'Anomaly detected')[:120]}…"
            )
            state.push_alert({
                "anomaly_id": anomaly_id,
                "station_id": sid,
                "timestamp":  reading.get("timestamp", ""),
                "severity":   fusion["severity"],
                "message":    alert_msg,
                "channel":    "in_app",
                "read":       False,
            })

    # ── Broadcast via WebSocket (async context not guaranteed here) ────────────
    if broadcast:
        _broadcast_sync(enriched, health, sid, anomaly_id)

    return enriched


def _broadcast_sync(enriched: dict, health: dict, sid: str, anomaly_id: str | None) -> None:
    """Fire-and-forget WebSocket broadcast without blocking the pipeline."""
    try:
        from backend.websocket import broadcast_event
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(_do_broadcast(enriched, health, sid, anomaly_id))
    except RuntimeError:
        pass   # No event loop in bootstrap context — safe to skip


async def _do_broadcast(enriched: dict, health: dict, sid: str, anomaly_id: str | None):
    from backend.websocket import broadcast_event
    await broadcast_event("reading", enriched)
    await broadcast_event("health_update", {**health, "station_id": sid})
    if anomaly_id and enriched.get("is_anomaly"):
        await broadcast_event("anomaly", enriched)


def _to_df(readings: list[dict]) -> pd.DataFrame:
    if not readings:
        return pd.DataFrame(columns=SENSOR_VARS)
    df = pd.DataFrame(readings)
    for sv in SENSOR_VARS:
        if sv not in df.columns:
            df[sv] = float("nan")
    return df
