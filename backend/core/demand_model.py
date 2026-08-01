# demand_model.py - Stochastic demand modelling for robotaxi passengers

from __future__ import annotations

import math
import random
from typing import TYPE_CHECKING, List
from uuid import uuid4

import numpy as np

from config import ALPHA, LAMBDA_0, OMEGA
from models.passenger import Passenger

if TYPE_CHECKING:
    from models.city_graph import CityGraph


class DemandModel:
    """Stochastic passenger demand generator based on a sinusoidal Poisson process.

    The demand model captures time-of-day variation with three equations:

    - **Eq. 1** – Instantaneous demand rate λ(t)
    - **Eq. 2** – Cumulative demand D(t) = ∫₀ᵗ λ(τ)dτ
    - **Eq. 3** – Poisson arrival probability P(N = k)
    """

    def __init__(self, graph: "CityGraph") -> None:
        """
        Args:
            graph: City graph used to sample valid origin / destination nodes.
        """
        self.graph = graph
        self._node_ids: List[int] = list(graph.nodes.keys())

    # ------------------------------------------------------------------
    # Equation 1 — Demand Rate
    # ------------------------------------------------------------------

    def demand_rate(self, t: float) -> float:
        """Instantaneous demand rate λ(t) (Equation 1).

        .. math::

            λ(t) = λ_0 + α \\cdot \\sin(ω \\cdot t)

        Args:
            t: Current simulation time step.

        Returns:
            Demand rate (expected passenger arrivals per time step).
        """
        return LAMBDA_0 + ALPHA * math.sin(OMEGA * t)

    # ------------------------------------------------------------------
    # Equation 2 — Cumulative Demand
    # ------------------------------------------------------------------

    def cumulative_demand(self, t: float) -> float:
        """Cumulative expected demand D(t) = ∫₀ᵗ λ(τ)dτ  (Equation 2).
        """
        # Uses a simple Riemann sum for numerical integration
        # to avoid scipy.integrate which hangs on Py3.13 Windows
        n_steps = max(10, int(t / 0.5))
        if n_steps == 0:
            return 0.0
        dt = t / n_steps
        total = 0.0
        for i in range(n_steps):
            total += self.demand_rate(i * dt) * dt
        return total

    # ------------------------------------------------------------------
    # Equation 3 — Poisson Arrival Probability
    # ------------------------------------------------------------------

    def arrival_probability(self, k: int, t: float, lambda_t: float) -> float:
        """Probability of exactly *k* arrivals in interval *t*  (Equation 3).

        .. math::

            P(N = k) = \\frac{(λ_t \\cdot t)^k \\cdot e^{-λ_t t}}{k!}

        Args:
            k:        Number of arrivals to compute the probability for.
            t:        Length of the time interval.
            lambda_t: Demand rate during that interval (from Eq. 1).

        Returns:
            Probability mass P(N = k) in [0, 1].
        """
        lam = lambda_t * t
        return (lam ** k) * math.exp(-lam) / math.factorial(k)

    # ------------------------------------------------------------------
    # Request generator
    # ------------------------------------------------------------------

    def generate_requests(self, t: float, delta_t: float) -> List[Passenger]:
        """Sample new passenger requests for the current time window.

        Steps:
        1. Compute λ(t) using Equation 1.
        2. Draw number of arrivals from Poisson(λ(t) · Δt).
        3. For each arrival, create a :class:`~models.passenger.Passenger`
           with a random origin/destination pair drawn from the city graph.

        Args:
            t:       Current simulation time step.
            delta_t: Length of the time window (one rolling-horizon tick).

        Returns:
            List of newly generated :class:`~models.passenger.Passenger` objects.
        """
        lambda_t: float = self.demand_rate(t)
        # Ensure non-negative rate (sin can push λ below zero at low t)
        effective_rate: float = max(0.0, lambda_t * delta_t)

        num_arrivals: int = int(np.random.poisson(effective_rate))

        passengers: List[Passenger] = []
        for _ in range(num_arrivals):
            origin = random.choice(self._node_ids)
            # Guarantee destination ≠ origin
            remaining = [n for n in self._node_ids if n != origin]
            destination = random.choice(remaining)

            passenger = Passenger(
                id=f"P{str(uuid4())[:6].upper()}",
                origin=origin,
                destination=destination,
                request_time=t,
                pickup_time=None,
                dropoff_time=None,
                assigned_vehicle=None,
                status="waiting",
                is_manual=False,
            )
            passengers.append(passenger)

        return passengers
