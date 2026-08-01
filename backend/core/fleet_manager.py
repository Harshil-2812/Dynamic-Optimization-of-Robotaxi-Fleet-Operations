# fleet_manager.py - High-level fleet state management and coordination

from __future__ import annotations

import random
import math
from typing import Any, Dict, List, Optional

import core.routing as routing_module
from config import FLEET_SIZE, ROLLING_HORIZON, TICK_INTERVAL_SECONDS
from core.assignment import AssignmentOptimizer
from core.demand_model import DemandModel
from core.energy import EnergyModel
from core.rolling_horizon import RollingHorizonController
from core.routing import interpolate_position
from core.traffic_model import TrafficModel
from metrics.tracker import PerformanceTracker
from models.city_graph import CityGraph
from models.passenger import Passenger
from models.vehicle import Vehicle
from simulation.baseline import BaselineSystem

_VEHICLE_COLORS: List[str] = [
    "#00BCD4", "#2196F3", "#9C27B0", "#E91E63",
    "#FF5722", "#4CAF50", "#FF9800", "#03A9F4",
    "#8BC34A", "#F44336",
]


class FleetManager:
    """Central orchestrator for the robotaxi simulation."""

    def __init__(self) -> None:
        self._init_systems()

    def _init_systems(self) -> None:
        self.graph = CityGraph()
        self.traffic_model = TrafficModel(self.graph)
        self.demand_model = DemandModel(self.graph)
        self.assignment_optimizer = AssignmentOptimizer(self.graph, routing_module)
        self.rolling_horizon = RollingHorizonController(
            self.assignment_optimizer, routing_module, self.graph
        )
        self.energy_model = EnergyModel()
        self.tracker = PerformanceTracker()
        self.baseline = BaselineSystem(self.graph)

        self.current_time: float = 0.0
        self.interval: int = 0
        self.vehicles: Dict[str, Vehicle] = {}
        self.passengers: Dict[str, Passenger] = {}
        self._step_delays: List[float] = []
        self._step_assignments: List[Any] = []
        self._tick_count: int = 0

        # Event queue — flushed each get_state() call
        self._pending_events: List[Dict[str, Any]] = []

        self._spawn_fleet()

    def _spawn_fleet(self) -> None:
        node_ids = list(self.graph.nodes.keys())
        for i in range(FLEET_SIZE):
            node = random.choice(node_ids)
            lat, lng = self.graph.get_pixel_pos(node)
            color = _VEHICLE_COLORS[i % len(_VEHICLE_COLORS)]
            v = Vehicle(
                id=f"V{i:03d}",
                node=node,
                x=lat,
                y=lng,
                status="idle",
                passenger_id=None,
                route=[],
                route_progress=0.0,
                speed=60.0,
                energy_used=0.0,
                color=color,
            )
            self.vehicles[v.id] = v

    # ------------------------------------------------------------------
    # Event helpers
    # ------------------------------------------------------------------

    def _emit(self, event_type: str, **kwargs: Any) -> None:
        """Push an event dict onto the pending queue."""
        self._pending_events.append({
            "type": event_type,
            "tick": self.current_time,
            **kwargs,
        })

    def emit_dispatched(self, vehicle_id: str, passenger_id: str) -> None:
        v = self.vehicles.get(vehicle_id)
        p = self.passengers.get(passenger_id)
        if v and p:
            self._emit(
                "ride_dispatched",
                vehicle_id=vehicle_id,
                passenger_id=passenger_id,
                origin=p.origin,
                destination=p.destination,
                origin_name=self.graph.get_node_name(p.origin),
                destination_name=self.graph.get_node_name(p.destination),
            )

    # ------------------------------------------------------------------
    # Vehicle movement
    # ------------------------------------------------------------------

    def advance_vehicles(self) -> None:
        t = self.current_time

        for vehicle in self.vehicles.values():
            if vehicle.status == "idle" or not vehicle.route:
                continue

            passenger: Optional[Passenger] = (
                self.passengers.get(vehicle.passenger_id)
                if vehicle.passenger_id else None
            )

            vehicle.route_progress += 0.3

            if vehicle.route_progress >= 1.0:
                prev_node = vehicle.node
                next_node = vehicle.route[0]

                # Accrue energy
                if prev_node in self.graph.edges and next_node in self.graph.edges[prev_node]:
                    edge = self.graph.edges[prev_node][next_node]
                    trip_energy = self.energy_model.compute_trip_energy(
                        edge["distance"], edge["speed"]
                    )
                    vehicle.energy_used += trip_energy["fuel"]

                vehicle.node = next_node
                vehicle.route.pop(0)
                vehicle.route_progress = 0.0
                lat, lng = self.graph.get_pixel_pos(vehicle.node)
                vehicle.x, vehicle.y = lat, lng

                # Pickup trigger
                if (
                    vehicle.status == "dispatched"
                    and passenger is not None
                    and vehicle.node == passenger.origin
                ):
                    passenger.pickup(t)
                    vehicle.status = "pickup"
                    self._emit(
                        "vehicle_at_pickup",
                        vehicle_id=vehicle.id,
                        passenger_id=passenger.id,
                        node=passenger.origin,
                        node_name=self.graph.get_node_name(passenger.origin),
                        destination=passenger.destination,
                        destination_name=self.graph.get_node_name(passenger.destination),
                        waiting_time=passenger.waiting_time,
                    )

                # Drop-off trigger
                if (
                    vehicle.status == "pickup"
                    and passenger is not None
                    and vehicle.node == passenger.destination
                ):
                    # Compute route distance (km) for stats
                    distance_km = self._compute_trip_distance(passenger)
                    passenger.dropoff(t)
                    vehicle.complete_trip()
                    vehicle.status = "idle"
                    self._emit(
                        "trip_complete",
                        vehicle_id=vehicle.id,
                        passenger_id=passenger.id,
                        origin=passenger.origin,
                        origin_name=self.graph.get_node_name(passenger.origin),
                        destination=passenger.destination,
                        destination_name=self.graph.get_node_name(passenger.destination),
                        travel_time=passenger.travel_time,
                        waiting_time=passenger.waiting_time,
                        distance_km=round(distance_km, 2),
                    )

            else:
                if vehicle.route:
                    vehicle.x, vehicle.y = interpolate_position(
                        vehicle.node, vehicle.route[0],
                        vehicle.route_progress, self.graph
                    )

    def _compute_trip_distance(self, passenger: Passenger) -> float:
        """Estimate straight-line distance between origin and destination in km."""
        try:
            no = self.graph.nodes[passenger.origin]
            nd = self.graph.nodes[passenger.destination]
            dlat = math.radians(nd["lat"] - no["lat"])
            dlng = math.radians(nd["lng"] - no["lng"])
            a = (math.sin(dlat / 2) ** 2 +
                 math.cos(math.radians(no["lat"])) *
                 math.cos(math.radians(nd["lat"])) *
                 math.sin(dlng / 2) ** 2)
            return 6371.0 * 2 * math.asin(math.sqrt(a))
        except Exception:
            return 0.0

    # ------------------------------------------------------------------
    # Simulation step
    # ------------------------------------------------------------------

    def step(self) -> Dict[str, Any]:
        self.current_time += TICK_INTERVAL_SECONDS
        self.advance_vehicles()

        new_passengers: List[Passenger] = self.demand_model.generate_requests(
            self.current_time, TICK_INTERVAL_SECONDS
        )
        for p in new_passengers:
            self.passengers[p.id] = p

        self.traffic_model.update(self.current_time, list(self.vehicles.values()))
        self._tick_count += 1

        if self._tick_count % 5 == 0:
            rh_result = self.rolling_horizon.step(
                list(self.vehicles.values()),
                new_passengers,
                self.current_time,
            )
            # Emit dispatched events for newly assigned vehicles
            for vid, pid in rh_result["assignments"]:
                self.emit_dispatched(vid, pid)

            self._step_assignments.extend(rh_result["assignments"])
            self._step_delays.append(rh_result["delta"])
            self.baseline.step(self.current_time, list(new_passengers))

        if self._tick_count % 20 == 0:
            routing_module.clear_cache()

        tick_index = int(self.current_time / TICK_INTERVAL_SECONDS)
        if tick_index % ROLLING_HORIZON == 0:
            self.interval += 1
            self.tracker.record(
                self.interval,
                list(self.vehicles.values()),
                list(self.passengers.values()),
                self.traffic_model,
                self._step_assignments,
                self._step_delays,
                self.energy_model,
            )
            self.tracker.record_baseline(
                self.interval,
                self.baseline.vehicles,
                list(self.passengers.values()),
                self.traffic_model,
                self._step_assignments,
                self._step_delays,
                self.energy_model,
            )
            self._step_assignments = []
            self._step_delays = []

        return self.get_state()

    # ------------------------------------------------------------------
    # State snapshot
    # ------------------------------------------------------------------

    def get_state(self) -> Dict[str, Any]:
        active_passengers = [
            p.to_dict()
            for p in self.passengers.values()
            if p.status not in ("served",)
        ]

        # Flush event queue
        events = list(self._pending_events)
        self._pending_events.clear()

        return {
            "tick": self.current_time,
            "vehicles": [v.to_dict() for v in self.vehicles.values()],
            "passengers": active_passengers,
            "metrics": {
                "summary": self.tracker.summary(),
            },
            "graph_congestion": self.traffic_model.get_congestion_map(),
            "events": events,
        }

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------

    def reset(self) -> None:
        self._init_systems()
        self.passengers = {}
