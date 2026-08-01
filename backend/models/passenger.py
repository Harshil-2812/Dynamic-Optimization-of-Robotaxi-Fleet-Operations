# passenger.py - Passenger data model and trip request representation

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class Passenger:
    """Represents a passenger trip request and its lifecycle state."""

    # ------------------------------------------------------------------
    # Identity & trip nodes
    # ------------------------------------------------------------------
    id: str                            # Unique passenger identifier, e.g. "P001"
    origin: int                        # Node ID where the passenger requests pickup
    destination: int                   # Node ID the passenger wants to reach

    # ------------------------------------------------------------------
    # Timing
    # ------------------------------------------------------------------
    request_time: float                # Simulation clock time when the request was made
    pickup_time: Optional[float]       # Simulation time of actual vehicle pickup; None until then
    dropoff_time: Optional[float]      # Simulation time of drop-off; None until then

    # ------------------------------------------------------------------
    # Assignment
    # ------------------------------------------------------------------
    assigned_vehicle: Optional[str]    # ID of the vehicle assigned; None until dispatched

    # ------------------------------------------------------------------
    # Status flags
    # ------------------------------------------------------------------
    status: str                        # "waiting" | "assigned" | "onboard" | "served" | "manual"
    is_manual: bool                    # True if the booking came in through the UI

    # ------------------------------------------------------------------
    # Computed properties
    # ------------------------------------------------------------------

    @property
    def waiting_time(self) -> Optional[float]:
        """Elapsed time between the request and vehicle pickup.

        Returns:
            Seconds waited, or None if the passenger has not yet been picked up.
        """
        if self.pickup_time is None:
            return None
        return self.pickup_time - self.request_time

    @property
    def travel_time(self) -> Optional[float]:
        """In-vehicle travel time from pickup to drop-off.

        Returns:
            Seconds in transit, or None if the trip is not yet complete.
        """
        if self.pickup_time is None or self.dropoff_time is None:
            return None
        return self.dropoff_time - self.pickup_time

    # ------------------------------------------------------------------
    # State-transition methods
    # ------------------------------------------------------------------

    def assign(self, vehicle_id: str) -> None:
        """Record which vehicle was dispatched and mark the passenger as assigned.

        Args:
            vehicle_id: Identifier of the vehicle en-route to collect this passenger.
        """
        self.assigned_vehicle = vehicle_id
        self.status = "assigned"

    def pickup(self, t: float) -> None:
        """Record the pickup event when the vehicle arrives at the origin node.

        Args:
            t: Current simulation clock time.
        """
        self.pickup_time = t
        self.status = "onboard"

    def dropoff(self, t: float) -> None:
        """Record the drop-off event when the vehicle reaches the destination node.

        Args:
            t: Current simulation clock time.
        """
        self.dropoff_time = t
        self.status = "served"

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:
        """Return all fields as a plain dict suitable for JSON serialisation."""
        return {
            "id":               self.id,
            "origin":           self.origin,
            "destination":      self.destination,
            "request_time":     self.request_time,
            "pickup_time":      self.pickup_time,
            "dropoff_time":     self.dropoff_time,
            "assigned_vehicle": self.assigned_vehicle,
            "status":           self.status,
            "is_manual":        self.is_manual,
            "waiting_time":     self.waiting_time,
            "travel_time":      self.travel_time,
        }
