"""
SkyGuard AI — Direct Real Dataset Downloader
=============================================
Quickly downloads popular real-world weather datasets (such as the Max Planck
Jena Climate Dataset) directly into the data/ folder with zero manual unzipping.

Usage:
    python -m data.download_dataset --dataset jena
"""

import argparse
import io
import sys
import zipfile
from pathlib import Path
import urllib.request
import pandas as pd

DATASETS = {
    "jena": {
        "name": "Max Planck Jena Climate Dataset (2009-2016)",
        "url": "https://storage.googleapis.com/tensorflow/tf-keras-datasets/jena_climate_2009_2016.csv.zip",
        "csv_name": "jena_climate_2009_2016.csv",
        "description": "420,000+ real 10-minute meteorological observations (Temp, Pressure, Humidity, Wind).",
    }
}


def download_jena(target_dir: Path) -> Path:
    info = DATASETS["jena"]
    out_csv = target_dir / info["csv_name"]

    if out_csv.exists():
        print(f"[download] Dataset already exists at: {out_csv}")
        return out_csv

    print("=" * 65)
    print(f"  Downloading: {info['name']}")
    print(f"  Source: {info['url']}")
    print("=" * 65)

    print("[download] Fetching zip archive (~13.5 MB)...")
    req = urllib.request.Request(
        info["url"],
        headers={"User-Agent": "Mozilla/5.0 (SkyGuard-AI Dataset Downloader)"}
    )
    with urllib.request.urlopen(req) as resp:
        content = resp.read()

    print("[download] Extracting CSV to data/ folder...")
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        z.extract(info["csv_name"], path=target_dir)

    print(f"[OK] Downloaded and extracted: {out_csv}")
    print(f"  File size: {out_csv.stat().st_size / (1024 * 1024):.1f} MB")

    # Quick inspection
    df_head = pd.read_csv(out_csv, nrows=5)
    print("\nColumns detected in dataset:")
    for col in df_head.columns:
        print(f"  - {col}")

    return out_csv


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download real meteorological datasets")
    parser.add_argument("--dataset", choices=["jena"], default="jena", help="Dataset identifier")
    args = parser.parse_args()

    data_dir = Path(__file__).parent
    if args.dataset == "jena":
        csv_path = download_jena(data_dir)
        print("\nNext step: Normalize and train on this dataset with:")
        print(f"  python -m data.ingest_real_dataset --input {csv_path} --col-temp \"T (degC)\" --col-pressure \"p (mbar)\" --col-humidity \"rh (%)\"")
        print("  python ml/train.py --csv data/generated/real_normalized.csv --epochs 20")
