# SkyGuard AI — Product Requirements & Feature Specification

**SIH Problem Statement ID:** 26073
**Title:** AI/ML-Based Intelligent Anomaly Detection for Automatic Weather Stations (AWS)
**Organization:** Ministry of Earth Sciences (MoES) — India Meteorological Department
**Category:** Software | **Theme:** Disaster Management

---

## 1. Product Vision

SkyGuard AI is a real-time, explainable, self-healing anomaly-detection layer for Automatic
Weather Station (AWS) networks. It watches temperature, pressure and humidity streams, tells
a sensor fault apart from a genuine extreme-weather event, explains *why* it flagged
something, scores its own confidence, estimates sensor health/remaining-useful-life, and
(optionally) proposes a corrected value — all while staying light enough to eventually run on
an ESP32 at the edge.

**One-line pitch:** *"A weather station that knows when it's lying to you — and tells you why."*

---

## 2. Grand Challenge Alignment

> "Can AI build a self-aware and self-healing weather observation network capable of
> delivering trustworthy atmospheric data under all environmental conditions?"

SkyGuard AI answers this with three pillars:
1. **Self-Aware** — continuous confidence + sensor-health scoring per station.
2. **Self-Explaining** — SHAP/LIME-backed root-cause reasoning in plain language.
3. **Self-Healing** — auto-imputation of corrected values + predictive maintenance alerts.

---

## 3. Evaluation-Criteria → Feature Mapping

| Criteria | Weight | Features that address it |
|---|---|---|
| Innovation & Novelty | 25% | Multivariate cross-sensor consistency graph, spatial neighbor-comparison, self-healing imputation, edge-AI story |
| Detection Accuracy | 20% | Ensemble of statistical + ML + deep models, synthetic anomaly injection test harness |
| Real-Time Capability | 15% | Streaming pipeline, sub-second inference, WebSocket live dashboard |
| Explainability | 10% | SHAP/LIME panel, natural-language reasoning generator |
| Scalability | 10% | Stateless microservice inference, horizontal worker pool, multi-station fan-out |
| Practical Deployability | 10% | Dockerized services, ESP32 TinyML export path, REST/MQTT ingestion |
| Visualization/UI | 5% | SkyGuard dashboard (see design doc) |
| Energy Efficiency | 5% | Quantized edge model, adaptive sampling, sleep/duty-cycle logic |

---

## 4. Core Modules (Backend / ML)

### 4.1 Data Ingestion Layer
- Accepts historical CSV/Parquet datasets and simulated live streams.
- Protocol adapters: REST push, MQTT subscribe, WebSocket, CSV batch replay (for demo).
- Schema: `station_id, timestamp, temperature_c, pressure_hpa, humidity_pct, lat, lon, elevation_m`.
- Synthetic Anomaly Injector: spike, frozen/stuck-at value, drift, dropout/gap, noise burst,
  cross-sensor inconsistency, unit-flip errors — configurable severity and duration, used for
  self-evaluation against the hackathon's "anomaly-injected data" grading set.
- Data validation & normalization (unit checks, range clamps, timestamp gap detection).

### 4.2 Anomaly Detection Engine (Ensemble)
- **Statistical layer:** rolling Z-score, IQR/MAD, seasonal-trend decomposition (STL) residual
  thresholds, frozen-value detector (variance ≈ 0 over N samples), rate-of-change limiter.
- **ML layer:** Isolation Forest / One-Class SVM for multivariate outliers.
- **Deep layer:** LSTM-Autoencoder (or TCN-Autoencoder) trained on normal temporal/seasonal
  patterns per station/cluster; reconstruction error → anomaly score.
- **Cross-sensor consistency layer:** physical-plausibility rules + learned correlation model
  (e.g., pressure-altitude relation, dew-point vs. humidity/temperature consistency).
- **Spatial consistency layer:** compares a station's reading against interpolated values from
  k-nearest neighboring stations (IDW / kriging) to separate local sensor fault from a real
  regional weather event.
- **Ensemble fusion:** weighted voting / stacked meta-classifier combining all layer scores into
  one unified anomaly probability + severity (Low/Medium/High/Critical).

### 4.3 Explainability Module
- SHAP values per feature per prediction (for tree/ensemble models).
- LIME local surrogate explanations for the deep model.
- Natural-language reasoning generator: turns SHAP/LIME output + rule triggers into a sentence,
  e.g. *"Flagged because temperature jumped 18°C in 2 minutes while pressure and humidity
  stayed stable and neighboring stations show no such change — likely sensor spike, not weather."*
- Root-cause classifier (multi-label): `sensor_fault | calibration_drift | comms_failure |
  power_fluctuation | environmental_extreme | data_corruption | unknown`.

### 4.4 Confidence & Severity Scoring
- Confidence score (0–100%) = calibrated probability from ensemble (e.g., Platt scaling /
  isotonic regression on validation set).
