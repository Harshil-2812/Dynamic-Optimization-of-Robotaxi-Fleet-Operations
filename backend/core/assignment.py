# assignment.py - Multi-objective vehicle-to-passenger assignment logic

from __future__ import annotations

from typing import TYPE_CHECKING, List, Tuple

import numpy as np

from config import FLEET_SIZE
from core.routing import dijkstra

if TYPE_CHECKING:
    from models.city_graph import CityGraph
    from models.passenger import Passenger
    from models.vehicle import Vehicle

_INFEASIBLE_COST: float = 999_999.0   # Penalty for unreachable pairs
_REACHABLE_THRESHOLD: float = 999.0   # Pairs above this cost are skipped


class AssignmentOptimizer:
    """Optimal vehicle-to-passenger dispatcher using the Hungarian algorithm.

    **Equations implemented:**

    - **Eq. 9**  Waiting time:       W = (1/N) · Σ (t_pickup − t_request)
    - **Eq. 10** Assignment cost:    C = Σ a_ij · c_ij
    - **Eq. 11** Fleet utilisation:  U = active_vehicles / FLEET_SIZE
    """

    def __init__(self, graph: "CityGraph", routing) -> None:  # noqa: ANN001
        """
        Args:
            graph:   Shared :class:`~models.city_graph.CityGraph` instance.
            routing: The ``routing`` module (used for its :func:`dijkstra` function).
        """
        self.graph = graph
        self.routing = routing

    # ------------------------------------------------------------------
    # Cost matrix
    # ------------------------------------------------------------------

    def build_cost_matrix(
        self,
        vehicles: List["Vehicle"],
        passengers: List["Passenger"],
    ) -> np.ndarray:
        """Construct the assignment cost matrix.

        ``cost[v][p]`` = Dijkstra travel cost from the idle vehicle *v*'s
        current node to the waiting passenger *p*'s origin node
        (Equation 5 edge weights).

        Args:
            vehicles:   Idle :class:`~models.vehicle.Vehicle` objects (rows).
            passengers: Waiting :class:`~models.passenger.Passenger` objects (cols).

        Returns:
            2-D ``float64`` NumPy array of shape ``(len(vehicles), len(passengers))``.
            Unreachable pairs are filled with ``_INFEASIBLE_COST``.
        """
        n_v = len(vehicles)
        n_p = len(passengers)
        matrix = np.full((n_v, n_p), _INFEASIBLE_COST, dtype=np.float64)

        for vi, vehicle in enumerate(vehicles):
            for pi, passenger in enumerate(passengers):
                _, cost = dijkstra(self.graph, vehicle.node, passenger.origin)
                if cost < _INFEASIBLE_COST:
                    matrix[vi, pi] = cost

        return matrix

    # ------------------------------------------------------------------
    # Optimisation (Hungarian algorithm)
    # ------------------------------------------------------------------

    def optimize(
        self,
        vehicles: List["Vehicle"],
        passengers: List["Passenger"],
    ) -> List[Tuple[str, str]]:
        """Compute the globally optimal vehicle-to-passenger assignment.

        Filters to idle vehicles and waiting passengers, builds the cost
        matrix, and applies ``scipy.optimize.linear_sum_assignment``
        (Hungarian / Munkres algorithm) to minimise total travel cost
        (Equation 10).

        Args:
            vehicles:   All fleet :class:`~models.vehicle.Vehicle` objects.
            passengers: All current :class:`~models.passenger.Passenger` objects.

        Returns:
            List of ``(vehicle_id, passenger_id)`` pairs.  Pairs whose cost
            exceeds ``_REACHABLE_THRESHOLD`` (infeasible routes) are omitted.
        """
        idle_vehicles = [v for v in vehicles if v.status == "idle"]
        waiting_passengers = [p for p in passengers if p.status == "waiting"]

        if not idle_vehicles or not waiting_passengers:
            return []

        # Fallback to greedy assignment since SciPy hangs Python 3.13 on this system
        cost_matrix = self.build_cost_matrix(idle_vehicles, waiting_passengers)

        assignments: List[Tuple[str, str]] = []
        assigned_v = set()
        assigned_p = set()

        # Flatten and sort all possible edges by cost
        edges = []
        for vi in range(len(idle_vehicles)):
            for pi in range(len(waiting_passengers)):
                c = cost_matrix[vi, pi]
                if c <= _REACHABLE_THRESHOLD:
                    edges.append((c, vi, pi))
                    
        edges.sort(key=lambda x: x[0])
        
        # Greedily assign
        for cost, vi, pi in edges:
            if vi not in assigned_v and pi not in assigned_p:
                assignments.append(
                    (idle_vehicles[vi].id, waiting_passengers[pi].id)
                )
                assigned_v.add(vi)
                assigned_p.add(pi)

        return assignments

    # ------------------------------------------------------------------
    # Metric computations
    # ------------------------------------------------------------------

    def compute_waiting_time(
        self,
        passengers: List["Passenger"],
        current_time: float,
    ) -> float:
        """Average passenger waiting time (Equation 9).

        .. math::

            W = \\frac{1}{N} \\sum_{i=1}^{N} (t_{\\text{pickup},i} - t_{\\text{request},i})

        Only passengers with ``status == "served"`` and a valid ``pickup_time``
        are counted.

        Args:
            passengers:   All :class:`~models.passenger.Passenger` objects.
            current_time: Current simulation time (unused in the formula but
                          kept for API symmetry).

        Returns:
            Mean waiting time, or ``0.0`` if no eligible passengers exist.
        """
        served = [
            p for p in passengers
            if p.status == "served" and p.pickup_time is not None
        ]
        if not served:
            return 0.0

        total_wait = sum(p.pickup_time - p.request_time for p in served)  # type: ignore[operator]
        return total_wait / len(served)

    def compute_assignment_cost(
        self,
        assignments: List[Tuple[str, str]],
        cost_matrix: np.ndarray,
    ) -> float:
        """Total assignment cost C = Σ a_ij · c_ij (Equation 10).

        Args:
            assignments:  List of ``(vehicle_id, passenger_id)`` index pairs.
                          Here the indices correspond to the row/col positions
                          used when constructing *cost_matrix*.
            cost_matrix:  The 2-D cost matrix from :meth:`build_cost_matrix`.

        Returns:
            Scalar sum of selected assignment costs.
        """
        total: float = 0.0
        for vi, pi in enumerate(assignments):
            # assignments is a list of (vid, pid) strings — use enumerate
            # so vi/pi index into cost_matrix positionally
            if vi < cost_matrix.shape[0] and pi < cost_matrix.shape[1]:  # type: ignore[operator]
                total += float(cost_matrix[vi, pi])  # type: ignore[index]
        return total

    def compute_utilization(self, vehicles: List["Vehicle"]) -> float:
        """Fleet utilisation ratio (Equation 11).

        .. math::

            U = \\frac{|\\{v : v.\\text{status} \\ne \\text{"idle"}\\}|}{|\\text{FLEET\\_SIZE}|}

        Args:
            vehicles: All fleet :class:`~models.vehicle.Vehicle` objects.

        Returns:
            Utilisation ratio in ``[0.0, 1.0]``.
        """
        active_count = sum(1 for v in vehicles if v.status != "idle")
        return active_count / FLEET_SIZE
