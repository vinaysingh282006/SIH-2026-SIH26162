# SkyGuard AI — Project State (Living Document)

> **Purpose:** This is the single shared source of truth. Every AI agent, tool (Antigravity,
> Stitch, Claude, Cursor, etc.) or human working on this project reads this file **first**
> before doing anything, and appends to it **after** finishing a unit of work. Never delete
> history — only append. Treat this file as append-only + a small "current status" block that
> gets overwritten.

---

## 0. How To Use This File (read this if you are an AI agent)

1. Read the **Current Status** block below to know what phase the project is in.
2. Read **Module Ownership Map** to know which files/folders you're allowed to touch.
3. Do your work.
4. Append one entry to the **Changelog** at the bottom in the format shown.
5. Update the **Task Board** status for the item(s) you touched.
6. If you made a decision that affects other agents (API contract, schema, color token, etc.),
   log it in **Decision Log** so nobody re-litigates it or drifts out of sync.
7. Never edit another agent's changelog entries. Never rewrite history.

---

## 1. Current Status

- **Project:** SkyGuard AI (SIH 26073)
- **Phase:** `BUILD` <!-- PLANNING → SETUP → BUILD → INTEGRATION → POLISH → DEMO-READY -->
- **Last updated by:** Antigravity (Agent A/B/C/E) — 2026-09-23 17:59 IST
- **Blocking issues:** none — run `python ml/train.py` before first demo to generate ml/models/lstm_ae.pt

---

## 2. Task Board

| ID | Task | Module | Owner (agent/human) | Status | Notes |
|---|---|---|---|---|---|
| T-01 | Define data schema & synthetic anomaly generator | Data | Antigravity | **Done** | data/schema.py, data/synthetic_data.py, data/anomaly_injector.py |
| T-02 | Build statistical detection layer (Z/IQR/STL/frozen-value) | ML | Antigravity | **Done** | ml/statistical_detector.py |
| T-03 | Build Isolation Forest / deep autoencoder layer | ML | Antigravity | **Done** | ml/isolation_forest.py, ml/lstm_autoencoder.py, ml/train.py |
| T-04 | Build cross-sensor + spatial consistency layer | ML | Antigravity | **Done** | ml/cross_sensor.py, ml/spatial_consistency.py |
| T-05 | Ensemble fusion + confidence calibration | ML | Antigravity | **Done** | ml/ensemble_fusion.py |
| T-06 | SHAP/LIME explainability + NL reasoning generator | ML | Antigravity | **Done** | ml/explainability.py |
| T-07 | Sensor health scoring + maintenance prediction | ML | Antigravity | **Done** | ml/health_scoring.py |
| T-08 | Self-healing imputation module | ML | Antigravity | **Done** | ml/imputation.py |
| T-09 | REST + WebSocket API | Backend | Antigravity | **Done** | backend/main.py + all routers |
| T-10 | Streaming ingestion (MQTT/replay simulator) | Backend | Antigravity | **Done** | data/simulate_stream.py, backend/routers/ingest.py |
| T-11 | Alerting/notification service | Backend | Antigravity | **Done** | backend/pipeline.py → state.push_alert() |
| T-12 | Design system tokens (colors/type/motion) finalized | Design | Antigravity | **Done** | frontend/src/design-system/tokens.css, frontend/src/index.css |
| T-13 | Antigravity/Stitch UI generation — all screens | Frontend | Antigravity | **Done** | All 9 screens in frontend/src/pages/ |
| T-14 | Frontend ↔ Backend integration (live data wiring) | Frontend | Antigravity | **Done** | frontend/src/api/client.js + WebSocket in App.jsx |
| T-15 | Demo/Judge mode (one-click anomaly injection flow) | Frontend+Backend | Antigravity | **Done** | DemoMode.jsx + backend/routers/demo.py |
| T-16 | ESP32 / TinyML export path (stub acceptable) | Edge | unassigned | Deferred | Credible writeup acceptable per plan |
| T-17 | README, Report, Implementation Plan finalized | Docs | unassigned | In Progress | |
| T-18 | End-to-end demo rehearsal | All | unassigned | Not Started | Run ml/train.py first | |

---

## 3. Module Ownership Map (avoid file-conflict collisions)

| Path / Area | Owning Agent Role | Notes |
|---|---|---|
| `/data`, `/ml` | **Agent A — ML/Data** | schema, models, evaluation harness |
| `/backend`, `/api` | **Agent B — Backend/API** | FastAPI/Node service, streaming, alerts |
| `/frontend` | **Agent C — Frontend/UI** | Antigravity+Stitch output, React app |
| `/edge` | **Agent D — Edge/ESP32** | TinyML export, firmware stub |
| `/docs`, root `*.md` | **Agent E — Docs/Coordination** | keeps this file and the report/README in sync |

Rule: an agent may **read** any file but should only **write** inside its own area, plus this
state file's Task Board / Changelog / Decision Log sections.

---

## 4. Decision Log

| Date | Decision | Made by | Rationale |
|---|---|---|---|
| 2026-09-23 | Deep model: **PyTorch** (not TensorFlow) | Antigravity | Cleaner ONNX→TFLite-Micro export path |
| 2026-09-23 | Dataset: **fully synthetic** | Antigravity | Demo reliability guaranteed, no IMD access needed |
| 2026-09-23 | Map: **Leaflet + OpenStreetMap** | Antigravity | No API key risk on demo day |
| 2026-09-23 | Edge/ESP32: **deferred** | Antigravity | Credible writeup sufficient for judging |
| 2026-09-23 | ML packaging: **local imports** (not separate service) | Antigravity | Avoids duplicate deps; backend/pipeline.py imports ml/ directly |
| 2026-09-23 | Eval results wired into **Analytics UI** | Antigravity | User explicitly requested F1/P/R tiles on dashboard |
| 2026-09-23 | Data schema: `station_id, timestamp, temperature_c, pressure_hpa, humidity_pct, lat, lon, elevation_m` | Antigravity | Frozen — see data/schema.py |

---

## 5. Open Questions / Risks

- [ ] Real or fully synthetic dataset for the demo? (affects T-01, T-17)
- [ ] Which framework for deep model — PyTorch vs TensorFlow? (affects T-03, T-16 export path)
- [ ] Map provider (Mapbox needs API key) vs. offline Leaflet + static tiles for demo safety?
- [ ] How far to take the ESP32 path — real flashed firmware, or a well-documented stub?

---

## 6. Changelog

> Format: `### [YYYY-MM-DD HH:MM] Agent: <name/role> — <one-line summary>` followed by 1–3
> bullet points of what changed and why. Newest entries at the **top**.

### [2026-09-23 17:59 IST] Agent: Antigravity — Full Phase 0-3 build complete
- Agent: Antigravity (playing Agent A + B + C + E roles)
- Summary: Scaffolded complete codebase — data layer (schema, synthetic generator, anomaly injector, bootstrap, stream simulator), ML layer (statistical, isolation forest, LSTM-AE, cross-sensor, spatial, ensemble fusion, explainability, health scoring, imputation, train, evaluate), FastAPI backend (main, state, pipeline, websocket, 7 routers), React/Vite frontend (design tokens, CSS, all 9 screens, API client), docker-compose, .gitignore.
- Files touched: 45+ files across data/, ml/, backend/, frontend/src/, root
- Next suggested step: Run `python ml/train.py` to produce lstm_ae.pt, then `uvicorn backend.main:app --reload` from repo root, then `cd frontend && npm run dev`. Then run `python ml/evaluate.py` and refresh the Analytics screen.

---
*(no entries yet — first agent to act, add yours above this line)*
