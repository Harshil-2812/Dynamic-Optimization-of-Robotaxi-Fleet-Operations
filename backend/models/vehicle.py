# vehicle.py - Vehicle data model and state representation

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any


@dataclass
class Vehicle:
    """Represents a single robotaxi vehicle and its real-time state."""

    # ------------------------------------------------------------------
    # Identity & position
    # ------------------------------------------------------------------
    id: str                          # Unique vehicle identifier, e.g. "V001"
    node: int                        # Current node index in the city graph
    x: float                         # Pixel x-coordinate for frontend rendering
    y: float                         # Pixel y-coordinate for frontend rendering

    # ------------------------------------------------------------------
    # Operational state
    # ------------------------------------------------------------------
    status: str                      # One of: "idle" | "dispatched" | "pickup" | "dropoff"
    passenger_id: Optional[str]      # ID of the assigned passenger; None when idle
    route: List[int]                 # Ordered list of remaining node IDs to traverse
    route_progress: float            # Interpolation fraction (0.0–1.0) between current and next node

    # ------------------------------------------------------------------
    # Physical properties
    # ------------------------------------------------------------------
    speed: float                     # Current travel speed (city-graph units per time step)
    energy_used: float               # Cumulative energy consumed (kWh) since simulation start
    color: str                       # Hex colour string for UI marker, e.g. "#00BFFF"

    # ------------------------------------------------------------------
    # Statistics
    # ------------------------------------------------------------------
    trips_completed: int = 0         # Number of passenger trips successfully completed

    # ------------------------------------------------------------------
    # Methods
    # ------------------------------------------------------------------

    def assign(self, passenger_id: str, route: List[int]) -> None:
        """Assign a passenger to this vehicle and send it en-route.

        Args:
            passenger_id: Identifier of the passenger being picked up.
            route:        Ordered list of node IDs leading to the passenger
                          (and onward to the drop-off destination).
        """
        self.passenger_id = passenger_id
        self.route = list(route)
        self.route_progress = 0.0
        self.status = "dispatched"

    def complete_trip(self) -> None:
        """Mark the current trip as finished and return the vehicle to idle."""
        self.trips_completed += 1
        self.passenger_id = None
        self.route = []
        self.route_progress = 0.0
        self.status = "idle"

    def to_dict(self) -> Dict[str, Any]:
        """Serialise all fields to a plain dict suitable for JSON responses."""
        return {
            "id":              self.id,
            "node":            self.node,
            "x":               self.x,
            "y":               self.y,
            "status":          self.status,
            "passenger_id":    self.passenger_id,
            "route":           self.route,
            "route_progress":  self.route_progress,
            "speed":           self.speed,
            "energy_used":     self.energy_used,
            "trips_completed": self.trips_completed,
            "color":           self.color,
        }
