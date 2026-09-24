# SkyGuard AI — Real Dataset Training & Render Deployment Guide

This guide provides end-to-end instructions for:
1. **Training SkyGuard AI's Machine Learning models on real meteorological datasets** (Open-Meteo, IMD MOSDAC, Kaggle, NOAA, Jena Climate).
2. **Deploying the full-stack system to Render.com** (with WebSockets, live telemetry, and React SPA) in minutes.

---

## Table of Contents
- [Part 1: Training on Real Datasets](#part-1-training-on-real-datasets)
  - [Option A: Automatic Real Data Fetcher (Instant 1-Command)](#option-a-automatic-real-data-fetcher-instant-1-command)
  - [Option B: Using External CSV Datasets (Kaggle / Jena / NOAA)](#option-b-using-external-csv-datasets-kaggle--jena--noaa)
  - [Option C: Using Indian Meteorological Department (IMD) / MOSDAC Data](#option-c-using-indian-meteorological-department-imd--mosdac-data)
  - [How Model Training Works Internally](#how-model-training-works-internally)
  - [Evaluating Model Accuracy](#evaluating-model-accuracy)
- [Part 2: Deploying to Render (render.com)](#part-2-deploying-to-render-rendercom)
  - [Architecture Overview](#architecture-overview)
  - [Method 1: 1-Click Blueprint Deployment (Recommended)](#method-1-1-click-blueprint-deployment-recommended)
  - [Method 2: Manual Web Service Setup on Render](#method-2-manual-web-service-setup-on-render)
  - [Method 3: Docker Deployment on Render](#method-3-docker-deployment-on-render)
  - [Testing & Verifying Your Deployment](#testing--verifying-your-deployment)
  - [Render Free Tier Tips & Troubleshooting](#render-free-tier-tips--troubleshooting)

---

# Part 1: Training on Real Datasets

SkyGuard AI's ML pipeline combines **two core models** that learn normal weather patterns and detect anomalies:
1. **LSTM-Autoencoder (`ml/lstm_autoencoder.py`)**: A deep neural network trained on normal multivariate time-series sequences. It reconstructs expected weather sequences; anomalies produce high reconstruction error.
2. **Isolation Forest (`ml/isolation_forest.py`)**: Multivariate outlier detector with robust scaling and per-station adaptation.

---

### Option A: Automatic Real Data Fetcher (Instant 1-Command)

We have built a dedicated meteorological fetcher (`data/fetch_real_weather.py`) that queries historical observations from the **Open-Meteo Archive API** (ERA5 Reanalysis + Global Surface Observation Network).

**Zero API keys or signups required.** It fetches real hourly temperature, humidity, and surface pressure across the 20 Indian AWS stations (Delhi, Mumbai, Bengaluru, Kolkata, Chennai, Jaipur, Shimla, etc.).

#### Step 1: Fetch Real Meteorological Data
```bash
# Fetch 60 days of real observations for all 20 stations
python -m data.fetch_real_weather --days 60 --stations 20
```
This saves cleaned data to `data/generated/real_aws_data.csv`.

*Optional arguments:*
```bash
# Specific date range:
python -m data.fetch_real_weather --start 2024-01-01 --end 2024-06-30 --stations 20 --out data/generated/real_aws_data.csv
```

#### Step 2: Train the ML Models
```bash
python ml/train.py --csv data/generated/real_aws_data.csv --epochs 25
```
Or combine fetch + train into a single command:
```bash
python ml/train.py --fetch-real --days 60 --epochs 25
```

The script will:
- Partition readings into per-station time sequences (window size = 12 steps).
- Fit the sensor normalizer (mean & standard deviation).
- Train the PyTorch LSTM-Autoencoder.
- Calibrate the anomaly threshold (95th percentile reconstruction loss).
- Fit per-station Isolation Forest detectors.
- Save the checkpoint to `ml/models/lstm_ae.pt`.

---

### Option B: Using External CSV Datasets (Kaggle / Jena / NOAA)

If you have downloaded a CSV from Kaggle (e.g. Max Planck Jena Climate, Kaggle Hourly Weather, or NOAA ISD):

#### Step 1: Run the Universal Normalizer
We created `data/ingest_real_dataset.py` to automatically detect column names, convert units (Kelvin/Fahrenheit → Celsius, Pa/inHg → hPa), and validate physical bounds.

```bash
python -m data.ingest_real_dataset --input path/to/your_dataset.csv --output data/generated/real_clean.csv
```

*Example for Kaggle Jena Climate Dataset:*
```bash
python -m data.ingest_real_dataset \
  --input jena_climate_2009_2016.csv \
  --output data/generated/jena_clean.csv \
  --station-id ST_JENA \
  --col-temp "T (degC)" \
  --col-pressure "p (mbar)" \
  --col-humidity "rh (%)"
```

#### Step 2: Train on the Cleaned CSV
```bash
python ml/train.py --csv data/generated/real_clean.csv --epochs 25
```

---

### Option C: Using Indian Meteorological Department (IMD) / MOSDAC Data

For the official Smart India Hackathon problem (SIH 26073 / AWS Anomaly Detection):
1. Download AWS data from [MOSDAC (ISRO)](https://www.mosdac.gov.in/) or [IMD Pune](https://mausam.imd.gov.in/).
2. Export as CSV. The columns usually are:
   - `Station_Id` or `Station_Name`
   - `Date_Time` or `Timestamp`
   - `Air_Temp` or `Dry_Bulb`
   - `RH` or `Humidity`
   - `SLP` or `Station_Pressure`
3. Normalize and train:
```bash
python -m data.ingest_real_dataset --input imd_raw.csv --output data/generated/imd_clean.csv
python ml/train.py --csv data/generated/imd_clean.csv --epochs 30
```

---

### How Model Training Works Internally

```
Raw CSV / Open-Meteo
        │
        ▼
data/ingest_real_dataset.py  ──> Schema Validation (Bounds: T[-50..60], P[850..1060], RH[0..100])
        │
        ▼
ml/train.py: make_sequences_by_station()
        │
        ├──> SensorNormaliser.fit() ──> [Z-score scaling per sensor]
        │
        ├──> Sliding Window Sequences ──> (N, seq_len=12, features=3)
        │
        ├──> PyTorch LSTM-Autoencoder ──> Train (Adam, MSE loss, gradient clipping)
        │
        ├──> Threshold Calibration ──> 95th percentile reconstruction error on validation set
        │
        └──> IsolationForest.fit_all() ──> RobustScaler + IsolationForest per station
        │
        ▼
ml/models/lstm_ae.pt (Model Checkpoint loaded automatically by backend on startup)
```

---

### Evaluating Model Accuracy

After training, evaluate the full 5-layer detection ensemble against benchmark anomaly injections:
```bash
python ml/evaluate.py --hours 24 --injections-per-type 15
```
This prints precision, recall, and F1-score across all 7 anomaly types (Spike, Frozen, Drift, Dropout, Noise Burst, Cross-Sensor, Unit Flip) and saves the results to `ml/models/eval_results.json` (displayed live on the dashboard's Analytics page).

---

# Part 2: Deploying to Render (render.com)

Render is a modern cloud platform with native support for WebSockets, background tasks, and Python services.

### Architecture Overview

SkyGuard AI is architected as a **Unified Full-Stack Service**:
- **Backend**: FastAPI running on Uvicorn.
- **Frontend**: React + Vite compiled into `frontend/dist/`.
- **Live Stream**: Native WebSockets (`/live`) on the same domain and port.
- **Zero CORS / Zero SSL Mismatch**: Frontend and backend run on the same Render URL (e.g. `https://skyguard-ai.onrender.com`), meaning WebSockets and REST APIs connect seamlessly without complex proxy configuration.

---

### Method 1: 1-Click Blueprint Deployment (Recommended)

We have already configured `render.yaml` and `build.sh` in the repository root.

#### Step 1: Push Code to GitHub / GitLab
```bash
git add .
git commit -m "Add Render deployment config and real dataset training"
git push origin main
```

#### Step 2: Deploy on Render
1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** (top right) → **Blueprint**.
3. Connect your GitHub/GitLab repository.
4. Render will detect `render.yaml` automatically.
5. Click **Apply**.
6. Render will:
   - Run `build.sh` (builds the React frontend and installs Python requirements with CPU-optimized PyTorch).
   - Verify model weights.
   - Start Uvicorn on `$PORT`.
   - Provide you with a live URL (e.g., `https://skyguard-ai.onrender.com`).

---

### Method 2: Manual Web Service Setup on Render

If you prefer to configure the service manually on Render:

1. In the Render Dashboard, click **New +** → **Web Service**.
2. Select your repository.
3. Fill in the following settings:
   - **Name**: `skyguard-ai`
   - **Region**: Any (e.g., `Oregon (US West)` or `Singapore`)
   - **Branch**: `main`
   - **Language**: `Python`
   - **Build Command**:
     ```bash
     chmod +x build.sh && ./build.sh
     ```
     *(Or inline: `cd frontend && npm install && npm run build && cd .. && pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -r backend/requirements.txt`)*
   - **Start Command**:
     ```bash
     uvicorn backend.main:app --host 0.0.0.0 --port $PORT
     ```
   - **Plan**: `Free`
4. Expand **Advanced**:
   - **Health Check Path**: `/health`
   - **Auto-Deploy**: `Yes`
5. Click **Create Web Service**.

---

### Method 3: Docker Deployment on Render

If you prefer containerized deployment, we have provided a multi-stage `Dockerfile` in the root:

1. In the Render Dashboard, click **New +** → **Web Service**.
2. Select your repository.
3. Set **Language / Runtime** to `Docker`.
4. Render will automatically build the `Dockerfile`.
5. Under **Advanced**, set **Health Check Path** to `/health`.
6. Click **Create Web Service**.

---

### Testing & Verifying Your Deployment

Once Render displays **"Live"**:

1. **Open the App in your browser**:
   `https://<your-service-name>.onrender.com`
   You will see the redesigned SkyGuard AI Landing page.

2. **Verify the Healthcheck**:
   `https://<your-service-name>.onrender.com/health`
   Expected response:
   ```json
   {
     "service": "SkyGuard AI",
     "status": "running",
     "stations": 20,
     "anomalies": 82,
     "docs": "/docs"
   }
   ```

3. **Verify Interactive API Documentation**:
   `https://<your-service-name>.onrender.com/docs`
   Swagger UI opens with all endpoints.

4. **Verify WebSocket Stream**:
   Navigate to the **Anomalies** or **Sensor Health** tab on your deployed dashboard. The top right indicator will turn green with a pulsing teal dot (**LIVE**), confirming active WebSocket telemetry!

5. **Test Ingesting Live Data into Production**:
   You can send real readings from anywhere in the world to your deployed URL:
   ```bash
   curl -X POST "https://<your-service-name>.onrender.com/ingest" \
     -H "Content-Type: application/json" \
     -d '{
       "station_id": "ST001",
       "temperature_c": 32.5,
       "pressure_hpa": 1012.0,
       "humidity_pct": 55.0
     }'
   ```

---

### Render Free Tier Tips & Troubleshooting

1. **Spin-down Behavior**:
   On the Render Free tier, web services spin down after 15 minutes of inactivity. When a new visitor accesses the URL, Render will take ~40–50 seconds to spin it back up. This is standard behavior on Render's free tier. For 24/7 uninterrupted uptime without sleep, upgrade to Render's **Starter** plan ($7/mo) or use a free monitoring ping (e.g. UptimeRobot or Cron-job.org pinging `/health` every 10 minutes).

2. **PyTorch Memory Optimization**:
   The `build.sh` script automatically installs `--index-url https://download.pytorch.org/whl/cpu`. This keeps the slug size under 200MB (instead of ~1GB with CUDA), preventing build timeouts and memory overflows on Render.

3. **WebSockets on Render**:
   Render natively supports persistent WebSockets with SSL (`wss://`). The frontend `src/api/client.js` is programmed to automatically detect the protocol (`window.location.protocol === 'https:' ? 'wss:' : 'ws:'`) so no manual URL changes are needed.
