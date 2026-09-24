# SkyGuard AI — Implementation Plan

## 1. Guiding Principle

Build in **vertical slices**: get one station's data flowing end-to-end (ingest → detect →
explain → display) before widening to many stations or adding every model layer. A working
thin slice beats a half-built full system on demo day.

---

## 2. Phased Roadmap

### Phase 0 — Setup (Day 0)
- Repo scaffold per README structure.
- Lock design tokens (colors/type/motion) — see `04_ANTIGRAVITY_STITCH_PROMPT.md`.
- Agree on data schema (PRD §4.1) and freeze it — every other module depends on this.
- Set up `02_PROJECT_STATE.md` task board with real owners.

### Phase 1 — Data Foundation (Days 1–2)
- Build/curate historical AWS-like dataset (real IMD open data if available, else simulated).
- Build synthetic anomaly injector (spike/frozen/drift/dropout/cross-sensor/noise).
- Build the stream replay simulator (acts as "live" AWS feed for demo).

### Phase 2 — Detection Core (Days 2–4)
- Statistical layer first (fast win, always-on safety net).
- Isolation Forest / autoencoder layer.
- Cross-sensor + spatial consistency layer.
- Fusion + confidence calibration.
- Evaluate against injected anomalies; tune thresholds; log metrics.

### Phase 3 — Explainability & Health (Days 3–5, parallel with Phase 2 tail)
- SHAP/LIME wiring on top of trained models.
- Natural-language reasoning templates.
- Root-cause classifier.
- Sensor health scoring + degradation trend.
- Self-healing imputation module.

### Phase 4 — Backend/API (Days 2–5, parallel)
- REST endpoints + WebSocket live channel.
- Alert dispatcher (start with in-app + webhook; email/SMS stubs are fine).
- Wire detection engine output into the results bus.

### Phase 5 — Frontend (Days 3–6, parallel)
- Generate design system + all screens via **Google Antigravity + Stitch**
  using `04_ANTIGRAVITY_STITCH_PROMPT.md`.
- Wire static/mock data first, then swap to live API/WebSocket.
- Build Demo/Judge Mode (one-click anomaly injection → watch it get caught live) — this is
  the single highest-leverage feature for the actual hackathon pitch.

### Phase 6 — Edge Path (Days 4–6, lowest priority, can be stubbed)
- Export a lightweight quantized model (TFLite-Micro).
- Document the ESP32 deployment story even if not physically flashed — a clear, credible
  writeup scores under "Practical Deployability" and "Energy Efficiency."

### Phase 7 — Integration & Polish (Days 6–7)
- End-to-end run: simulated stream → detection → dashboard, no manual steps.
- Fix rough edges in explanations, chart readability, mobile responsiveness.
- Rehearse the demo script end to end at least twice.

### Phase 8 — Submission Package (Day 7)
- Finalize README, Project Report, architecture diagram, screenshots/GIFs.
- Record a 2–3 minute demo video (script it — see §5 below).
- Freeze `02_PROJECT_STATE.md` as a record of what was built and by whom.

---

## 3. Suggested Timeline (7-day hackathon build sprint)

| Day | Focus |
|---|---|
| 1 | Setup, schema, dataset, design tokens locked |
| 2 | Statistical detector + API skeleton + UI screens (static) |
| 3 | ML detector layers + explainability wiring starts |
| 4 | Fusion + confidence + sensor health + UI wired to mock data |
| 5 | Self-healing module + UI wired to live API/WebSocket |
| 6 | Edge path writeup + Demo Mode + integration testing |
| 7 | Polish, report, demo rehearsal, submission |

*(Compress/stretch proportionally for shorter or longer hackathon windows.)*

---

## 4. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| No real AWS dataset available | Medium | High-quality synthetic generator with realistic seasonal/diurnal patterns |
| Deep model overfits / underperforms in time available | Medium | Statistical layer is always the safety net; ensemble degrades gracefully |
| Live map provider needs paid API key | Low | Default to offline Leaflet + static tiles for demo safety |
| Frontend/backend integration slips | High | Build UI against mock JSON matching the real API contract from Day 2 |
| Edge/ESP32 not actually flashed in time | Low | A credible, well-documented export path is acceptable for judging |
| Multiple agents editing same files | Medium | Module Ownership Map + append-only changelog in `02_PROJECT_STATE.md` |

---

## 5. Demo Script Skeleton (for the pitch video/live demo)

1. **Hook (15s):** State the grand challenge — sensors lie, forecasts suffer.
2. **Live dashboard (30s):** Show the station map, everything green/healthy.
3. **Trigger anomaly (30s):** Use Demo/Judge Mode to inject a sensor spike live.
4. **Catch it (30s):** Dashboard flags it in real time — show confidence score + severity.
5. **Explain it (30s):** Open the explainability panel — SHAP chart + plain-language reason +
   root-cause classification ("sensor spike, not weather — neighboring stations agree").
6. **Heal it (20s):** Show the suggested corrected value, clearly marked as estimated.
7. **Predict it (15s):** Show the sensor health score trending down → maintenance recommendation.
8. **Close (10s):** Edge/ESP32 story + scalability pitch + grand-challenge callback.