- Severity levels drive alert routing (Critical → immediate push, Low → dashboard-only).

### 4.5 Sensor Health & Predictive Maintenance
- Health score per station/sensor (0–100) based on: anomaly frequency trend, drift magnitude
  over time, communication reliability %, battery/power telemetry (if available).
- Degradation trend forecasting (simple regression / exponential smoothing on health score) →
  "Recommend maintenance within X days" alerts.

### 4.6 Self-Healing / Correction Module
- Imputation strategies: seasonal-naive, interpolation from time-series model, spatial
  interpolation from neighbors, ensemble blend — selectable/explainable.
- Clearly flags any corrected value as *estimated*, never silently overwrites raw data
  (audit trail preserved).

### 4.7 Real-Time Streaming & Serving
- Ingestion → feature pipeline → inference workers → results bus (pub/sub) → dashboard
  WebSocket + alert dispatcher, all decoupled for horizontal scaling.
- Target latency: < 2s from ingestion to alert for a single station reading.

### 4.8 Alerting & Notification
- Channels: in-app feed, webhook, email (SMTP), SMS (stub/Twilio-ready), configurable rules
  (severity threshold, station group, quiet hours).

### 4.9 Edge AI (ESP32) Path
- Quantized/distilled lightweight model (statistical + tiny ensemble, TFLite-Micro) for
  on-device pre-screening; only suspicious readings forwarded to cloud/full pipeline —
  bandwidth + energy savings story for judges.

### 4.10 API Layer
- REST: `/stations`, `/stations/{id}/readings`, `/anomalies`, `/anomalies/{id}/explain`,
  `/sensor-health`, `/alerts`, `/inject-anomaly` (demo/testing), `/config/thresholds`.
- WebSocket: `/live` channel streaming readings + anomaly events.
- Auth: API key / JWT, role-based (Admin, Meteorologist/Viewer, Demo/Judge).

---

## 5. Core Modules (Frontend / Dashboard)

1. **Landing / Mission screen** — product pitch, grand-challenge framing, live network status teaser.
2. **Live Network Map** — all AWS stations on a map, color-coded by health/anomaly status,
   click-through to station detail.
3. **Station Detail / Time-Series View** — temperature/pressure/humidity charts with anomaly
   markers overlaid, raw vs. corrected value toggle.
4. **Anomaly Feed / Alert Center** — real-time scrolling feed, filters by severity/root-cause/station.
5. **Explainability Drill-Down Panel** — per-anomaly SHAP/LIME visualization + natural-language
   reasoning + confidence gauge.
6. **Sensor Health Dashboard** — health scorecards, degradation trend charts, maintenance
   recommendations list.
7. **Analytics & Reports** — historical anomaly trends, accuracy metrics vs. injected anomalies,
   exportable PDF/CSV report.
8. **Settings / Threshold Config** — admin controls for detection sensitivity, alert rules,
   notification channels.
9. **Demo/Judge Mode** — one-click synthetic anomaly injection + "watch SkyGuard catch it live"
   showcase flow (important for hackathon demo impact).

---

## 6. Non-Functional Requirements

- **Real-time:** end-to-end alert latency < 2s (target), dashboard update < 500ms after event.
- **Scalability:** horizontally scalable inference workers; tested conceptually to 500+ stations.
- **Explainability:** every anomaly must ship with a confidence score + at least one
  human-readable reason.
- **Reliability:** graceful degradation — if ML layer fails, statistical layer still guards.
- **Security:** input validation, rate limiting, auth on write endpoints, no PII (weather data
  only).
- **Energy efficiency:** edge model must be quantizable to run on ESP32-class hardware.
- **Auditability:** every correction/imputation is logged and reversible.

---

## 7. Suggested Tech Stack (adjust to team skill)

- **Data/ML:** Python, pandas, scikit-learn, PyTorch/TensorFlow (LSTM-Autoencoder), SHAP, LIME,
  statsmodels (STL).
- **Backend/API:** FastAPI (Python) or Node.js/Express, WebSocket support, Redis (pub/sub +
  cache), PostgreSQL/TimescaleDB (time-series storage).
- **Streaming:** MQTT (paho-mqtt) or Kafka (if scope allows) for ingestion simulation.
- **Frontend:** React (built via Google Antigravity + Stitch, see prompt doc), Recharts/D3 for
  charts, Mapbox/Leaflet for the station map.
- **Edge:** TensorFlow Lite for Microcontrollers, Arduino/ESP-IDF for ESP32 firmware stub.
- **DevOps:** Docker Compose for local multi-service demo, GitHub Actions for CI (optional).

---

## 8. Out of Scope (v1 / hackathon MVP)

- Real hardware integration with live IMD sensors (simulated data only).
- Full production-grade SMS gateway billing.
- Multi-tenant enterprise auth (single demo org is enough).
- Native mobile app (responsive web is sufficient).
