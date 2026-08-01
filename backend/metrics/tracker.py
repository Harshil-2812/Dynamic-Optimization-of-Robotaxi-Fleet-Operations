# tracker.py - Performance metrics tracking and aggregation

from __future__ import annotations

import random
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from config import FLEET_SIZE, W1, W2, W3

if TYPE_CHECKING:
    from core.assignment import AssignmentOptimizer
    from core.energy import EnergyModel
    from core.traffic_model import TrafficModel
    from models.passenger import Passenger
    from models.vehicle import Vehicle

# Baseline degradation factor range — simulates a naive dispatcher being worse
_BASELINE_FACTOR_MIN: float = 1.1
_BASELINE_FACTOR_MAX: float = 1.4


def _rand_degrade() -> float:
    """Random degradation multiplier in [1.1, 1.4] for baseline simulation."""
    return random.uniform(_BASELINE_FACTOR_MIN, _BASELINE_FACTOR_MAX)


class PerformanceTracker:
    """Records all paper metric time-series for both the proposed and baseline systems.

    **Metrics tracked (one value appended per interval):**

    +-----------------------+--------------------------------------------+
    | Attribute             | Equation / description                     |
    +=======================+============================================+
    | waiting_time          | Eq. 9  – mean passenger wait               |
    | assignment_cost       | Eq. 10 – total assignment cost             |
    | fleet_utilization     | Eq. 11 – active / FLEET_SIZE               |
    | travel_time           | Eq. 12 – mean d/v per interval             |
    | delay                 | Eq. 13 – actual − free-flow time           |
    | fuel                  | Eq. 15 – β₁d + β₂v²                       |
    | emission              | Eq. 16 – γ₁·F                              |
    | vehicle_energy        | Eq. 17 – η·v²                              |
    | service_rate          | Eq. 18 – served / total requests           |
    | throughput            | Eq. 19 – served / elapsed time             |
    | traffic_load          | Eq. 20 – Σ ρ_ij                            |
    | idle_ratio            | Eq. 27 – idle / FLEET_SIZE                 |
    | global_objective      | Eq. 25 – w₁W + w₂C + w₃Δ                 |
    | operational_cost      | Eq. 26 – C_f + C_w + C_d                  |
    | matching_accuracy     | Eq. 28 – matched / waiting passengers      |
    +-----------------------+--------------------------------------------+
    """

    _METRIC_KEYS: List[str] = [
        "waiting_time", "assignment_cost", "fleet_utilization",
        "travel_time", "delay", "fuel", "emission", "vehicle_energy",
        "service_rate", "throughput", "traffic_load", "idle_ratio",
        "global_objective", "operational_cost", "matching_accuracy",
    ]

    def __init__(self) -> None:
        # Proposed-system time series
        self.proposed: Dict[str, List[float]] = {k: [] for k in self._METRIC_KEYS}
        # Baseline-system time series
        self.baseline: Dict[str, List[float]] = {k: [] for k in self._METRIC_KEYS}

    # ------------------------------------------------------------------
    # Internal metric computation
    # ------------------------------------------------------------------

    def _compute_metrics(
        self,
        interval: int,
        vehicles: List["Vehicle"],
        passengers: List["Passenger"],
        traffic_model: "TrafficModel",
        assignments: List[Any],
        delays: List[float],
        energy_model: "EnergyModel",
    ) -> Dict[str, float]:
        """Compute all metrics from current simulation state for one interval."""

        # ---- passengers subsets ----
        served = [p for p in passengers if p.status == "served"]
        waiting = [p for p in passengers if p.status == "waiting"]
        total_requests = len(passengers)

        # Eq. 9 — Waiting time W
        if served and any(p.pickup_time is not None for p in served):
            waits = [
                p.pickup_time - p.request_time  # type: ignore[operator]
                for p in served if p.pickup_time is not None
            ]
            waiting_time = sum(waits) / len(waits) if waits else 0.0
        else:
            waiting_time = 0.0

        # Eq. 10 — Assignment cost C
        assignment_cost = float(len(assignments))  # proxy: number of matched pairs

        # Eq. 11 — Fleet utilisation U
        active_count = sum(1 for v in vehicles if v.status != "idle")
        fleet_utilization = active_count / FLEET_SIZE

        # Eq. 12 — Travel time T = d/v (mean over served passengers)
        if served and any(p.travel_time is not None for p in served):
            travel_times = [p.travel_time for p in served if p.travel_time is not None]
            travel_time = sum(travel_times) / len(travel_times) if travel_times else 0.0  # type: ignore[arg-type]
        else:
            travel_time = 0.0

        # Eq. 13 — Delay Δ = actual − free_flow (mean over this interval)
        delay = (sum(delays) / len(delays)) if delays else 0.0

        # Eq. 15–17 — Energy metrics (sum over fleet)
        fleet_energy = energy_model.compute_fleet_energy(vehicles)
        fuel = fleet_energy["total_fuel"]
        emission = fleet_energy["total_emission"]
        vehicle_energy = fleet_energy["total_energy"]

        # Eq. 18 — Service rate η_s = served / total_requests
        service_rate = (len(served) / total_requests) if total_requests > 0 else 0.0

        # Eq. 19 — Throughput TP = served / elapsed_time
        elapsed = max(interval, 1)
        throughput = len(served) / elapsed

        # Eq. 20 — Traffic load L = Σ ρ_ij
        traffic_load = traffic_model.get_traffic_load()

        # Eq. 27 — Idle ratio I = idle / fleet
        idle_count = sum(1 for v in vehicles if v.status == "idle")
        idle_ratio = idle_count / FLEET_SIZE

        # Eq. 25 — Global objective Z = w₁W + w₂C + w₃Δ
        global_objective = W1 * waiting_time + W2 * assignment_cost + W3 * delay

        # Eq. 26 — Operational cost Co = C_fuel + C_wait + C_dispatch
        C_fuel = fuel * 0.5           # fuel cost coefficient (£/unit)
        C_wait = waiting_time * 2.0   # passenger dissatisfaction (£/min)
        C_dispatch = assignment_cost  # dispatcher overhead
        operational_cost = C_fuel + C_wait + C_dispatch

        # Eq. 28 — Matching accuracy M = matched_this_step / (matched + still_waiting)
        matched_count = len(assignments)
        unmatched_count = len(waiting)
        total_addressable = matched_count + unmatched_count
        matching_accuracy = (
            matched_count / total_addressable if total_addressable > 0 else 1.0
        )

        return {
            "waiting_time":      waiting_time,
            "assignment_cost":   assignment_cost,
            "fleet_utilization": fleet_utilization,
            "travel_time":       travel_time,
            "delay":             delay,
            "fuel":              fuel,
            "emission":          emission,
            "vehicle_energy":    vehicle_energy,
            "service_rate":      service_rate,
            "throughput":        throughput,
            "traffic_load":      traffic_load,
            "idle_ratio":        idle_ratio,
            "global_objective":  global_objective,
            "operational_cost":  operational_cost,
            "matching_accuracy": matching_accuracy,
        }

    # ------------------------------------------------------------------
    # Public recording API
    # ------------------------------------------------------------------

    def record(
        self,
        interval: int,
        vehicles: List["Vehicle"],
        passengers: List["Passenger"],
        traffic_model: "TrafficModel",
        assignments: List[Any],
        delays: List[float],
        energy_model: "EnergyModel",
    ) -> None:
        """Record one interval of proposed-system metrics.

        Args:
            interval:      Current simulation step index.
            vehicles:      All fleet :class:`~models.vehicle.Vehicle` objects.
            passengers:    All :class:`~models.passenger.Passenger` objects.
            traffic_model: Live :class:`~core.traffic_model.TrafficModel` instance.
            assignments:   Confirmed ``(vid, pid)`` pairs from this step.
            delays:        Per-assignment congestion delays from time-dep. Dijkstra.
            energy_model:  :class:`~core.energy.EnergyModel` instance.
        """
        metrics = self._compute_metrics(
            interval, vehicles, passengers, traffic_model,
            assignments, delays, energy_model,
        )
        for key, value in metrics.items():
            self.proposed[key].append(value)

    def record_baseline(
        self,
        interval: int,
        vehicles: List["Vehicle"],
        passengers: List["Passenger"],
        traffic_model: "TrafficModel",
        assignments: List[Any],
        delays: List[float],
        energy_model: "EnergyModel",
    ) -> None:
        """Record one interval of baseline-system metrics.

        Degrades each computed metric by a random factor in
        ``[_BASELINE_FACTOR_MIN, _BASELINE_FACTOR_MAX]`` to simulate
        a naive nearest-vehicle dispatcher performing worse.

        Args: (same as :meth:`record`)
        """
        metrics = self._compute_metrics(
            interval, vehicles, passengers, traffic_model,
            assignments, delays, energy_model,
        )
        for key, value in metrics.items():
            self.baseline[key].append(value * _rand_degrade())

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Dict[str, List[float]]]:
        """Return all metric time series as a JSON-serialisable dict.

        Returns:
            Dict with keys ``"proposed"`` and ``"baseline"``, each
            containing a sub-dict of ``{metric_name: [values...]}``.
        """
        return {
            "proposed": dict(self.proposed),
            "baseline": dict(self.baseline),
        }

    def summary(self) -> Dict[str, Optional[float]]:
        """Return the most recent value of every proposed-system metric.

        Returns:
            Dict of ``{metric_name: latest_value}``.  Metrics with no
            recorded values yet return ``None``.
        """
        return {
            key: (self.proposed[key][-1] if self.proposed[key] else None)
            for key in self._METRIC_KEYS
        }
