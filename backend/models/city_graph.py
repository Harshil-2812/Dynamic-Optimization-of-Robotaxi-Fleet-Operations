# city_graph.py - City road network graph model (20-node London topology)
# Nodes 0-19 match exactly the frontend's CITY_NODES in cityGraph.js

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

_FREE_FLOW_SPEED: float = 60.0
_CAPACITY: float = 100.0
_INIT_DENSITY: float = 0.1

# ---------------------------------------------------------------------------
# 20 London nodes — coordinates in (lat, lng), matching frontend cityGraph.js
# ---------------------------------------------------------------------------
_LONDON_NODES: List[Dict[str, Any]] = [
    {"id": 0,  "name": "City Hall",               "type": "civic",        "lat": 51.5055, "lng": -0.0754},
    {"id": 1,  "name": "London Bridge Stn",        "type": "transit_hub",  "lat": 51.5048, "lng": -0.0883},
    {"id": 2,  "name": "Canary Wharf",             "type": "commercial",   "lat": 51.5054, "lng": -0.0235},
    {"id": 3,  "name": "Oxford Street",            "type": "commercial",   "lat": 51.5152, "lng": -0.1415},
    {"id": 4,  "name": "King's Cross",             "type": "transit_hub",  "lat": 51.5308, "lng": -0.1238},
    {"id": 5,  "name": "University of London",     "type": "education",    "lat": 51.5218, "lng": -0.1296},
    {"id": 6,  "name": "Tech City (Shoreditch)",   "type": "commercial",   "lat": 51.5257, "lng": -0.0814},
    {"id": 7,  "name": "Heathrow Airport",         "type": "transit_hub",  "lat": 51.4700, "lng": -0.4543},
    {"id": 8,  "name": "Stratford",               "type": "transit_hub",  "lat": 51.5416, "lng":  0.0040},
    {"id": 9,  "name": "O2 Arena",                "type": "entertainment", "lat": 51.5030, "lng":  0.0032},
    {"id": 10, "name": "St Thomas Hospital",       "type": "medical",      "lat": 51.4985, "lng": -0.1193},
    {"id": 11, "name": "Greenwich",               "type": "residential",  "lat": 51.4826, "lng": -0.0077},
    {"id": 12, "name": "Canary Wharf Pier",        "type": "transit_hub",  "lat": 51.5031, "lng": -0.0178},
    {"id": 13, "name": "Battersea",               "type": "industrial",   "lat": 51.4816, "lng": -0.1449},
    {"id": 14, "name": "Notting Hill",            "type": "residential",  "lat": 51.5130, "lng": -0.1960},
    {"id": 15, "name": "Victoria Station",         "type": "transit_hub",  "lat": 51.4965, "lng": -0.1447},
    {"id": 16, "name": "Science Museum",           "type": "civic",        "lat": 51.4978, "lng": -0.1745},
    {"id": 17, "name": "Hampstead",               "type": "residential",  "lat": 51.5560, "lng": -0.1784},
    {"id": 18, "name": "Richmond Park",           "type": "utility",      "lat": 51.4408, "lng": -0.2760},
    {"id": 19, "name": "Royal Docks",             "type": "transit_hub",  "lat": 51.5094, "lng":  0.0484},
]

# Edges matching frontend CITY_EDGES — bidirectional
_LONDON_EDGES: List[Tuple[int, int]] = [
    (0, 1), (0, 6), (0, 10),
    (1, 2), (1, 6), (1, 10), (1, 12),
    (2, 9), (2, 12), (2, 19),
    (3, 4), (3, 5), (3, 14), (3, 15), (3, 16),
    (4, 5), (4, 6), (4, 8), (4, 17),
    (5, 6), (5, 10),
    (6, 8),
    (7, 14), (7, 15),
    (8, 9), (8, 19),
    (9, 11), (9, 12),
    (10, 13), (10, 15),
    (11, 12),
    (12, 19),
    (13, 15), (13, 16), (13, 18),
    (14, 15), (14, 16), (14, 17),
    (15, 16),
    (16, 18),
    (17, 4),
]

