# Project Report: SkyGuard AI

**Problem Statement ID:** SIH26073
**Title:** AI/ML-Based Intelligent Anomaly Detection for Automatic Weather Stations (AWS)
**Organization:** Ministry of Earth Sciences (MoES) — India Meteorological Department
**Theme:** Disaster Management · **Category:** Software

---

## 1. Abstract

SkyGuard AI is a real-time, explainable, multi-layer anomaly-detection system for Automatic
Weather Station networks, built to identify sensor faults, communication failures, calibration
drift, and data corruption in temperature, pressure and humidity readings — while
distinguishing them from genuine meteorological extremes. The system fuses statistical
methods, unsupervised ML, deep sequence models, and cross-sensor/spatial consistency checks
into a calibrated ensemble, then explains every decision using SHAP/LIME-derived,
plain-language reasoning. It further predicts sensor health and degradation, proposes
corrected values where appropriate, and is architected with an eventual edge-AI (ESP32)
deployment path in mind.

## 2. Background & Motivation

AWS networks are the backbone of modern forecasting, aviation safety, agricultural planning,
and disaster early-warning systems. A single undetected sensor fault can silently corrupt
downstream forecasts and risk models. Traditional QC relies on static thresholds, which fail
against subtle drift, frozen sensors, or anomalies that are only visible when several
parameters are considered together. This motivates a learned, multivariate, explainable
approach.

## 3. Problem Statement (as given)

Develop an AI/ML-based intelligent anomaly detection system capable of automatically
identifying abnormal, inconsistent, or faulty observations from AWS in real time, using
temperature (°C), atmospheric pressure (hPa), and relative humidity (%), while distinguishing
genuine meteorological events from sensor/data anomalies and minimizing false alarms, in a way
that scales across large observation networks.

## 4. Objectives

1. Real-time anomaly detection across AWS data streams.
2. Identification of sensor faults, spikes, frozen values, and communication errors.
3. Learning of normal temporal and seasonal patterns per station.
4. Multivariate consistency analysis among temperature, pressure and humidity.
5. Confidence-scored, explainable AI reasoning for every detection.
6. Prediction of sensor degradation and maintenance needs.
7. Optional corrected/imputed value suggestions for anomalous observations.

## 5. Proposed Approach / Methodology

### 5.1 Detection Strategy — Layered Ensemble
Rather than a single model, SkyGuard AI runs four complementary detection layers and fuses
their outputs:

1. **Statistical layer** — rolling Z-score/IQR, STL seasonal-residual thresholds, frozen-value
   and rate-of-change detectors. Fast, interpretable, always-on safety net.
2. **Unsupervised ML layer** — Isolation Forest / One-Class SVM on multivariate feature
   vectors to catch outliers statistical rules miss.
3. **Deep temporal layer** — LSTM/TCN-Autoencoder trained on each station's (or cluster's)
   normal seasonal/diurnal pattern; reconstruction error signals anomalies.
4. **Consistency layer** — physical-plausibility rules (e.g., dew-point/humidity/temperature
   relationships, pressure-altitude relation) plus spatial comparison against interpolated
   neighbor-station values, to separate *local sensor fault* from *real regional weather*.

Layer outputs are combined via a calibrated ensemble (weighted vote or stacked
meta-classifier) into one anomaly probability, mapped to a severity level (Low → Critical).

### 5.2 Explainability
SHAP values (for tree/ensemble components) and LIME (for the deep model) quantify each
feature's contribution to a flagged anomaly. A template-based natural-language generator turns
these into a human-readable reason, and a multi-label classifier assigns a probable root
cause (sensor fault, calibration drift, communication failure, power fluctuation, genuine
environmental extreme, or data corruption).

### 5.3 Sensor Health & Self-Healing
A rolling health score (0–100) is computed per station from anomaly frequency, drift
magnitude, and communication reliability, with simple trend forecasting to recommend
maintenance windows. For flagged points, an imputation module (seasonal-naive, model-based, or
spatial interpolation) proposes a corrected value — always clearly labeled as an estimate,
never silently overwriting raw data.

### 5.4 System Architecture
Ingestion (REST/MQTT/replay) → feature pipeline → detection ensemble → fusion/calibration →
explainability + health + imputation → pub/sub results bus → REST/WebSocket API → dashboard,
with an alert dispatcher fanning out to email/SMS/webhook channels. See `README.md` for the
architecture diagram.

### 5.5 Edge Deployment Path
A distilled/quantized statistical+light-ensemble model, exported via TensorFlow Lite for
Microcontrollers, can run on ESP32-class hardware to pre-screen readings locally and only
forward suspicious data upstream — reducing bandwidth and power draw, relevant for remote AWS
sites with limited connectivity.

## 6. Novelty / Unique Selling Points

- Combines temporal, multivariate, **and spatial** (cross-station) consistency checks in one
  fused decision — most naive approaches only look at a single station's own history.
- Every alert is explainable and confidence-scored, not a black-box flag.
- Includes a predictive-maintenance layer, moving from *reactive* to *proactive* network
  health management.
- Designed with a credible low-power edge path from day one, not bolted on afterward.

## 7. Expected Outcomes

- Real-time anomaly alerts with severity and confidence scores.
- Root-cause classification per anomaly.
- A live visualization dashboard (station map, time-series, explainability drill-down, health
  scorecards).
- Sensor health status and maintenance recommendations.
- Optional corrected-data estimates with full audit trail.

## 8. Evaluation Plan

The system will be evaluated against anomaly-injected data (per the hackathon's grading
methodology), measuring detection precision/recall/F1 by anomaly type, false-alarm rate,
end-to-end latency, and explanation quality — mirroring the official weighted evaluation
criteria (Innovation 25%, Accuracy 20%, Real-Time 15%, Explainability 10%, Scalability 10%,
Deployability 10%, UI 5%, Energy Efficiency 5%).

## 9. Societal / Practical Impact

More reliable AWS data directly improves weather forecasting, aviation safety, agricultural
advisories, and disaster early-warning accuracy — while predictive maintenance reduces the
operational cost of manually auditing large sensor networks, particularly valuable for IMD's
nationwide deployment scale.

## 10. Future Scope

- Integration with real IMD AWS telemetry feeds.
- Expansion to additional parameters (wind speed/direction, rainfall).
- Federated/on-device learning across the edge fleet.
- Automated root-cause feedback loop to physically dispatch maintenance crews.

## 11. Team & Roles

_(fill in team name, members, and role assignments — see `06_AGENT_ORCHESTRATION_MAP.md` for
how AI agents divide the build work.)_

## 12. References

_(add papers/datasets/tools cited, e.g. IMD open data portals, SHAP/LIME papers, relevant
anomaly-detection literature.)_
