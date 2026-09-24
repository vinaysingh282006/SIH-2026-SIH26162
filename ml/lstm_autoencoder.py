"""
SkyGuard AI — LSTM Autoencoder (PyTorch)
==========================================
Layer 3: Deep temporal anomaly detection via reconstruction error.

Architecture:
  Input  → LSTM encoder → bottleneck → LSTM decoder → reconstruction
  Anomaly score = MSE(input, reconstruction) normalised by training baseline.

Inference is fast (CPU-only for demo); training produces ml/models/lstm_ae.pt.
"""

import math
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import torch.nn as nn

from data.schema import SENSOR_VARS

MODEL_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODEL_DIR / "lstm_ae.pt"

SEQUENCE_LEN   = 12   # 12 steps = 1 hour of history at 5-min intervals
HIDDEN_SIZE    = 32
NUM_LAYERS     = 1
INPUT_SIZE     = len(SENSOR_VARS)   # 3


# ── Model definition ──────────────────────────────────────────────────────────

class LSTMAutoencoder(nn.Module):
    """LSTM Autoencoder for multivariate time-series reconstruction."""

    def __init__(
        self,
        input_size:  int = INPUT_SIZE,
        hidden_size: int = HIDDEN_SIZE,
        num_layers:  int = NUM_LAYERS,
    ):
        super().__init__()
        self.input_size  = input_size
        self.hidden_size = hidden_size
        self.num_layers  = num_layers

        # Encoder
        self.encoder = nn.LSTM(
            input_size,
            hidden_size,
            num_layers=num_layers,
            batch_first=True,
        )

        # Bottleneck projection
        self.bottleneck = nn.Linear(hidden_size, hidden_size // 2)
        self.expand     = nn.Linear(hidden_size // 2, hidden_size)

        # Decoder
        self.decoder = nn.LSTM(
            hidden_size,
            hidden_size,
            num_layers=num_layers,
            batch_first=True,
        )
        self.output_layer = nn.Linear(hidden_size, input_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x shape: (batch, seq_len, input_size) → reconstructed same shape."""
        # Encode
        _, (h_n, c_n) = self.encoder(x)
        latent = torch.relu(self.bottleneck(h_n[-1]))           # (batch, hidden//2)
        expanded = self.expand(latent).unsqueeze(0)             # (1, batch, hidden)

        # Decode: repeat bottleneck representation across time steps
        dec_input = expanded.permute(1, 0, 2).repeat(1, x.size(1), 1)
        dec_out, _ = self.decoder(dec_input, (expanded, torch.zeros_like(expanded)))
        return self.output_layer(dec_out)                       # (batch, seq_len, input_size)

    def reconstruction_error(self, x: torch.Tensor) -> torch.Tensor:
        """Returns MSE per sample: shape (batch,)."""
        with torch.no_grad():
            recon = self.forward(x)
            return ((x - recon) ** 2).mean(dim=[1, 2])


# ── Normaliser (per sensor, fitted on training data) ─────────────────────────

class SensorNormaliser:
    """Z-score normaliser, fitted on training sequences."""

    def __init__(self):
        self.mean: Optional[np.ndarray] = None
        self.std:  Optional[np.ndarray] = None

    def fit(self, X: np.ndarray) -> "SensorNormaliser":
        """X shape: (N, input_size)."""
        self.mean = X.mean(axis=0)
        self.std  = X.std(axis=0) + 1e-8
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        return (X - self.mean) / self.std

    def state_dict(self) -> dict:
        return {"mean": self.mean.tolist(), "std": self.std.tolist()}

    def load_state_dict(self, d: dict) -> None:
        self.mean = np.array(d["mean"])
        self.std  = np.array(d["std"])


# ── Sliding-window buffer (per station) ──────────────────────────────────────

class StationBuffer:
    """Maintains the last SEQUENCE_LEN readings for one station."""

    def __init__(self):
        self._buf: list[list[float]] = []

    def push(self, vals: list[float]) -> None:
        self._buf.append(vals)
        if len(self._buf) > SEQUENCE_LEN:
            self._buf.pop(0)

    def ready(self) -> bool:
        return len(self._buf) == SEQUENCE_LEN

    def to_tensor(self) -> torch.Tensor:
        return torch.tensor(self._buf, dtype=torch.float32).unsqueeze(0)  # (1, seq, 3)


# ── Global state ──────────────────────────────────────────────────────────────

_model:      Optional[LSTMAutoencoder] = None
_normaliser: Optional[SensorNormaliser] = None
_threshold:  float = 1.0       # MSE threshold (calibrated after training)
_buffers:    dict[str, StationBuffer] = {}

# The 95th-percentile reconstruction error on normal training data.
# Readings above this are flagged. Loaded from checkpoint.
_error_baseline: float = 1.0


def load_model(path: Path = MODEL_PATH) -> None:
    """Load the trained model and normaliser from disk."""
    global _model, _normaliser, _threshold, _error_baseline
    if not path.exists():
        print(f"[LSTM-AE] No checkpoint at {path} — deep layer disabled until train.py is run.")
        return
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    _model = LSTMAutoencoder()
    _model.load_state_dict(ckpt["model_state"])
    _model.eval()
    _normaliser = SensorNormaliser()
    _normaliser.load_state_dict(ckpt["normaliser"])
    _error_baseline = ckpt.get("threshold", 1.0)
    print(f"[LSTM-AE] Loaded model from {path}, threshold={_error_baseline:.4f}")


def reset_buffers() -> None:
    """Clear all rolling station buffers."""
    _buffers.clear()


def score_reading(reading: dict) -> dict:
    """
    Score one reading with the LSTM-AE.
    Returns {score, is_anomaly, layer, fitted}.
    """
    sid = reading.get("station_id", "unknown")
    if sid not in _buffers:
        _buffers[sid] = StationBuffer()

    buf = _buffers[sid]
    vals = [reading.get(s) for s in SENSOR_VARS]
    if any(v is None or (isinstance(v, float) and (math.isnan(v) or np.isnan(v))) for v in vals):
        return {"score": 0.85, "is_anomaly": True, "layer": "lstm_autoencoder", "fitted": False}

    buf.push(vals)

    if _model is None or _normaliser is None or not buf.ready():
        return {"score": 0.0, "is_anomaly": False, "layer": "lstm_autoencoder", "fitted": False}

    seq = buf.to_tensor().numpy().reshape(-1, INPUT_SIZE)
    seq_norm = _normaliser.transform(seq).reshape(1, SEQUENCE_LEN, INPUT_SIZE)
    x = torch.tensor(seq_norm, dtype=torch.float32)

    mse = float(_model.reconstruction_error(x)[0])
    # Normalise to [0,1] using the calibrated baseline
    score = float(np.clip(mse / (_error_baseline * 3 + 1e-8), 0.0, 1.0))

    return {
        "score":      round(score, 4),
        "is_anomaly": score > 0.5,
        "mse":        round(mse, 6),
        "layer":      "lstm_autoencoder",
        "fitted":     True,
    }
