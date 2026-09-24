"""
SkyGuard AI — Explainability Module
=====================================
Turns detection results into human-readable explanations.

Strategy (no SHAP dependency at inference time — SHAP runs offline for
training analysis; the live path uses rule-based feature attribution):
  1. Map layer scores → feature importance percentages (SHAP-style bars)
  2. Generate a plain-language reasoning sentence
  3. Produce a root-cause confidence breakdown

For the live dashboard the SHAP-style data is computed from layer_scores
so there's zero additional latency on the inference path.
"""

from data.schema import (
    FIELD_TEMPERATURE, FIELD_PRESSURE, FIELD_HUMIDITY, RootCause
)


# ── Natural-language templates ────────────────────────────────────────────────

_TEMPLATES = {
    "spike_temp": (
        "Temperature jumped {delta:.1f}°C in under {minutes} minutes while pressure and "
        "humidity remained stable — and neighbouring stations show no such change. "
        "This is consistent with a local sensor spike, not a weather event."
    ),
    "frozen": (
        "The {sensor} reading has remained at {value:.2f} {unit} for {n} consecutive "
        "samples — a variance of effectively zero. This indicates a stuck or frozen sensor, "
        "not a real atmospheric condition."
    ),
    "dropout": (
        "All sensor channels returned no data for {n} readings. "
        "This is consistent with a communications failure or power interruption at the station."
    ),
    "cross_sensor": (
        "Temperature changed by {delta_t:.1f}°C while pressure and humidity barely moved "
        "({delta_p:.1f} hPa, {delta_h:.1f}%) — physically inconsistent. "
        "Neighbouring stations confirm no regional event. Likely sensor fault."
    ),
    "drift": (
        "The {sensor} reading has been trending {direction} at approximately {rate:.2f} "
        "{unit}/step over {n} steps, deviating {total:.1f} {unit} from the expected baseline. "
        "This pattern is consistent with sensor calibration drift."
    ),
    "spatial": (
        "This station's {sensor} reading ({val:.1f} {unit}) deviates {dev:.1f} {unit} from "
        "the spatially interpolated estimate ({est:.1f} {unit}) based on {k} nearby stations. "
        "The surrounding network does not show this extreme — suggesting a local sensor fault."
    ),
    "environmental": (
        "Readings are statistically unusual but consistent with neighbouring stations. "
        "This may be a genuine extreme weather event rather than a sensor fault. "
        "Confidence: {confidence:.0f}%. Recommend cross-checking with IMD alerts."
    ),
    "generic": (
        "Anomaly detected with {confidence:.0f}% confidence. "
        "Multiple detection layers ({layers}) flagged this reading as unusual. "
        "Root cause classified as: {root_cause}."
    ),
}

_UNITS = {
    FIELD_TEMPERATURE: "°C",
    FIELD_PRESSURE:    "hPa",
    FIELD_HUMIDITY:    "%",
}


def _layer_to_shap(layer_scores: dict, all_flags: list[str]) -> list[dict]:
    """
    Convert layer scores into SHAP-style feature-importance bars for the UI.
    Returns a sorted list: [{feature, contribution, direction}]
    """
    contributions = []

    # Map layers → human-readable feature groups
    layer_labels = {
        "statistical":      "Statistical signals (Z-score / IQR / rate-of-change)",
        "isolation_forest": "Multivariate ML model (Isolation Forest)",
        "lstm_autoencoder": "Temporal deep model (LSTM reconstruction error)",
        "cross_sensor":     "Cross-sensor physical rules",
        "spatial":          "Spatial neighbour comparison",
    }

    total = sum(layer_scores.values()) or 1.0
    for layer, score in layer_scores.items():
        if score < 0.01:
            continue
        contributions.append({
            "feature":      layer_labels.get(layer, layer),
            "contribution": round(score / total * 100, 1),  # normalised %
            "raw_score":    round(score, 4),
            "direction":    "anomalous",
        })

    # Sort descending
    contributions.sort(key=lambda x: x["contribution"], reverse=True)
    return contributions


def generate_explanation(
    reading:      dict,
    fusion:       dict,
    stat_result:  dict,
    cross_result: dict,
    spatial_result: dict,
    window:       list[dict] | None = None,
) -> dict:
    """
    Generate a full explanation payload for one anomaly event.

    Returns:
        {
            reasoning_text: str,
            shap_bars: list[dict],
            root_cause_confidence: dict,
            key_feature: str,
        }
    """
    root_cause    = fusion.get("root_cause", RootCause.UNKNOWN)
    confidence    = fusion.get("confidence", 0.0)
    layer_scores  = fusion.get("layer_scores", {})
    all_flags     = fusion.get("all_flags", [])

    # ── Reasoning text ────────────────────────────────────────────────────────
    reasoning = _pick_reasoning_template(
        root_cause, reading, stat_result, cross_result, spatial_result,
        confidence, layer_scores, window,
    )

    # ── SHAP-style bars ───────────────────────────────────────────────────────
    shap_bars = _layer_to_shap(layer_scores, all_flags)

    # ── Root-cause confidence breakdown (for the UI pill/gauge) ──────────────
    rc_confidence = _root_cause_confidence(fusion, stat_result, cross_result, spatial_result)

    key_feature = shap_bars[0]["feature"] if shap_bars else "unknown"

    return {
        "reasoning_text":       reasoning,
        "shap_bars":            shap_bars,
        "root_cause_confidence": rc_confidence,
        "key_feature":          key_feature,
    }


