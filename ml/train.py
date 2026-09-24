"""
SkyGuard AI — Model Training Script (Real & Synthetic Data)
============================================================
Trains the LSTM-Autoencoder and calibrates Isolation Forest anomaly detectors
on either:
  1. Real AWS historical weather data (CSV from Open-Meteo, IMD, Kaggle, NOAA)
  2. Live fetched real weather data from Open-Meteo Archive API
  3. Calibrated synthetic baseline data

Saves checkpoint to ml/models/lstm_ae.pt including:
  - Model state dict
  - Normaliser mean/std
  - Calibrated anomaly threshold (95th percentile reconstruction error)
  - Training metrics and source metadata

Usage:
    # 1. Train on real fetched weather data (automatic download for Indian AWS):
    python ml/train.py --fetch-real --days 60 --epochs 25

    # 2. Train on an external real CSV dataset:
    python ml/train.py --csv data/generated/real_aws_data.csv --epochs 25

    # 3. Train on synthetic baseline:
    python ml/train.py --hours 72 --epochs 20
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

# Add repo root to path for local imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from data.schema import SENSOR_VARS, FIELD_STATION_ID
from ml.lstm_autoencoder import (
    LSTMAutoencoder, SensorNormaliser, MODEL_DIR, MODEL_PATH,
    SEQUENCE_LEN, INPUT_SIZE,
)
from ml.isolation_forest import fit_all as if_fit_all

BATCH_SIZE    = 64
LEARNING_RATE = 1e-3


def make_sequences_by_station(df: pd.DataFrame, norm: SensorNormaliser, seq_len: int) -> np.ndarray:
    """
    Extract sliding sequence windows per station.
    Ensures time sequences never jump across different stations.
    """
    seqs = []
    station_col = FIELD_STATION_ID if FIELD_STATION_ID in df.columns else None

    if station_col and df[station_col].nunique() > 1:
        for sid, group in df.groupby(station_col):
            raw_vals = group[SENSOR_VARS].dropna().values.astype(np.float32)
            if len(raw_vals) <= seq_len:
                continue
            norm_vals = norm.transform(raw_vals)
            for i in range(len(norm_vals) - seq_len):
                seqs.append(norm_vals[i : i + seq_len])
    else:
        raw_vals = df[SENSOR_VARS].dropna().values.astype(np.float32)
        norm_vals = norm.transform(raw_vals)
        for i in range(len(norm_vals) - seq_len):
            seqs.append(norm_vals[i : i + seq_len])

    return np.array(seqs, dtype=np.float32)


def train_models(
    csv_path: Optional[str] = None,
    fetch_real: bool = False,
    days: int = 30,
    hours: int = 48,
    epochs: int = 20,
    device_str: str = "cpu",
) -> None:
    device = torch.device(device_str)

    print("=" * 65)
    print("  SkyGuard AI — Model Training Pipeline")
    print("=" * 65)

    # ── 1. Acquire Dataset ─────────────────────────────────────────────────
    if csv_path:
        csv_file = Path(csv_path)
        if not csv_file.exists():
            raise FileNotFoundError(f"Specified CSV does not exist: {csv_file}")
        print(f"[data] Loading real dataset from CSV: {csv_file}...")
        df = pd.read_csv(csv_file)
        data_source = f"csv:{csv_file.name}"
    elif fetch_real:
        from data.fetch_real_weather import fetch_all_real_data
        print(f"[data] Fetching real meteorological observations ({days} days)...")
        df = fetch_all_real_data(num_stations=20, days=days)
        data_source = f"open-meteo-real:{days}d"
    else:
        from data.synthetic_data import generate_all_stations
        print(f"[data] Generating {hours}h of synthetic baseline weather data...")
        df = generate_all_stations(hours=hours)
        data_source = f"synthetic:{hours}h"

    # Validate columns
    missing_vars = [v for v in SENSOR_VARS if v not in df.columns]
    if missing_vars:
        raise ValueError(f"Dataset missing required sensor columns: {missing_vars}")

    df = df.dropna(subset=SENSOR_VARS)
    print(f"[data] Total valid readings: {len(df):,} across {df[FIELD_STATION_ID].nunique() if FIELD_STATION_ID in df.columns else 1} station(s)")

    # ── 2. Fit Normaliser & Build Sequences ────────────────────────────────
    X_raw = df[SENSOR_VARS].values.astype(np.float32)
    norm = SensorNormaliser()
    norm.fit(X_raw)

    seqs = make_sequences_by_station(df, norm, SEQUENCE_LEN)
    print(f"[data] Formed {len(seqs):,} sequences of window length {SEQUENCE_LEN} (dim={INPUT_SIZE})")

    if len(seqs) < 100:
        raise ValueError("Not enough data points to train LSTM model. Provide more historical records.")

    # Shuffle sequences and split 85/15 train/val
    np.random.seed(42)
    indices = np.arange(len(seqs))
    np.random.shuffle(indices)
    shuffled_seqs = seqs[indices]

    split_idx = int(len(shuffled_seqs) * 0.85)
    X_tr  = torch.tensor(shuffled_seqs[:split_idx])
    X_val = torch.tensor(shuffled_seqs[split_idx:])

    tr_loader  = DataLoader(TensorDataset(X_tr),  batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(TensorDataset(X_val), batch_size=BATCH_SIZE)

    # ── 3. Train LSTM-Autoencoder ──────────────────────────────────────────
    print(f"[train] Training LSTM-Autoencoder on {device_str.upper()} ({epochs} epochs, batch={BATCH_SIZE})...")
    model = LSTMAutoencoder().to(device)
    optimiser = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-5)
    criterion = nn.MSELoss()

    best_val_loss = float("inf")
    best_state    = None

    for epoch in range(1, epochs + 1):
        model.train()
        tr_loss = 0.0
        for (batch,) in tr_loader:
            batch = batch.to(device)
            optimiser.zero_grad()
            recon = model(batch)
            loss  = criterion(recon, batch)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimiser.step()
            tr_loss += loss.item() * len(batch)
        tr_loss /= len(X_tr)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for (batch,) in val_loader:
                batch = batch.to(device)
                recon = model(batch)
                val_loss += criterion(recon, batch).item() * len(batch)
        val_loss /= len(X_val)

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = {k: v.cpu() for k, v in model.state_dict().items()}
            marker = " [best]"
        else:
            marker = ""

        print(f"  Epoch {epoch:02d}/{epochs:02d} | Train MSE: {tr_loss:.6f} | Val MSE: {val_loss:.6f}{marker}")

    # ── 4. Calibrate Anomaly Threshold ─────────────────────────────────────
    model.load_state_dict(best_state)
    model.eval()
    errors = []
    with torch.no_grad():
        for (batch,) in val_loader:
            e = model.reconstruction_error(batch.to(device)).cpu().numpy()
            errors.extend(e.tolist())

    threshold = float(np.percentile(errors, 95))
    print(f"[calibrate] Baseline 95th-percentile reconstruction threshold: {threshold:.6f}")

    # ── 5. Fit Isolation Forest Baseline ───────────────────────────────────
    print("[train] Fitting Isolation Forest models across all station baselines...")
    try:
        if_fit_all(df)
        print("  [OK] Isolation Forest models fitted for all stations.")
    except Exception as e:
        print(f"  [WARN] Isolation Forest fitting warning: {e}")

    # ── 6. Save Model Checkpoint ───────────────────────────────────────────
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "model_state": best_state,
        "normaliser":  norm.state_dict(),
        "threshold":   threshold,
        "val_loss":    best_val_loss,
        "epochs":      epochs,
        "data_source": data_source,
        "samples":     len(df),
        "sequences":   len(seqs),
    }
    torch.save(checkpoint, MODEL_PATH)
    print("=" * 65)
    print(f"[OK] Model successfully saved to: {MODEL_PATH}")
    print(f"  Data Source:       {data_source}")
    print(f"  Best Val Loss:     {best_val_loss:.6f}")
    print(f"  Anomaly Threshold: {threshold:.6f}")
    print("=" * 65)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train SkyGuard AI models on real or synthetic datasets")
    parser.add_argument("--csv", type=str, default=None, help="Path to cleaned real weather CSV file")
    parser.add_argument("--fetch-real", action="store_true", help="Automatically fetch real historical weather from Open-Meteo")
    parser.add_argument("--days", type=int, default=30, help="Days of real weather to fetch if --fetch-real is used")
    parser.add_argument("--hours", type=int, default=48, help="Hours of synthetic baseline data if not using real data")
    parser.add_argument("--epochs", type=int, default=20, help="Number of training epochs")
    parser.add_argument("--device", type=str, default="cpu", help="Compute device: 'cpu' or 'cuda'")
    args = parser.parse_args()

    train_models(
        csv_path=args.csv,
        fetch_real=args.fetch_real,
        days=args.days,
        hours=args.hours,
        epochs=args.epochs,
        device_str=args.device,
    )
