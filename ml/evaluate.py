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
from ml.lstm_autoencoder import load_model, score_reading as lstm_score, reset_buffers
from ml.cross_sensor import detect_cross_sensor
from ml.spatial_consistency import detect_spatial

EVAL_PATH = Path(__file__).parent / "models" / "eval_results.json"
DETECTION_THRESHOLD = 0.45   # unified_score above this → predicted anomaly


def _run_pipeline(reading: dict, window: list[dict], neighbours: list[dict]) -> dict:
    """Run the full detection ensemble and return the fusion result."""
    combined = list(window) + [reading] if window else [reading]
    df_win = pd.DataFrame(combined)
    for sv in SENSOR_VARS:
        if sv not in df_win.columns:
            df_win[sv] = [r.get(sv) for r in combined]

    # Pre-populate LSTM buffer with window context
    reset_buffers()
    if window:
        for w in window[-11:]:
            lstm_score(w)

    stat    = detect_statistical_all_sensors(df_win)
    iforest = if_score(reading)
    lstm    = lstm_score(reading)
    cross   = detect_cross_sensor(combined[-6:] if len(combined) >= 6 else combined)
    spatial = detect_spatial(reading, neighbours)
    return fuse(stat, iforest, lstm, cross, spatial)


def evaluate(
    hours: int = 24,
    injections_per_type: int = 10,
    seed: int = 42,
) -> dict:
    rng = np.random.default_rng(seed)

    print("[eval] Generating normal baseline data...")
    df_normal = generate_all_stations(hours=hours)

    print("[eval] Fitting Isolation Forest on normal data...")
    if_fit_all(df_normal)

    print("[eval] Loading LSTM-AE checkpoint (if available)...")
    load_model()

    station_ids = df_normal["station_id"].unique().tolist()

    results_by_type: dict[str, dict] = {t: {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
                                         for t in ALL_ANOMALY_TYPES}
    results_by_type["_normal"] = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}

    # ── Test normal readings (expect no detection) ────────────────────────────
    print("[eval] Testing normal readings...")
    for _ in range(100):
        sid = rng.choice(station_ids)
        station_df = df_normal[df_normal["station_id"] == sid].copy().reset_index(drop=True)
        if len(station_df) < 30:
            continue
        t = rng.integers(25, len(station_df) - 1)
        reading = station_df.iloc[t].to_dict()
        reading["timestamp"] = str(reading.get("timestamp", ""))
        window = station_df.iloc[max(0, t - 25):t].to_dict("records")
        neighbours_df = df_normal[(df_normal["station_id"] != sid) & (df_normal["timestamp"] == reading["timestamp"])].head(10)
        if neighbours_df.empty:
            neighbours_df = df_normal[df_normal["station_id"] != sid].tail(10)
        neighbours = neighbours_df.to_dict("records")

        fusion = _run_pipeline(reading, window, neighbours)
        if fusion["is_anomaly"]:
            results_by_type["_normal"]["fp"] += 1
        else:
            results_by_type["_normal"]["tn"] += 1

    # ── Test each anomaly type ────────────────────────────────────────────────
    for anomaly_type in ALL_ANOMALY_TYPES:
        print(f"[eval] Testing {anomaly_type} x {injections_per_type}...")
        for _ in range(injections_per_type):
            sid = rng.choice(station_ids)
            station_df = df_normal[df_normal["station_id"] == sid].copy().reset_index(drop=True)
            if len(station_df) < 50:
                continue
            try:
                injected_df, record = inject_by_type(station_df, sid, anomaly_type, rng=rng)
            except Exception:
                continue

            # Pick test reading
            # For frozen or drift, test near the end of the anomaly so window captures the cumulative pattern
            if anomaly_type in ("frozen", "drift"):
                test_idx = min(record.end_idx, len(injected_df) - 1)
            else:
                test_idx = (record.start_idx + record.end_idx) // 2

            test_row = injected_df.iloc[test_idx].to_dict()
            test_row["timestamp"] = str(test_row.get("timestamp", ""))

            # History window leading up to test reading
            window_rows = injected_df.iloc[max(0, test_idx - 25):test_idx].to_dict("records")

            # Contemporaneous neighbours from other stations
            neighbours_df = df_normal[(df_normal["station_id"] != sid) & (df_normal["timestamp"] == test_row["timestamp"])].head(10)
            if neighbours_df.empty:
                neighbours_df = df_normal[df_normal["station_id"] != sid].tail(10)
            neighbours = neighbours_df.to_dict("records")

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
    print(f"[eval] Saved -> {EVAL_PATH}")

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SkyGuard AI evaluation harness")
    parser.add_argument("--hours",               type=int, default=24)
    parser.add_argument("--injections-per-type", type=int, default=10, dest="injections")
    args = parser.parse_args()
    evaluate(args.hours, args.injections)
