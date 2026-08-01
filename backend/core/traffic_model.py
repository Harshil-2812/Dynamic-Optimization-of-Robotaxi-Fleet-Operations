# traffic_model.py - Dynamic traffic condition modelling

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING, Dict, List

from config import TICK_INTERVAL_SECONDS

if TYPE_CHECKING:
    from models.city_graph import CityGraph
    from models.vehicle import Vehicle

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_FREE_FLOW_SPEED: float = 60.0   # v_f (km/h equivalent in graph units)
_CAPACITY: float = 100.0          # road capacity per edge (matches CityGraph init)
_RHO_MIN: float = 0.05            # minimum clamp for density
_RHO_MAX: float = 0.95            # maximum clamp for density


class TrafficModel:
    """Dynamic traffic state manager for the robotaxi city network.

    Maintains per-edge traffic state and implements the BPR / Greenshields
    update cycle at every simulation tick.

    **Equations implemented:**

    - **Eq. 4**: Network G = (V, E) — represented by the injected CityGraph.
    - **Eq. 5**: c_ij = d_ij / v_ij — travel cost (delegated to
      :meth:`~models.city_graph.CityGraph.get_travel_cost`).
    - **Eq. 6**: f_ij = ρ_ij · v_ij — traffic flow.
    - **Eq. 7**: ρ_ij(t+1) = ρ_ij(t) + Δt·(q_in − q_out) — density update.
    - **Eq. 8**: θ = flow / capacity — congestion ratio.
    - **Eq. 20**: L = Σ ρ_ij — total network traffic load.
    """

    def __init__(self, graph: "CityGraph") -> None:
        """
        Args:
            graph: The shared :class:`~models.city_graph.CityGraph` instance.
        """
        self.graph = graph

    # ------------------------------------------------------------------
    # Primary update
    # ------------------------------------------------------------------

    def update(self, t: float, active_vehicles: List["Vehicle"]) -> None:
        """Advance traffic state by one tick.

        For every directed edge (u → v) the method:

        1. Counts how many active vehicles are *leaving* node u (q_out) and
           *arriving* at node v (q_in) based on their current route heads.
        2. Applies the density update rule (Equation 7):
           ``ρ(t+1) = ρ(t) + Δt · (q_in − q_out)``
        3. Clamps density to ``[_RHO_MIN, _RHO_MAX]``.
        4. Applies the Greenshields model: ``v = v_f · (1 − ρ)``.
        5. Recomputes flow (Equation 6): ``f = ρ · v``.
        6. Calls ``graph.update_congestion(t)`` to overlay the sinusoidal
           base pattern on top of the vehicle-driven changes.

        Args:
            t:               Current simulation time step.
            active_vehicles: All :class:`~models.vehicle.Vehicle` objects
                             that are currently dispatched / in transit.
        """
        # ----------------------------------------------------------------
        # Build per-node vehicle flow counters from active route heads
        # ----------------------------------------------------------------
        # q_out[u] = vehicles departing node u this tick
        # q_in[v]  = vehicles arriving at node v this tick
        q_out: Dict[int, float] = defaultdict(float)
        q_in: Dict[int, float] = defaultdict(float)

        for vehicle in active_vehicles:
            if not vehicle.route or vehicle.status == "idle":
                continue
            current_node = vehicle.node
            next_node = vehicle.route[0] if vehicle.route else None
            if next_node is not None and current_node in self.graph.edges and next_node in self.graph.edges[current_node]:
                q_out[current_node] += 1.0
                q_in[next_node] += 1.0

        # ----------------------------------------------------------------
        # Per-edge density / speed / flow update
        # ----------------------------------------------------------------
        dt = TICK_INTERVAL_SECONDS

        for u in self.graph.edges:
            for v, data in self.graph.edges[u].items():
                rho = data["density"]
    
                # Equation 7: ρ(t+1) = ρ(t) + Δt·(q_in − q_out)
                # Normalise flows by capacity so they stay in a meaningful range
                delta_rho = dt * (q_in[v] - q_out[u]) / _CAPACITY
                rho = rho + delta_rho
    
                # Clamp density
                rho = max(_RHO_MIN, min(_RHO_MAX, rho))
    
                # Greenshields speed model: v = v_f * (1 − ρ)
                speed = _FREE_FLOW_SPEED * (1.0 - rho)
    
                # Equation 6: f = ρ · v
                flow = rho * speed
    
                data["density"] = rho
                data["speed"] = speed
                data["flow"] = flow

        # Apply sinusoidal base pattern last so the two effects combine
        self.graph.update_congestion(t)

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------

    def get_congestion_map(self) -> Dict[str, float]:
        """Congestion ratio for every edge (Equation 8: θ = flow / capacity).

        Used by the frontend to colour-code road segments.

        Returns:
            Dict keyed by ``"source_target"`` (e.g. ``"3_14"``) mapped to
            the dimensionless congestion ratio θ ∈ [0, 1+].
        """
        return {
            f"{u}_{v}": self.graph.get_congestion_ratio(u, v)
            for u in self.graph.edges for v in self.graph.edges[u]
        }

    def get_traffic_load(self) -> float:
        """Total network traffic load (Equation 20: L = Σ ρ_ij).

        Returns:
            Sum of density values across all directed edges.  Higher values
            indicate a more congested network overall.
        """
        return sum(
            data["density"]
            for u in self.graph.edges for v, data in self.graph.edges[u].items()
        )
