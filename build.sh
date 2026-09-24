#!/usr/bin/env bash
# SkyGuard AI — Render Build Script
# Exit immediately if a command exits with a non-zero status
set -e

echo "=================================================="
echo "  SkyGuard AI — Production Build on Render"
echo "=================================================="

# 1. Build React/Vite Frontend
echo ">>> [1/3] Building Frontend SPA..."
cd frontend
npm install
npm run build
cd ..

# 2. Install Python Dependencies
echo ">>> [2/3] Installing Python Dependencies..."
python -m pip install --upgrade pip
# Install CPU-optimized PyTorch to minimize disk space and speed up install on Render
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r backend/requirements.txt

# 3. Ensure Trained ML Model Weights Exist
echo ">>> [3/3] Checking ML Model Checkpoints..."
if [ ! -f "ml/models/lstm_ae.pt" ]; then
  echo "No pre-existing model found. Training initial baseline model..."
  python ml/train.py --hours 24 --epochs 8
else
  echo "Found pre-trained model checkpoint at ml/models/lstm_ae.pt."
fi

echo "=================================================="
echo "✓ SkyGuard AI Build Completed Successfully!"
echo "=================================================="
