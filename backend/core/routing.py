# routing.py - Time-dependent shortest path routing algorithms

from __future__ import annotations

import heapq
from typing import TYPE_CHECKING, List, Tuple

if TYPE_CHECKING:
    from models.city_graph import CityGraph

_FREE_FLOW_SPEED: float = 60.0   # v_f used for free-flow baseline (config.py value)

_route_cache: dict[Tuple[int, int], Tuple[List[int], float]] = {}

def clear_cache() -> None:
    """Clear the route cache."""
    global _route_cache
    _route_cache.clear()


# ---------------------------------------------------------------------------
# 1. Standard Dijkstra
# ---------------------------------------------------------------------------

def dijkstra(
    graph: "CityGraph",
    source: int,
    target: int,
) -> Tuple[List[int], float]:
    """Shortest path using travel cost  c_ij = d_ij / v_ij  (Equation 5).

    Implements a standard min-heap Dijkstra over the directed city graph.
    Edge weights are obtained from ``graph.get_travel_cost(u, v)`` so that
    current congestion conditions are baked into the cost at the moment of
    the call.

    Args:
        graph:  A :class:`~models.city_graph.CityGraph` instance.
        source: Integer node ID of the start node.
        target: Integer node ID of the destination node.

    Returns:
        ``(path, total_cost)`` where *path* is an ordered list of node IDs
        (inclusive of source and target) and *total_cost* is the sum of all
        edge travel costs along the path.  Returns ``([], float('inf'))`` if
        no path exists or if source == target immediately.
    """
    if source == target:
        return [source], 0.0

    if (source, target) in _route_cache:
        return _route_cache[(source, target)]

    # dist[n] = best known cost from source to n
    dist: dict[int, float] = {source: 0.0}
    prev: dict[int, int | None] = {source: None}

    # min-heap entries: (cost, node)
    heap: List[Tuple[float, int]] = [(0.0, source)]

    visited: set[int] = set()

    while heap:
        cost, u = heapq.heappop(heap)

        if u in visited:
            continue
        visited.add(u)

        if u == target:
            break

        for v in graph.edges.get(u, {}):
            if v in visited:
                continue
            edge_cost = graph.get_travel_cost(u, v)
            new_cost = cost + edge_cost
            if new_cost < dist.get(v, float("inf")):
                dist[v] = new_cost
                prev[v] = u
                heapq.heappush(heap, (new_cost, v))

    # Reconstruct path
    if target not in dist:
        result = ([], float("inf"))
        _route_cache[(source, target)] = result
        return result

    path: List[int] = []
    node: int | None = target
    while node is not None:
        path.append(node)
        node = prev.get(node)
    path.reverse()

    if path[0] != source:
        result = ([], float("inf"))
        _route_cache[(source, target)] = result
        return result

    result = (path, dist[target])
    _route_cache[(source, target)] = result
    return result


# ---------------------------------------------------------------------------
# 2. Time-dependent Dijkstra
# ---------------------------------------------------------------------------

def time_dependent_dijkstra(
    graph: "CityGraph",
    source: int,
    target: int,
    departure_time: float,
) -> Tuple[List[int], float, float, float]:
    """Time-dependent shortest path accounting for evolving congestion.

    At each edge relaxation the algorithm estimates the wall-clock arrival
    time at the neighbour node and calls ``graph.update_congestion(t)`` to
    obtain the instantaneous edge speed before computing the cost.  This
    implements the time-dependent travel-cost extension of Equation 5.

    Delay is computed as:

    .. code-block::

        delay = actual_travel_time - free_flow_time          (Equation 13)

    where *free_flow_time* assumes every edge is traversed at ``v_f = 60.0``
    with no congestion.

    Args:
        graph:          A :class:`~models.city_graph.CityGraph` instance.
        source:         Start node ID.
        target:         Destination node ID.
        departure_time: Simulation time at which the vehicle departs.

    Returns:
        ``(path, actual_travel_time, free_flow_time, delay)``
        Returns ``([], float('inf'), float('inf'), 0.0)`` if no path exists.
    """
    if source == target:
        return [source], 0.0, 0.0, 0.0

    # Heap entry: (accumulated_cost, arrival_time_at_node, node)
    INF = float("inf")

    dist: dict[int, float] = {source: 0.0}
    arrival: dict[int, float] = {source: departure_time}
    prev: dict[int, int | None] = {source: None}

    heap: List[Tuple[float, float, int]] = [(0.0, departure_time, source)]
    visited: set[int] = set()

    while heap:
        cost, t_arrive, u = heapq.heappop(heap)

        if u in visited:
            continue
        visited.add(u)

        if u == target:
            break

        # Update congestion state to reflect the estimated arrival time at u
        graph.update_congestion(t_arrive)

        for v in graph.edges.get(u, {}):
            if v in visited:
                continue
            edge_cost = graph.get_travel_cost(u, v)          # uses updated speed
            new_cost = cost + edge_cost
            new_arrival = t_arrive + edge_cost

            if new_cost < dist.get(v, INF):
                dist[v] = new_cost
                arrival[v] = new_arrival
                prev[v] = u
                heapq.heappush(heap, (new_cost, new_arrival, v))

    if target not in dist:
        return [], INF, INF, 0.0

    # Reconstruct path
    path: List[int] = []
    node: int | None = target
    while node is not None:
        path.append(node)
        node = prev.get(node)
    path.reverse()

    if path[0] != source:
        return [], INF, INF, 0.0

    actual_travel_time: float = dist[target]

    free_flow_time: float = sum(
        graph.edges[path[k]][path[k + 1]]["distance"] / _FREE_FLOW_SPEED
        for k in range(len(path) - 1)
    )

    delay: float = actual_travel_time - free_flow_time       # Equation 13

    return path, actual_travel_time, free_flow_time, delay


# ---------------------------------------------------------------------------
# 3. Route interpolation
# ---------------------------------------------------------------------------

def interpolate_position(
    node_a: int,
    node_b: int,
    progress: float,
    graph: "CityGraph",
) -> Tuple[float, float]:
    """Linearly interpolate a pixel position between two adjacent route nodes.

    Used by the frontend to animate smooth vehicle movement.  When
    ``progress == 0.0`` the returned point equals the pixel position of
    *node_a*; when ``progress == 1.0`` it equals *node_b*.

    Args:
        node_a:   Starting node ID (vehicle's current node).
        node_b:   Next node ID in the vehicle's route.
        progress: Interpolation factor in [0.0, 1.0].
        graph:    A :class:`~models.city_graph.CityGraph` instance.

    Returns:
        ``(x, y)`` pixel coordinate of the interpolated position.
    """
    x_a, y_a = graph.get_pixel_pos(node_a)
    x_b, y_b = graph.get_pixel_pos(node_b)

    # Clamp progress to valid range
    t = max(0.0, min(1.0, progress))

    x = x_a + t * (x_b - x_a)
    y = y_a + t * (y_b - y_a)
    return x, y
