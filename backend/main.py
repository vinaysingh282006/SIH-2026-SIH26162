"""
SkyGuard AI — FastAPI Application
====================================
Startup sequence:
  1. Load LSTM-AE model checkpoint (if exists)
  2. Fit Isolation Forest models on bootstrap history
  3. Bootstrap 24h of synthetic history into state
  4. Mount all routers
  5. Open WebSocket /live endpoint

Run:
    uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
"""

import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Make repo root importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from backend.state import state
from backend.websocket import manager
from backend.routers import stations, anomalies, health, alerts, demo, ingest, config

EVAL_PATH = Path(__file__).parent.parent / "ml" / "models" / "eval_results.json"
MODEL_PATH = Path(__file__).parent.parent / "ml" / "models" / "lstm_ae.pt"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    print("=" * 60)
    print("  SkyGuard AI — Backend Starting")
    print("=" * 60)

    # 1. Load LSTM-AE checkpoint
    from ml.lstm_autoencoder import load_model
    load_model(MODEL_PATH)

    # 2. Bootstrap history (generates data, fits IF models, seeds state)
    print("[startup] Fitting Isolation Forest on baseline data…")
    from data.synthetic_data import generate_all_stations
    from ml.isolation_forest import fit_all as if_fit_all

    df = generate_all_stations(hours=6)   # 6h sufficient for IF fitting
    if_fit_all(df)
    print("[startup] Isolation Forest fitted.")

    print("[startup] Bootstrapping 24h history into state…")
    from data.bootstrap_history import bootstrap
    bootstrap(state, hours=24)

    # 3. Load eval results (if available)
    if EVAL_PATH.exists():
        with open(EVAL_PATH) as f:
            state.eval_results = json.load(f)
        print(f"[startup] Loaded eval results: macro_f1={state.eval_results.get('macro_f1', 'N/A')}")
    else:
        print("[startup] No eval results found — run `python ml/evaluate.py` to generate them.")

    print("[startup] Ready! Dashboard: http://localhost:5173  API docs: http://localhost:8000/docs")
    print("=" * 60)

    yield   # ← server runs here

    # ── Shutdown ──────────────────────────────────────────────────────────────
    print("[shutdown] SkyGuard AI backend stopped.")


app = FastAPI(
    title="SkyGuard AI",
    description="Real-time anomaly detection for Automatic Weather Stations (SIH 26073)",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS (allow Vite dev server) ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(stations.router)
app.include_router(anomalies.router)
app.include_router(health.router)
app.include_router(alerts.router)
app.include_router(demo.router)
app.include_router(ingest.router)
app.include_router(config.router)


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/live")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    # Send current state snapshot on connection
    await websocket.send_json({
        "event_type": "snapshot",
        "payload": {
            "stations":  state.all_stations(),
            "anomalies": state.all_anomalies(limit=20),
            "health":    state.all_health(),
        },
    })
    try:
        while True:
            # Keep alive — client messages are ignored (read-only feed)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


DIST_DIR = Path(__file__).parent.parent / "frontend" / "dist"


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
def health_status():
    return {
        "service":    "SkyGuard AI",
        "status":     "running",
        "stations":   len(state.all_stations()),
        "anomalies":  len(state.all_anomalies()),
        "docs":       "/docs",
    }


# ── Frontend SPA & Static Assets (Unified Production & Render Deployment) ────
if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
    if (DIST_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        target = DIST_DIR / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(DIST_DIR / "index.html")
else:
    @app.get("/", tags=["meta"])
    def root():
        return {
            "service":    "SkyGuard AI",
            "status":     "running",
            "stations":   len(state.all_stations()),
            "anomalies":  len(state.all_anomalies()),
            "docs":       "/docs",
        }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
