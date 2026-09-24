"""
SkyGuard AI — WebSocket Manager
=================================
Manages connected clients and broadcasts live events to all of them.
"""

import asyncio
import json
from typing import Any
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._clients: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._clients:
            self._clients.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        dead = []
        for ws in self._clients:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


async def broadcast_event(event_type: str, payload: Any) -> None:
    """Broadcast a typed event to all connected WebSocket clients."""
    try:
        # Convert non-serialisable types
        if hasattr(payload, "dict"):
            payload = payload.dict()
        msg = {"event_type": event_type, "payload": payload}
        await manager.broadcast(msg)
    except Exception as e:
        pass   # Don't let broadcast errors affect the pipeline
