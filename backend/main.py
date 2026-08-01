# main.py - Entry point for the robotaxi backend server

from __future__ import annotations

import asyncio
import json
import sys
import os
from typing import Any, Dict, Set
from uuid import uuid4

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Ensure the backend directory is on sys.path so relative imports work
sys.path.insert(0, os.path.dirname(__file__))

from config import TICK_INTERVAL_SECONDS
from core.fleet_manager import FleetManager
from models.passenger import Passenger

# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------
app = FastAPI(
    title="UrbanFlow",
    description="Dynamic fleet optimisation under time-varying traffic conditions",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

results_dir = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(results_dir, exist_ok=True)
app.mount("/results", StaticFiles(directory=results_dir), name="results")

# ---------------------------------------------------------------------------
# Shared simulation state
# ---------------------------------------------------------------------------
fleet_manager: FleetManager = FleetManager()
connected_clients: Set[WebSocket] = set()

# Simulation control flags
is_paused: bool = False
effective_interval: float = TICK_INTERVAL_SECONDS   # adjustable via /set-speed

# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class BookRideRequest(BaseModel):
    origin_node: int
    destination_node: int


class SetSpeedRequest(BaseModel):
    multiplier: float


# ---------------------------------------------------------------------------
# Background simulation loop
# ---------------------------------------------------------------------------

async def simulation_loop() -> None:
    """Async background task: tick the simulation and broadcast state to all
    connected WebSocket clients every ``effective_interval`` seconds."""
    global is_paused, effective_interval

    while True:
        await asyncio.sleep(effective_interval)

        if is_paused or not connected_clients:
            continue

        try:
            state: Dict[str, Any] = fleet_manager.step()
            payload: str = json.dumps(state, default=str)
        except Exception as exc:  # noqa: BLE001
            print(f"Simulation Error: {exc}")
            payload = json.dumps({"error": str(exc)})

        # Broadcast to all connected clients (remove dead sockets)
        dead: Set[WebSocket] = set()
        for ws in list(connected_clients):
            try:
                await ws.send_text(payload)
            except Exception:  # noqa: BLE001
                dead.add(ws)

        connected_clients.difference_update(dead)


@app.on_event("startup")
async def startup_event() -> None:
    """Launch the background simulation loop when the server starts."""
    asyncio.create_task(simulation_loop())


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket connection for real-time simulation state streaming.

    On connect the current state is sent immediately so the frontend can
    render the city before the first tick fires.
    """
    await websocket.accept()
    connected_clients.add(websocket)

    # Send current state immediately on connect
    try:
        initial_state = fleet_manager.get_state()
        await websocket.send_text(json.dumps(initial_state, default=str))
    except Exception:  # noqa: BLE001
        pass

    try:
        while True:
            # Keep the connection alive; actual data is pushed by simulation_loop
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.discard(websocket)
    except Exception:  # noqa: BLE001
        connected_clients.discard(websocket)


# ---------------------------------------------------------------------------
# REST — City graph
# ---------------------------------------------------------------------------

@app.get("/api/city-graph")
async def get_city_graph() -> Dict[str, Any]:
    """Return the full city graph (nodes + edges) for initial map render."""
    return fleet_manager.graph.to_json()


# ---------------------------------------------------------------------------
# REST — Fleet status
# ---------------------------------------------------------------------------

@app.get("/api/fleet-status")
async def get_fleet_status() -> list:
    """Return the current state of every vehicle in the proposed fleet."""
    return [v.to_dict() for v in fleet_manager.vehicles.values()]


# ---------------------------------------------------------------------------
# REST — Metrics
# ---------------------------------------------------------------------------

@app.get("/api/metrics")
async def get_metrics() -> Dict[str, Any]:
    """Return all metric time-series for both proposed and baseline systems."""
    return fleet_manager.tracker.to_dict()


# ---------------------------------------------------------------------------
# REST — Manual ride booking
# ---------------------------------------------------------------------------

@app.post("/api/book-ride")
async def book_ride(body: BookRideRequest) -> Dict[str, Any]:
    """Inject a manually booked passenger into the simulation."""
    passenger_id = f"P{str(uuid4())[:6].upper()}"

    # Validate node IDs
    num_nodes = len(fleet_manager.graph.nodes)
    if body.origin_node not in fleet_manager.graph.nodes:
        return {"error": f"Invalid origin node {body.origin_node}"}
    if body.destination_node not in fleet_manager.graph.nodes:
        return {"error": f"Invalid destination node {body.destination_node}"}

    passenger = Passenger(
        id=passenger_id,
        origin=body.origin_node,
        destination=body.destination_node,
        request_time=fleet_manager.current_time,
        pickup_time=None,
        dropoff_time=None,
        assigned_vehicle=None,
        status="waiting",
        is_manual=True,
    )
    fleet_manager.passengers[passenger_id] = passenger
    fleet_manager.rolling_horizon.pending_passengers.append(passenger)

    origin_name = fleet_manager.graph.get_node_name(body.origin_node)
    destination_name = fleet_manager.graph.get_node_name(body.destination_node)

    return {
        "passenger_id": passenger_id,
        "message": "Ride booked",
        "origin_name": origin_name,
        "destination_name": destination_name,
    }


# ---------------------------------------------------------------------------
# REST — Simulation controls
# ---------------------------------------------------------------------------

@app.post("/api/simulation/pause")
async def pause_simulation() -> Dict[str, str]:
    """Pause the simulation loop (vehicles freeze, clock stops)."""
    global is_paused
    is_paused = True
    return {"status": "paused"}


@app.post("/api/simulation/resume")
async def resume_simulation() -> Dict[str, str]:
    """Resume a paused simulation."""
    global is_paused
    is_paused = False
    return {"status": "running"}


@app.post("/api/simulation/reset")
async def reset_simulation() -> Dict[str, str]:
    """Restart the simulation from scratch (new graph, fleet, and passengers)."""
    global is_paused, effective_interval
    fleet_manager.reset()
    is_paused = False
    effective_interval = TICK_INTERVAL_SECONDS
    return {"status": "reset"}


@app.post("/api/simulation/set-speed")
async def set_speed(body: SetSpeedRequest) -> Dict[str, Any]:
    """Adjust simulation speed by changing the tick interval.

    ``multiplier = 2.0`` makes the simulation run twice as fast.
    ``multiplier = 0.5`` slows it to half speed.
    """
    global effective_interval
    multiplier = max(0.1, min(body.multiplier, 10.0))   # clamp to [0.1, 10]
    effective_interval = TICK_INTERVAL_SECONDS / multiplier
    return {"status": "ok", "effective_interval": effective_interval, "multiplier": multiplier}


@app.post("/api/run-benchmark")
async def run_benchmark() -> Dict[str, str]:
    """Run the simulation benchmark script and return when complete."""
    script_path = os.path.join(os.path.dirname(__file__), "scripts", "simulate_and_plot.py")
    proc = await asyncio.create_subprocess_exec(
        sys.executable, script_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    
    if proc.returncode == 0:
        return {"status": "success", "message": "Benchmark completed"}
    else:
        return {"status": "error", "message": stderr.decode()}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok", "tick": str(fleet_manager.current_time)}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