# Earth radius in km — used for haversine distance
_R_KM: float = 6371.0


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km between two lat/lng points."""
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * _R_KM * math.asin(math.sqrt(a))


class CityGraph:
    """20-node London road network.

    Node IDs 0–19 match the frontend's CITY_NODES array exactly.
    Node coordinates are stored as lat/lng. ``get_pixel_pos`` returns
    (lat, lng) so that existing routing code stays compatible.
    """

    def __init__(self, seed: int = 42) -> None:
        self.nodes: Dict[int, Dict[str, Any]] = {}
        self.edges: Dict[int, Dict[int, Dict[str, Any]]] = {}

        self._build_nodes()
        self._build_edges()

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    def _build_nodes(self) -> None:
        for n in _LONDON_NODES:
            nid = n["id"]
            self.nodes[nid] = {
                "x": n["lat"],   # alias for legacy callers
                "y": n["lng"],
                "lat": n["lat"],
                "lng": n["lng"],
                "name": n["name"],
                "type": n["type"],
            }
            self.edges[nid] = {}

    def _build_edges(self) -> None:
        for u, v in _LONDON_EDGES:
            self._add_edge(u, v)
            self._add_edge(v, u)

    def _add_edge(self, u: int, v: int) -> None:
        """Add directed edge with distance (km) and traffic attributes."""
        nu, nv = self.nodes[u], self.nodes[v]
        dist_km = _haversine_km(nu["lat"], nu["lng"], nv["lat"], nv["lng"])
        if u not in self.edges:
            self.edges[u] = {}
        self.edges[u][v] = {
            "distance": dist_km,
            "speed": _FREE_FLOW_SPEED,
            "density": _INIT_DENSITY,
            "capacity": _CAPACITY,
            "flow": _INIT_DENSITY * _FREE_FLOW_SPEED,
        }

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def get_pixel_pos(self, node_id: int) -> Tuple[float, float]:
        """Return (lat, lng) for the node (compatible with routing callers)."""
        n = self.nodes[node_id]
        return n["lat"], n["lng"]

    def get_node_name(self, node_id: int) -> str:
        return self.nodes[node_id].get("name", str(node_id))

    def update_congestion(self, t: float) -> None:
        """Recompute edge speeds with sinusoidal demand pattern."""
        new_density: float = 0.1 + 0.4 * abs(math.sin(0.628 * t))
        new_speed: float = _FREE_FLOW_SPEED * (1.0 - min(new_density, 0.9))
        new_flow: float = new_density * new_speed
        for u in self.edges:
            for v, data in self.edges[u].items():
                data["density"] = new_density
                data["speed"] = new_speed
                data["flow"] = new_flow

    def get_travel_cost(self, i: int, j: int) -> float:
        """Travel cost c_ij = d_ij / v_ij."""
        data = self.edges[i][j]
        return data["distance"] / max(data["speed"], 1.0)

    def get_congestion_ratio(self, i: int, j: int) -> float:
        data = self.edges[i][j]
        return data["flow"] / data["capacity"]

    def to_json(self) -> Dict[str, Any]:
        nodes: List[Dict[str, Any]] = [
            {"id": n, "x": data["lat"], "y": data["lng"],
             "lat": data["lat"], "lng": data["lng"],
             "name": data["name"], "type": data["type"]}
            for n, data in self.nodes.items()
        ]
        edges: List[Dict[str, Any]] = []
        for u in self.edges:
            for v, data in self.edges[u].items():
                edges.append({
                    "source": u,
                    "target": v,
                    "congestion_ratio": self.get_congestion_ratio(u, v),
                    "distance": data["distance"],
                })
        return {"nodes": nodes, "edges": edges}
