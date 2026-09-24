"""
SkyGuard AI — Isolation Forest / One-Class SVM Layer
======================================================
Layer 2: multivariate ML outlier detection.
Trained on normal data, scores new readings without labels.

Wraps scikit-learn IsolationForest with:
  - Per-station model fitting on the bootstrap history window
  - Rolling re-fit every N readings (concept drift adaptation)
  - Score normalisation to [0, 1] range
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler
from sklearn.svm import OneClassSVM
from sklearn.pipeline import Pipeline

from data.schema import SENSOR_VARS, Severity

# Minimum readings required before the model is trusted
MIN_TRAIN_SAMPLES = 50
# Re-fit every this many new readings (rolling adaptation)
REFIT_EVERY = 100


class IsolationForestDetector:
    """
    Per-station Isolation Forest model.
    One instance per station_id, managed by the ensemble.
    """

    def __init__(self, station_id: str, contamination: float = 0.03):
        self.station_id   = station_id
        self.contamination = contamination
        self._pipe: Pipeline | None = None
        self._n_seen  = 0
        self._buffer: list[list[float]] = []

    def _build_pipe(self) -> Pipeline:
        return Pipeline([
            ("scaler", RobustScaler()),
            ("iforest", IsolationForest(
                n_estimators=100,
                contamination=self.contamination,
                random_state=42,
                n_jobs=-1,
            )),
        ])

    def fit(self, df: pd.DataFrame) -> None:
        """Fit on a window of normal-ish readings."""
        X = df[SENSOR_VARS].dropna().values
        if len(X) < MIN_TRAIN_SAMPLES:
            return
        self._pipe = self._build_pipe()
        self._pipe.fit(X)

    def score(self, reading: dict) -> dict:
        """
        Score one reading. Returns {score, is_anomaly, layer}.
        score is in [0, 1]; threshold at 0.5.
        """
        x = [reading.get(s) for s in SENSOR_VARS]
        if any(v is None for v in x):
            # Missing data → treat as anomalous
            return {"score": 0.8, "is_anomaly": True, "layer": "isolation_forest", "fitted": False}

        # Buffer for rolling re-fit
        self._buffer.append(x)
        self._n_seen += 1

        if self._pipe is None:
            # Not fitted yet — pass through, slight suspicion for unseen data
            return {"score": 0.0, "is_anomaly": False, "layer": "isolation_forest", "fitted": False}

        X = np.array([x])
        # decision_function returns negative for outliers (more negative = more anomalous)
        raw = self._pipe.decision_function(X)[0]
        # Normalise: IsolationForest scores typically in [-0.5, 0.5]
        # We flip so high score = anomalous
        score = float(np.clip(0.5 - raw, 0.0, 1.0))

        is_anomaly = score > 0.5

        # Rolling re-fit
        if self._n_seen % REFIT_EVERY == 0 and len(self._buffer) >= MIN_TRAIN_SAMPLES:
            buf_df = pd.DataFrame(self._buffer[-500:], columns=SENSOR_VARS)
            self.fit(buf_df)

        return {"score": round(score, 4), "is_anomaly": is_anomaly,
                "layer": "isolation_forest", "fitted": True}


# ── Global registry: one detector per station ────────────────────────────────

_registry: dict[str, IsolationForestDetector] = {}


def get_or_create(station_id: str) -> IsolationForestDetector:
    if station_id not in _registry:
        _registry[station_id] = IsolationForestDetector(station_id)
    return _registry[station_id]


def fit_all(history_df: pd.DataFrame) -> None:
    """Fit all station detectors from the bootstrap history DataFrame."""
    for sid, group in history_df.groupby("station_id"):
        det = get_or_create(str(sid))
        det.fit(group)
    print(f"[IsolationForest] Fitted {len(_registry)} station detectors.")


def score_reading(reading: dict) -> dict:
    sid = reading.get("station_id", "unknown")
    det = get_or_create(sid)
    return det.score(reading)
