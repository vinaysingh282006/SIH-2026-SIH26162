"""
SkyGuard AI — Evaluation Harness
==================================
Runs the full detection ensemble against synthetic anomaly-injected data
and reports precision / recall / F1 per anomaly type.

Results are:
  - Printed to stdout (for terminal demo)
  - Written to ml/models/eval_results.json (read by the backend for the
    Analytics screen's "Model Accuracy" tiles)

Usage (from repo root):
    python ml/evaluate.py
    python ml/evaluate.py --hours 24 --injections-per-type 10
"""

import argparse
import json
import sys
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
import numpy as np

from data.synthetic_data import generate_all_stations
from data.anomaly_injector import inject_by_type
from data.schema import ALL_ANOMALY_TYPES, SENSOR_VARS
from ml.statistical_detector import detect_statistical_all_sensors
from ml.isolation_forest import fit_all as if_fit_all, score_reading as if_score
from ml.ensemble_fusion import fuse
from ml.lstm_autoencoder import load_model, score_reading as lstm_score
from ml.cross_sensor import detect_cross_sensor
from ml.spatial_consistency import detect_spatial

EVAL_PATH = Path(__file__).parent / "models" / "eval_results.json"
DETECTION_THRESHOLD = 0.30   # unified_score above this → predicted anomaly


def _run_pipeline(reading: dict, window: list[dict], neighbours: list[dict]) -> dict:
    """Run the full detection ensemble and return the fusion result."""
    df_win = pd.DataFrame(window) if window else pd.DataFrame([reading])
    if SENSOR_VARS[0] not in df_win.columns:
        for sv in SENSOR_VARS:
            df_win[sv] = [r.get(sv) for r in window] if window else [reading.get(sv)]

    stat   = detect_statistical_all_sensors(df_win)
    iforest = if_score(reading)
    lstm   = lstm_score(reading)
    cross  = detect_cross_sensor(window[-6:] if len(window) >= 6 else window)
    spatial = detect_spatial(reading, neighbours)
    return fuse(stat, iforest, lstm, cross, spatial)


def evaluate(
    hours: int = 24,
    injections_per_type: int = 10,
    seed: int = 42,
) -> dict:
    rng = np.random.default_rng(seed)

    print("[eval] Generating normal baseline data…")
    df_normal = generate_all_stations(hours=hours)

    print("[eval] Fitting Isolation Forest on normal data…")
    if_fit_all(df_normal)

    print("[eval] Loading LSTM-AE checkpoint (if available)…")
    load_model()

    station_ids = df_normal["station_id"].unique().tolist()

    results_by_type: dict[str, dict] = {t: {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
                                         for t in ALL_ANOMALY_TYPES}
    results_by_type["_normal"] = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}

    # ── Test normal readings (expect no detection) ────────────────────────────
    print("[eval] Testing normal readings…")
    normal_sample = df_normal.sample(200, random_state=42)
    for _, row in normal_sample.iterrows():
        reading = row.to_dict()
        reading["timestamp"] = str(reading.get("timestamp", ""))
        neighbours = df_normal[df_normal["station_id"] != row["station_id"]].tail(20).to_dict("records")
        window = df_normal[df_normal["station_id"] == row["station_id"]].tail(20).to_dict("records")
        fusion = _run_pipeline(reading, window, neighbours)
        if fusion["is_anomaly"]:
            results_by_type["_normal"]["fp"] += 1
        else:
            results_by_type["_normal"]["tn"] += 1

    # ── Test each anomaly type ────────────────────────────────────────────────
    for anomaly_type in ALL_ANOMALY_TYPES:
        print(f"[eval] Testing {anomaly_type} × {injections_per_type}…")
        for _ in range(injections_per_type):
            sid = rng.choice(station_ids)
            station_df = df_normal[df_normal["station_id"] == sid].copy()
            if len(station_df) < 50:
                continue
            try:
                injected_df, record = inject_by_type(station_df, sid, anomaly_type, rng=rng)
            except Exception as e:
                continue

            # Pick a reading from the injected window
            target_rows = injected_df.iloc[record.start_idx:record.end_idx + 1]
            if target_rows.empty:
                continue
            test_row = target_rows.iloc[len(target_rows) // 2].to_dict()
            test_row["timestamp"] = str(test_row.get("timestamp", ""))

            neighbours = df_normal[df_normal["station_id"] != sid].tail(20).to_dict("records")
            window_rows = injected_df[injected_df["station_id"] == sid].iloc[:record.start_idx].tail(20).to_dict("records")

            fusion = _run_pipeline(test_row, window_rows, neighbours)

            if fusion["is_anomaly"]:
                results_by_type[anomaly_type]["tp"] += 1
            else:
                results_by_type[anomaly_type]["fn"] += 1

    # ── Compute metrics ───────────────────────────────────────────────────────
    metrics = {}
    for atype, counts in results_by_type.items():
        tp, fp, fn = counts["tp"], counts["fp"], counts["fn"]
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1        = (2 * precision * recall / (precision + recall)
                     if (precision + recall) > 0 else 0.0)
        metrics[atype] = {
            "precision": round(precision, 3),
            "recall":    round(recall, 3),
            "f1":        round(f1, 3),
            **counts,
        }

    # Overall (macro average over anomaly types only, not _normal)
    anomaly_metrics = [v for k, v in metrics.items() if not k.startswith("_")]
    macro_f1        = sum(m["f1"] for m in anomaly_metrics) / len(anomaly_metrics)
    macro_precision = sum(m["precision"] for m in anomaly_metrics) / len(anomaly_metrics)
    macro_recall    = sum(m["recall"] for m in anomaly_metrics) / len(anomaly_metrics)
    false_positive_rate = metrics["_normal"]["fp"] / (metrics["_normal"]["fp"] + metrics["_normal"]["tn"] + 1)

    summary = {
        "macro_f1":           round(macro_f1, 3),
        "macro_precision":    round(macro_precision, 3),
        "macro_recall":       round(macro_recall, 3),
        "false_positive_rate": round(false_positive_rate, 3),
        "per_type":           {k: v for k, v in metrics.items()},
    }

    # ── Print ─────────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  SkyGuard AI — Detection Evaluation Results")
    print("=" * 60)
    print(f"  Macro F1:           {summary['macro_f1']:.3f}")
    print(f"  Macro Precision:    {summary['macro_precision']:.3f}")
    print(f"  Macro Recall:       {summary['macro_recall']:.3f}")
    print(f"  False Positive Rate:{summary['false_positive_rate']:.3f}")
    print("-" * 60)
    for atype, m in summary["per_type"].items():
        if atype.startswith("_"):
            continue
        print(f"  {atype:<20} P={m['precision']:.2f}  R={m['recall']:.2f}  F1={m['f1']:.2f}")
    print("=" * 60 + "\n")

    # ── Save for backend / Analytics screen ───────────────────────────────────
    EVAL_PATH.parent.mkdir(exist_ok=True)
    with open(EVAL_PATH, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"[eval] Saved → {EVAL_PATH}")

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SkyGuard AI evaluation harness")
    parser.add_argument("--hours",               type=int, default=24)
    parser.add_argument("--injections-per-type", type=int, default=10, dest="injections")
    args = parser.parse_args()
    evaluate(args.hours, args.injections)
