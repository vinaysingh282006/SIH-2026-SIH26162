"""
SkyGuard AI — Ensemble Fusion + Confidence Calibration
========================================================
Combines scores from all 4 detection layers into a single:
  - unified anomaly probability (0–1)
  - calibrated confidence (0–100%)
  - severity level (Low / Medium / High / Critical)
  - root-cause classification

Layer weights are tuned to reflect reliability:
  Statistical  → fast, reliable signal
  IForest      → good multivariate baseline
  LSTM-AE      → deep temporal context (when fitted)
  Cross-sensor → high-specificity physical rules
  Spatial      → strong signal when neighbours disagree
"""

from data.schema import Severity, RootCause

# ── Layer weights (sum ≤ 1.0, LSTM weight activated only when fitted) ─────────
LAYER_WEIGHTS = {
    "statistical":     0.35,
    "isolation_forest": 0.25,
    "lstm_autoencoder": 0.20,
    "cross_sensor":    0.15,
    "spatial":         0.05,
}


def _severity_from_score(score: float) -> str | None:
    if score >= 0.85:
        return Severity.CRITICAL
    if score >= 0.65:
        return Severity.HIGH
    if score >= 0.45:
        return Severity.MEDIUM
    if score >= 0.30:
        return Severity.LOW
    return None


def _infer_root_cause(
    stat_result: dict,
    cross_result: dict,
    spatial_result: dict,
    if_result: dict,
    lstm_result: dict,
) -> str:
    """
    Heuristic root-cause classification based on which layers triggered
    and what flags they raised.
    """
    flags = (
        stat_result.get("flags", [])
        + cross_result.get("flags", [])
        + spatial_result.get("flags", [])
    )
    flags_str = " ".join(flags).lower()

    # Spatial neighbours agree → local sensor fault
    if spatial_result.get("is_anomaly"):
        if any("spatial_dev" in f for f in spatial_result.get("flags", [])):
            return RootCause.SENSOR_FAULT

    # Frozen value → calibration/mechanical fault
    if "frozen_value" in flags_str:
        return RootCause.CALIBRATION_DRIFT

    # All sensors NaN → communications failure
    if "all_sensors_nan" in flags_str or "missing_values" in flags_str:
        return RootCause.COMMS_FAILURE

    # Cross-sensor inconsistency without spatial agreement → sensor fault
    if cross_result.get("is_anomaly"):
        return RootCause.SENSOR_FAULT

    # Large Z-score / rate-of-change → could be spike (power or sensor)
    if "roc" in flags_str:
        return RootCause.POWER_FLUCTUATION

    if "z_score" in flags_str or "iqr_fence" in flags_str:
        return RootCause.SENSOR_FAULT

    # ML layer fired alone → could be environmental extreme
    if if_result.get("is_anomaly") or lstm_result.get("is_anomaly"):
        return RootCause.ENVIRONMENTAL

    return RootCause.UNKNOWN


def fuse(
    stat_result:  dict,
    if_result:    dict,
    lstm_result:  dict,
    cross_result: dict,
    spatial_result: dict,
) -> dict:
    """
    Weighted fusion of all layer scores.

    Returns:
        {
            unified_score, confidence, is_anomaly,
            severity, root_cause,
            layer_scores, all_flags
        }
    """
    scores = {
        "statistical":      stat_result.get("score", 0.0),
        "isolation_forest": if_result.get("score", 0.0),
        "lstm_autoencoder": lstm_result.get("score", 0.0),
        "cross_sensor":     cross_result.get("score", 0.0),
        "spatial":          spatial_result.get("score", 0.0),
    }

    # Disable LSTM weight if not fitted
    weights = dict(LAYER_WEIGHTS)
    if not lstm_result.get("fitted", False):
        # Redistribute LSTM weight to statistical
        weights["statistical"]     += weights["lstm_autoencoder"]
        weights["lstm_autoencoder"] = 0.0

    unified = sum(weights[k] * scores[k] for k in scores)

    # Platt-like calibration: sigmoid rescaling
    import math
    confidence_raw = 1.0 / (1.0 + math.exp(-8.0 * (unified - 0.5)))
    confidence = round(confidence_raw * 100, 1)  # 0–100%

    is_anomaly = unified >= 0.30
    severity   = _severity_from_score(unified) if is_anomaly else None

    root_cause = _infer_root_cause(stat_result, cross_result, spatial_result,
                                   if_result, lstm_result)
    if not is_anomaly:
        root_cause = None

    all_flags = (
        stat_result.get("flags", [])
        + cross_result.get("flags", [])
        + spatial_result.get("flags", [])
    )

    return {
        "unified_score": round(unified, 4),
        "confidence":    confidence,
        "is_anomaly":    is_anomaly,
        "severity":      severity,
        "root_cause":    root_cause,
        "layer_scores":  {k: round(v, 4) for k, v in scores.items()},
        "all_flags":     all_flags,
    }
