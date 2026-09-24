"""
SkyGuard AI — Settings router
GET/PATCH /config/settings
"""

import json
from pathlib import Path
from fastapi import APIRouter
from backend.state import state

router = APIRouter(prefix="/config", tags=["config"])
EVAL_PATH = Path(__file__).parent.parent.parent / "ml" / "models" / "eval_results.json"


@router.get("/settings", summary="Get current detection settings")
def get_settings():
    return state.settings


@router.patch("/settings", summary="Update detection settings")
def update_settings(updates: dict):
    valid_keys = set(state.settings.keys())
    for k, v in updates.items():
        if k in valid_keys:
            state.settings[k] = v
    return {"status": "updated", "settings": state.settings}


@router.get("/eval-results", summary="Get model evaluation results (from ml/evaluate.py)")
def get_eval_results():
    if EVAL_PATH.exists():
        try:
            with open(EVAL_PATH) as f:
                state.eval_results = json.load(f)
        except Exception:
            pass
    return state.eval_results or {"message": "Run ml/evaluate.py to generate results"}