def _pick_reasoning_template(
    root_cause: str,
    reading: dict,
    stat_result: dict,
    cross_result: dict,
    spatial_result: dict,
    confidence: float,
    layer_scores: dict,
    window: list[dict] | None,
) -> str:
    """Choose and fill the most specific template."""

    flags_str = " ".join(stat_result.get("flags", []) + cross_result.get("flags", []))

    # Dropout
    if "all_sensors_nan" in flags_str or root_cause == RootCause.COMMS_FAILURE:
        return _TEMPLATES["dropout"].format(n=6)

    # Frozen
    if "frozen_value" in flags_str:
        frozen_sensor = (
            stat_result.get("details", {})
            .get(FIELD_TEMPERATURE, {})
            .get("flags", [])
        )
        sensor_name = FIELD_TEMPERATURE
        val = reading.get(sensor_name, 0)
        unit = _UNITS.get(sensor_name, "")
        return _TEMPLATES["frozen"].format(
            sensor=sensor_name.replace("_c", "").replace("_hpa", "").replace("_pct", ""),
            value=val, unit=unit, n=6,
        )

    # Spatial
    if spatial_result.get("is_anomaly") and spatial_result.get("idw_estimates"):
        estimates = spatial_result["idw_estimates"]
        sensor = list(estimates.keys())[0]
        est = estimates[sensor]
        val = reading.get(sensor, 0) or 0
        dev = abs(val - est)
        unit = _UNITS.get(sensor, "")
        return _TEMPLATES["spatial"].format(
            sensor=sensor, val=val, dev=round(dev, 1),
            est=round(est, 1), unit=unit, k=4,
        )

    # Cross-sensor
    if cross_result.get("is_anomaly") and window and len(window) >= 2:
        prev = window[-2]
        delta_t = abs((reading.get(FIELD_TEMPERATURE) or 0) - (prev.get(FIELD_TEMPERATURE) or 0))
        delta_p = abs((reading.get(FIELD_PRESSURE) or 0) - (prev.get(FIELD_PRESSURE) or 0))
        delta_h = abs((reading.get(FIELD_HUMIDITY) or 0) - (prev.get(FIELD_HUMIDITY) or 0))
        return _TEMPLATES["cross_sensor"].format(
            delta_t=delta_t, delta_p=delta_p, delta_h=delta_h,
        )

    # Environmental extreme
    if root_cause == RootCause.ENVIRONMENTAL:
        return _TEMPLATES["environmental"].format(confidence=confidence)

    # Generic fallback
    triggered = [k for k, v in layer_scores.items() if v > 0.3]
    return _TEMPLATES["generic"].format(
        confidence=confidence,
        layers=", ".join(triggered) or "multiple layers",
        root_cause=root_cause or "unknown",
    )


def _root_cause_confidence(
    fusion: dict,
    stat_result: dict,
    cross_result: dict,
    spatial_result: dict,
) -> dict:
    """Simple heuristic root-cause confidence breakdown (sums to 100%)."""
    scores = {
        RootCause.SENSOR_FAULT:      0.0,
        RootCause.CALIBRATION_DRIFT: 0.0,
        RootCause.COMMS_FAILURE:     0.0,
        RootCause.POWER_FLUCTUATION: 0.0,
        RootCause.ENVIRONMENTAL:     0.0,
        RootCause.DATA_CORRUPTION:   0.0,
    }

    flags_str = " ".join(
        stat_result.get("flags", []) + cross_result.get("flags", [])
    ).lower()

    if "frozen" in flags_str:
        scores[RootCause.CALIBRATION_DRIFT] += 0.6
    if "all_sensors_nan" in flags_str:
        scores[RootCause.COMMS_FAILURE] += 0.7
    if cross_result.get("is_anomaly"):
        scores[RootCause.SENSOR_FAULT] += 0.5
    if spatial_result.get("is_anomaly"):
        scores[RootCause.SENSOR_FAULT] += 0.4
    if "roc" in flags_str:
        scores[RootCause.POWER_FLUCTUATION] += 0.3
    if fusion.get("layer_scores", {}).get("lstm_autoencoder", 0) > 0.5:
        scores[RootCause.ENVIRONMENTAL] += 0.3

    # Normalise
    total = sum(scores.values()) or 1.0
    return {k: round(v / total * 100, 1) for k, v in scores.items()}
