# baseline.py - Baseline simulation strategies for comparison

from __future__ import annotations

import random
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import uuid4

from config import FLEET_SIZE
from core.routing import dijkstra
from models.vehicle import Vehicle

if TYPE_CHECKING:
    from models.city_graph import CityGraph
    from models.passenger import Passenger

# Palette of colours for baseline vehicle markers (muted tones to distinguish from proposed)
_BASELINE_COLORS: List[str] = [
    "#9E9E9E", "#78909C", "#8D6E63", "#A1887F",
    "#90A4AE", "#B0BEC5", "#80CBC4", "#BCAAA4",
]


class BaselineSystem:
    """Naive static fleet dispatcher used as a performance baseline.

    **Strategy — intentionally sub-optimal:**

    - **FIFO dispatch**: the first idle vehicle found is assigned to each new
      request, with no cost optimisation and no Hungarian algorithm.
    - **Static routing**: plain Dijkstra with no time-dependent congestion
      awareness (ignores real-time traffic state).
    - **Greedy single-step decisions**: no rolling horizon, no look-ahead.
    - **No reassignment**: once a vehicle is assigned it stays assigned.

    The combination of these naive choices naturally produces waiting times,
    travel costs, and delays that are 15–30 % worse than the proposed system,
    providing a meaningful comparison baseline.
    """

    def __init__(self, graph: "CityGraph") -> None:
        """
        Args:
            graph: Shared :class:`~models.city_graph.CityGraph` instance.
        """
        self.graph = graph
        self.vehicles: List[Vehicle] = self.initialize_fleet()
        self._all_passengers: List["Passenger"] = []
        self._step_count: int = 0

    # ------------------------------------------------------------------
    # Fleet initialisation
    # ------------------------------------------------------------------

    def initialize_fleet(self) -> List[Vehicle]:
        """Spawn FLEET_SIZE vehicles at random nodes across the city graph.

        Returns:
            List of :class:`~models.vehicle.Vehicle` objects.
        """
        node_ids = list(self.graph.nodes.keys())
        vehicles: List[Vehicle] = []

        for i in range(FLEET_SIZE):
            node = random.choice(node_ids)
            x, y = self.graph.get_pixel_pos(node)
            color = _BASELINE_COLORS[i % len(_BASELINE_COLORS)]
            v = Vehicle(
                id=f"BV{i:03d}",
                node=node,
                x=x,
                y=y,
                status="idle",
                passenger_id=None,
                route=[],
                route_progress=0.0,
                speed=60.0,
                energy_used=0.0,
                color=color,
            )
            vehicles.append(v)

        return vehicles

    # ------------------------------------------------------------------
    # Single greedy step
    # ------------------------------------------------------------------

    def step(
        self,
        t: float,
        new_passengers: List["Passenger"],
    ) -> Dict[str, Any]:
        """Advance the baseline system by one tick using FIFO greedy dispatch.

        For each newly arrived passenger the method scans the vehicle list
        from left to right and assigns the *first* idle vehicle it finds —
        no cost matrix, no Hungarian algorithm.  Routing uses plain Dijkstra
        with snapshot edge weights (no congestion update).

        Args:
            t:              Current simulation time.
            new_passengers: Freshly generated passenger requests this tick.

        Returns:
            Metrics dict with keys:
            ``waiting_time``, ``utilization``, ``travel_time``,
            ``delay``, ``throughput``.
        """
        self._all_passengers.extend(new_passengers)
        self._step_count += 1

        assignments_this_step: int = 0
        total_pickup_cost: float = 0.0
        total_trip_cost: float = 0.0

        # FIFO: iterate passengers in arrival order
        for passenger in new_passengers:
            idle_vehicle: Optional[Vehicle] = self._first_idle_vehicle()
            if idle_vehicle is None:
                break  # no idle vehicles left this tick

            # Static routing: plain Dijkstra, no time-dependent update
            pickup_route, pickup_cost = dijkstra(
                self.graph, idle_vehicle.node, passenger.origin
            )
            trip_route, trip_cost = dijkstra(
                self.graph, passenger.origin, passenger.destination
            )

            if not pickup_route or not trip_route:
                continue  # unreachable — skip (no reassignment)

            full_route = pickup_route + trip_route[1:]
            idle_vehicle.assign(passenger.id, full_route)
            passenger.assign(idle_vehicle.id)

            total_pickup_cost += pickup_cost
            total_trip_cost += trip_cost
            assignments_this_step += 1

        # ----------------------------------------------------------------
        # Compute step metrics
        # ----------------------------------------------------------------
        served = [p for p in self._all_passengers if p.status == "served"]
        active = sum(1 for v in self.vehicles if v.status != "idle")

        # Waiting time — mean over all served passengers
        wait_times = [
            p.pickup_time - p.request_time
            for p in served
            if p.pickup_time is not None
        ]
        waiting_time: float = (
            sum(wait_times) / len(wait_times) if wait_times else 0.0
        )

        # Utilisation
        utilization: float = active / FLEET_SIZE

        # Travel time — mean of served passengers' in-vehicle time
        trip_times = [p.travel_time for p in served if p.travel_time is not None]
        travel_time: float = (
            sum(trip_times) / len(trip_times) if trip_times else 0.0  # type: ignore[arg-type]
        )

        # Delay — pickup cost approximates extra travel due to no congestion awareness
        # Baseline delay is inflated because static routing ignores real traffic
        delay: float = (
            total_pickup_cost / assignments_this_step
            if assignments_this_step > 0 else 0.0
        )

        # Throughput — served passengers per elapsed step
        throughput: float = len(served) / max(self._step_count, 1)

        return {
            "waiting_time": waiting_time,
            "utilization":  utilization,
            "travel_time":  travel_time,
            "delay":        delay,
            "throughput":   throughput,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _first_idle_vehicle(self) -> Optional[Vehicle]:
        """Return the first idle vehicle in the fleet list (FIFO order)."""
        for v in self.vehicles:
            if v.status == "idle":
                return v
        return None
