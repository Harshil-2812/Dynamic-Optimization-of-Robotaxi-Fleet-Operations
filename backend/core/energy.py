# energy.py - Energy consumption modelling for robotaxi fleet

from __future__ import annotations

from typing import TYPE_CHECKING, Dict, List

from config import BETA_1, BETA_2, ETA, GAMMA_1

if TYPE_CHECKING:
    from models.vehicle import Vehicle


class EnergyModel:
    """Physics-based energy and emissions calculator for individual trips and the whole fleet.

    **Equations implemented:**

    - **Eq. 15** Fuel consumption:  F  = β₁·d + β₂·v²
    - **Eq. 16** CO₂ emission:      E  = γ₁·F
    - **Eq. 17** Vehicle energy:    Ev = η·v²
    """

    # ------------------------------------------------------------------
    # Per-trip computation
    # ------------------------------------------------------------------

    def compute_trip_energy(self, distance: float, speed: float) -> Dict[str, float]:
        """Compute energy and emission metrics for a single trip segment.

        Uses the three energy equations from the robotaxi framework:

        .. math::

            F  &= \\beta_1 \\cdot d + \\beta_2 \\cdot v^2 \\quad &(\\text{Eq. 15}) \\\\
            E  &= \\gamma_1 \\cdot F                           \\quad &(\\text{Eq. 16}) \\\\
            Ev &= \\eta \\cdot v^2                              \\quad &(\\text{Eq. 17})

        Args:
            distance: Euclidean pixel distance travelled on the edge.
            speed:    Current edge speed (graph units per time step) at
                      the moment of traversal.

        Returns:
            Dict with keys:

            - ``"fuel"``           – Fuel consumed (Eq. 15).
            - ``"emission"``       – CO₂-equivalent emission (Eq. 16).
            - ``"vehicle_energy"`` – On-board kinetic energy draw (Eq. 17).
        """
        # Equation 15: F = β₁·d + β₂·v²
        fuel: float = BETA_1 * distance + BETA_2 * (speed ** 2)

        # Equation 16: E = γ₁·F
        emission: float = GAMMA_1 * fuel

        # Equation 17: Ev = η·v²
        vehicle_energy: float = ETA * (speed ** 2)

        return {
            "fuel": fuel,
            "emission": emission,
            "vehicle_energy": vehicle_energy,
        }

    # ------------------------------------------------------------------
    # Fleet-level aggregation
    # ------------------------------------------------------------------

    def compute_fleet_energy(self, vehicles: List["Vehicle"]) -> Dict[str, float]:
        """Aggregate energy statistics across the entire fleet.

        Reads the ``energy_used`` field that the simulator accumulates on
        each :class:`~models.vehicle.Vehicle` over its lifetime, then
        derives fleet-level fuel and emission totals using Equations 15–16
        in inverse form (treating ``energy_used`` as the total fuel proxy).

        Args:
            vehicles: All fleet :class:`~models.vehicle.Vehicle` objects.

        Returns:
            Dict with keys:

            - ``"total_fuel"``     – Sum of ``energy_used`` across all vehicles.
            - ``"total_emission"`` – Fleet emission = γ₁ · total_fuel (Eq. 16).
            - ``"total_energy"``   – Same as ``total_fuel`` (direct accumulator).
        """
        total_fuel: float = sum(v.energy_used for v in vehicles)
        total_emission: float = GAMMA_1 * total_fuel   # Equation 16 at fleet scale
        total_energy: float = total_fuel               # energy_used is the fuel accumulator

        return {
            "total_fuel": total_fuel,
            "total_emission": total_emission,
            "total_energy": total_energy,
        }
