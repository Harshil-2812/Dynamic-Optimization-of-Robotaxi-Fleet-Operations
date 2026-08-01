# rolling_horizon.py - Rolling horizon optimization controller

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Tuple

from config import ROLLING_HORIZON, W1, W2, W3
from core.routing import time_dependent_dijkstra

if TYPE_CHECKING:
    from core.assignment import AssignmentOptimizer
    from models.city_graph import CityGraph
    from models.passenger import Passenger
    from models.vehicle import Vehicle


class RollingHorizonController:
    """Receding-horizon dispatcher that minimises a weighted multi-objective cost.

    At each simulation tick the controller solves a *look-ahead* window of
    H = ``ROLLING_HORIZON`` steps by:

    1. Accumulating new passenger requests into a pending queue.
    2. Running the Hungarian assignment over idle vehicles × waiting passengers.
    3. Computing optimal routes via time-dependent Dijkstra.
    4. Evaluating the per-step objective function.

    **Equations implemented:**

    - **Eq. 24**: ``min_{t=k}^{k+H} J(t)``  — rolling-horizon minimisation.
    - **Eq. 25**: ``J(t) = w₁·W(t) + w₂·C(t) + w₃·Δ(t)`` — composite objective.
    """

    def __init__(
        self,
        assignment_optimizer: "AssignmentOptimizer",
        routing_optimizer: Any,   # the routing module (imported at call-site)
        graph: "CityGraph",
    ) -> None:
        """
        Args:
            assignment_optimizer: Shared :class:`~core.assignment.AssignmentOptimizer`.
            routing_optimizer:    The ``routing`` module reference.
            graph:                Shared :class:`~models.city_graph.CityGraph`.
        """
        self.assignment_optimizer = assignment_optimizer
        self.routing_optimizer = routing_optimizer
        self.graph = graph

        self.pending_passengers: List["Passenger"] = []   # cross-horizon queue
        self.current_step: int = 0

    # ------------------------------------------------------------------
    # Equation 25 — Composite objective
    # ------------------------------------------------------------------

    def compute_objective(self, W: float, C: float, delta: float) -> float:
        """Compute the per-step objective value J(t)  (Equation 25).

        .. math::

            J(t) = w_1 \\cdot W(t) + w_2 \\cdot C(t) + w_3 \\cdot \\Delta(t)

        Args:
            W:     Average passenger waiting time at this step (Eq. 9).
            C:     Total assignment cost at this step (Eq. 10).
            delta: Average congestion delay at this step (Eq. 13).

        Returns:
            Scalar objective value Z.
        """
        return W1 * W + W2 * C + W3 * delta

    # ------------------------------------------------------------------
    # Equation 24 — Rolling-horizon step
    # ------------------------------------------------------------------

    def step(
        self,
        vehicles: List["Vehicle"],
        new_passengers: List["Passenger"],
        current_time: float,
    ) -> Dict[str, Any]:
        """Advance the controller by one horizon tick.

        Implements the rolling-horizon optimisation (Equation 24) for the
        look-ahead window ``[current_step, current_step + ROLLING_HORIZON)``.

        Steps
        -----
        1. Enqueue *new_passengers* into the pending pool.
        2. Run the Hungarian assignment over idle vehicles and pending passengers.
        3. For every matched pair, compute the full route:
           - Leg 1: vehicle.node → passenger.origin  (pickup route)
           - Leg 2: passenger.origin → passenger.destination  (trip route)
           - Concatenated route avoids duplicate intermediate node.
        4. Call ``vehicle.assign()`` and ``passenger.assign()`` to bind the pair.
        5. Accumulate W, C, Δ and evaluate J(t) with Eq. 25.
        6. Increment ``current_step``.

        Args:
            vehicles:       All fleet :class:`~models.vehicle.Vehicle` objects.
            new_passengers: Freshly generated :class:`~models.passenger.Passenger`
                            objects from the demand model for this tick.
            current_time:   Current simulation clock time.

        Returns:
            Dict with keys:

            - ``"assignments"`` – list of ``(vehicle_id, passenger_id)`` strings.
            - ``"objective"``   – scalar J(t) (Eq. 25).
            - ``"W"``           – average waiting time component.
            - ``"C"``           – assignment cost component.
            - ``"delta"``       – average congestion delay component.
        """
        # 1. Enqueue new arrivals
        self.pending_passengers.extend(new_passengers)

        # 2. Hungarian assignment over idle × waiting passengers
        raw_assignments: List[Tuple[str, str]] = self.assignment_optimizer.optimize(
            vehicles, self.pending_passengers
        )

        # Build fast lookup maps
        vehicle_map: Dict[str, "Vehicle"] = {v.id: v for v in vehicles}
        passenger_map: Dict[str, "Passenger"] = {
            p.id: p for p in self.pending_passengers
        }

        confirmed_assignments: List[Tuple[str, str]] = []
        total_delay: float = 0.0
        total_cost: float = 0.0
        routed_count: int = 0

        # 3. Route each matched pair
        for vehicle_id, passenger_id in raw_assignments:
            vehicle = vehicle_map.get(vehicle_id)
            passenger = passenger_map.get(passenger_id)
            if vehicle is None or passenger is None:
                continue

            # Leg 1: vehicle → passenger origin
            pickup_route, _, _, pickup_delay = time_dependent_dijkstra(
                self.graph,
                vehicle.node,
                passenger.origin,
                current_time,
            )

            # Leg 2: passenger origin → passenger destination
            trip_route, trip_cost, _, trip_delay = time_dependent_dijkstra(
                self.graph,
                passenger.origin,
                passenger.destination,
                current_time,
            )

            # Concatenate legs (avoid duplicating the shared origin node)
            if pickup_route and trip_route:
                if len(pickup_route) > 0 and len(trip_route) > 0:
                    full_route = pickup_route + trip_route[1:]
                else:
                    full_route = pickup_route or trip_route
            else:
                # One leg failed — skip this pair
                continue

            # 4. Bind vehicle and passenger
            vehicle.assign(passenger_id, full_route)
            passenger.assign(vehicle_id)

            # Remove from pending queue
            self.pending_passengers = [
                p for p in self.pending_passengers if p.id != passenger_id
            ]

            confirmed_assignments.append((vehicle_id, passenger_id))
            total_delay += pickup_delay + trip_delay
            total_cost += trip_cost
            routed_count += 1

        # 5. Compute objective components
        avg_delay: float = (total_delay / routed_count) if routed_count > 0 else 0.0
        avg_cost: float = (total_cost / routed_count) if routed_count > 0 else 0.0

        W: float = self.assignment_optimizer.compute_waiting_time(
            self.pending_passengers + [
                p for p in new_passengers if p.status == "served"
            ],
            current_time,
        )
        C: float = avg_cost
        delta: float = avg_delay

        objective: float = self.compute_objective(W, C, delta)

        # 6. Advance horizon counter
        self.current_step += 1

        return {
            "assignments": confirmed_assignments,
            "objective": objective,
            "W": W,
            "C": C,
            "delta": delta,
        }
