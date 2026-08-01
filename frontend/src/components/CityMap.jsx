// CityMap.jsx — Leaflet + D3 overlay smart city map

import * as d3 from 'd3';
import L from 'leaflet';
import React, { useEffect, useMemo, useRef } from 'react';

import {
    CITY_NODES, CITY_EDGES, METRO_LINES, BUS_ROUTES,
    NODE_COLORS, getCityNode, getPathCoords
} from '../data/cityGraph';
import useSimulationStore from '../store/simulationStore';

/* ── Preserved: congestion colour ────────────────────────────────────────── */
const colorLow = '#22c55e', colorMid = '#f59e0b', colorHigh = '#ef4444';
function congestionColor(ratio) {
    const r = Math.max(0, Math.min(1, ratio || 0));
    if (r < 0.5) return d3.interpolateRgb(colorLow, colorMid)(r * 2);
    return d3.interpolateRgb(colorMid, colorHigh)((r - 0.5) * 2);
}

/* ── Preserved: vehicle colours ──────────────────────────────────────────── */
const vehicleColor = {
    idle: '#64748b', dispatched: '#3b82f6', pickup: '#f59e0b', dropoff: '#a855f7',
};

/* ── Arrow polygon ───────────────────────────────────────────────────────── */
const ARROW = '0,-6 10,0 0,6 2,0';

/* ── Precompute enriched edges (with lat/lng of endpoints) ───────────────── */
const ENRICHED_EDGES = CITY_EDGES.map(e => ({
    ...e,
    slat: CITY_NODES[e.source].lat, slng: CITY_NODES[e.source].lng,
    tlat: CITY_NODES[e.target].lat, tlng: CITY_NODES[e.target].lng,
    key: `${e.source}_${e.target}`,
}));

export default React.memo(function CityMap() {
    const mapDivRef = useRef(null);   // the div Leaflet attaches to
    const mapRef = useRef(null);   // L.Map instance
    const svgRef = useRef(null);   // the <svg> D3 will draw in
    const heatTickRef = useRef(0);      // tick counter for heatmap throttle

    const {
        congestion, passengers,
        selectedOrigin, selectedDestination,
        activeBooking,
        showHeatmap, showRouteTrails, showVehicleLabels, showTransit,
        tick,
    } = useSimulationStore();

    /* ── Derived ─────────────────────────────────────────────────────────── */
    const passengersByNode = useMemo(() => {
        const m = {};
        passengers
            .filter(p => p.status === 'waiting' || p.status === 'assigned')
            .forEach(p => { m[p.origin % 20] = (m[p.origin % 20] || 0) + 1; });
        return m;
    }, [passengers]);

    /* ── Helpers ─────────────────────────────────────────────────────────── */
    const pt = (lat, lng) => {
        if (!mapRef.current) return { x: 0, y: 0 };
        return mapRef.current.latLngToLayerPoint([lat, lng]);
    };

    const handleNodeClick = (nodeId) => {
        const s = useSimulationStore.getState();
        if (s.selectedOrigin === null) s.setOrigin(nodeId);
        else if (s.selectedDestination === null && nodeId !== s.selectedOrigin)
            s.setDestination(nodeId);
    };

    /* ── Update all projected positions (called on zoom/pan/viewreset) ───── */
    const repositionAll = () => {
        if (!mapRef.current || !svgRef.current) return;
        const svg = d3.select(svgRef.current);

        // Nodes
        svg.select('#layer-nodes').selectAll('.node-group')
            .attr('transform', d => { const p = pt(d.lat, d.lng); return `translate(${p.x},${p.y})`; });

        // Edges
        svg.select('#layer-edges').selectAll('.city-edge')
            .attr('x1', d => pt(d.slat, d.slng).x)
            .attr('y1', d => pt(d.slat, d.slng).y)
            .attr('x2', d => pt(d.tlat, d.tlng).x)
            .attr('y2', d => pt(d.tlat, d.tlng).y);

        // Transit lines
        svg.select('#layer-transit').selectAll('.transit-line')
            .attr('points', d =>
                d.stops.map(sid => { const p = pt(CITY_NODES[sid].lat, CITY_NODES[sid].lng); return `${p.x},${p.y}`; }).join(' ')
            );
        svg.select('#layer-transit').selectAll('.transit-stop')
            .attr('transform', d => { const p = pt(d.lat, d.lng); return `translate(${p.x},${p.y})`; });
        // (Metro train overlay lines also use same points — re-set)
        svg.select('#layer-transit').selectAll('.transit-train')
            .attr('points', function () {
                return d3.select(this.parentNode).select('.transit-line').attr('points');
            });

        // Heatmap
        svg.select('#layer-heatmap').selectAll('.hm-circle')
            .attr('cx', d => pt(d.lat, d.lng).x)
            .attr('cy', d => pt(d.lat, d.lng).y);

        // Passengers
        svg.select('#layer-passengers').selectAll('.pax-group')
            .attr('transform', d => { const p = pt(d.lat, d.lng); return `translate(${p.x},${p.y})`; });

        // Vehicles — position is now interpolated between current node and next in route
        svg.select('#layer-vehicles').selectAll('.vehicle-group')
            .attr('transform', d => {
                // If moving and has next node in route, interpolate position
                if (d.route && d.route.length > 0 && d.route_progress > 0) {
                    const curNode = getCityNode(d.node);
                    const nxtNode = getCityNode(d.route[0]);
                    if (curNode && nxtNode) {
                        const t = Math.max(0, Math.min(1, d.route_progress));
                        const lat = curNode.lat + t * (nxtNode.lat - curNode.lat);
                        const lng = curNode.lng + t * (nxtNode.lng - curNode.lng);
                        const p = pt(lat, lng);
                        return `translate(${p.x},${p.y})`;
                    }
                }
                const cn = getCityNode(d.node);
                const p = pt(cn.lat, cn.lng);
                return `translate(${p.x},${p.y})`;
            });

        // Route preview
        const rp = svg.select('#layer-route-preview').select('.preview-line');
        if (!rp.empty() && rp.datum()) {
            const d = rp.datum();
            rp.attr('x1', pt(d.olat, d.olng).x).attr('y1', pt(d.olat, d.olng).y)
                .attr('x2', pt(d.dlat, d.dlng).x).attr('y2', pt(d.dlat, d.dlng).y);
        }

        // Booking path
        const bp = svg.select('#layer-booking-path').select('.booking-line');
        if (!bp.empty() && bp.datum()) {
            const d = bp.datum();
            bp.attr('x1', pt(d.olat, d.olng).x).attr('y1', pt(d.olat, d.olng).y)
                .attr('x2', pt(d.dlat, d.dlng).x).attr('y2', pt(d.dlat, d.dlng).y);
        }
    };

    /* ── Init Leaflet + SVG overlay ──────────────────────────────────────── */
    useEffect(() => {
        if (!mapDivRef.current || mapRef.current) return;

        // Leaflet map
        const map = L.map(mapDivRef.current, {
            center: [51.505, -0.09], zoom: 12, zoomControl: true,
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://carto.com/">CartoDB</a>',
            subdomains: 'abcd', maxZoom: 19,
        }).addTo(map);

        mapRef.current = map;

        // SVG overlay
        const svgLayer = L.svg().addTo(map);
        // Access the svg element added to the overlay pane
        const svgEl = mapDivRef.current.querySelector('.leaflet-overlay-pane > svg');
        svgRef.current = svgEl;

        if (!svgEl) { console.error('[CityMap] SVG overlay not found'); return; }

        const svg = d3.select(svgEl);

        // Defs: glow filters
        const defs = svg.append('defs');
        const mkGlow = (id, color) => {
            const f = defs.append('filter').attr('id', id).attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
            f.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '4').attr('result', 'blur');
            const m = f.append('feMerge');
            m.append('feMergeNode').attr('in', 'blur');
            m.append('feMergeNode').attr('in', 'SourceGraphic');
        };
        mkGlow('glow-cyan', '#00F5FF');
        mkGlow('glow-green', '#39FF14');
        mkGlow('glow-red', '#ef4444');

        // Main group (layer-zoom-hide hides on zoom anim)
        const g = svg.append('g').attr('class', 'leaflet-zoom-hide').attr('id', 'main-group');
        ['layer-heatmap', 'layer-transit', 'layer-edges', 'layer-active-routes',
            'layer-route-preview', 'layer-booking-path', 'layer-passengers', 'layer-nodes', 'layer-vehicles']
            .forEach(id => g.append('g').attr('id', id));

        /* ── Draw static city edges ── */
        g.select('#layer-edges')
            .selectAll('.city-edge')
            .data(ENRICHED_EDGES, d => d.key)
            .join('line')
            .attr('class', 'city-edge edge')
            .attr('stroke', '#334155')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.75);

        /* ── Draw transit lines ── */
        const transitLayer = g.select('#layer-transit');

        // Metro lines
        METRO_LINES.forEach(line => {
            transitLayer.append('polyline')
                .datum(line)
                .attr('class', 'transit-line')
                .attr('data-id', line.id)
                .attr('fill', 'none')
                .attr('stroke', line.color)
                .attr('stroke-width', 5)
                .attr('stroke-opacity', 0.5)
                .attr('stroke-linecap', 'round');

            // Animated "train" running along the line
            transitLayer.append('polyline')
                .datum(line)
                .attr('class', 'transit-train metro-train')
                .attr('fill', 'none')
                .attr('stroke', line.color)
                .attr('stroke-width', 7)
                .attr('stroke-opacity', 0.9)
                .attr('stroke-linecap', 'round');

            // Stop squares
            line.stops.forEach(sid => {
                const node = CITY_NODES[sid];
                transitLayer.append('g')
                    .datum(node)
                    .attr('class', 'transit-stop')
                    .append('rect')
                    .attr('x', -4).attr('y', -4).attr('width', 8).attr('height', 8)
                    .attr('fill', line.color)
                    .attr('fill-opacity', 0.8)
                    .attr('stroke', '#050A0F')
                    .attr('stroke-width', 1);
            });
        });

        // Bus routes
        BUS_ROUTES.forEach(route => {
            transitLayer.append('polyline')
                .datum(route)
                .attr('class', 'transit-line')
                .attr('data-id', route.id)
                .attr('fill', 'none')
                .attr('stroke', route.color)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '8,4')
                .attr('stroke-opacity', 0.5);

            route.stops.forEach(sid => {
                const node = CITY_NODES[sid];
                transitLayer.append('g')
                    .datum(node)
                    .attr('class', 'transit-stop')
                    .append('circle')
                    .attr('r', 4)
                    .attr('fill', route.color)
                    .attr('fill-opacity', 0.8)
                    .attr('stroke', '#050A0F')
                    .attr('stroke-width', 1);
            });
        });

        /* ── Draw city nodes ── */
        const nodeLayer = g.select('#layer-nodes');
        const nodeGroups = nodeLayer.selectAll('.node-group')
            .data(CITY_NODES, d => d.id)
            .join('g')
            .attr('class', 'node-group')
            .style('cursor', 'pointer')
            .on('click', (_, d) => handleNodeClick(d.id))
            .on('mouseenter', function (_, d) {
                const cnt = useSimulationStore.getState().passengers
                    .filter(p => (p.status === 'waiting' || p.status === 'assigned') && (p.origin % 20) === d.id).length;
                d3.select(this).append('text')
                    .attr('class', 'node-tooltip')
                    .attr('y', -16).attr('text-anchor', 'middle')
                    .attr('fill', '#00F5FF').attr('font-size', '9px')
                    .attr('font-family', 'Share Tech Mono, monospace')
                    .attr('paint-order', 'stroke')
                    .attr('stroke', '#050A0F').attr('stroke-width', '3')
                    .text(`${d.name}${cnt ? ` [${cnt}]` : ''}`);
            })
            .on('mouseleave', function () { d3.select(this).select('.node-tooltip').remove(); });

        nodeGroups.append('circle')
            .attr('class', 'node-circle')
            .attr('r', d => ['transit_hub', 'medical'].includes(d.type) ? 10 : 8)
            .attr('fill', d => NODE_COLORS[d.type] ?? '#64748b')
            .attr('fill-opacity', 0.85)
            .attr('stroke', '#050A0F').attr('stroke-width', 2);

        // Apply glow filter for key node types
        nodeGroups
            .filter(d => d.type === 'transit_hub')
            .select('.node-circle').attr('filter', 'url(#glow-cyan)');
        nodeGroups
            .filter(d => d.type === 'medical')
            .select('.node-circle').attr('filter', 'url(#glow-red)');

        // Labels for key types
        nodeGroups
            .filter(d => ['transit_hub', 'medical', 'civic'].includes(d.type))
            .append('text')
            .attr('class', 'node-label')
            .attr('y', 20).attr('text-anchor', 'middle')
            .attr('fill', '#94a3b8').attr('font-size', '8px')
            .attr('font-family', 'Share Tech Mono, monospace')
            .attr('paint-order', 'stroke')
            .attr('stroke', '#050A0F').attr('stroke-width', '3')
            .text(d => d.name);

        nodeGroups.append('title').text(d => `${d.name} (${d.type})`);

        // Initial reproject
        map.on('viewreset moveend zoomend', repositionAll);
        setTimeout(repositionAll, 100);

        return () => {
            map.off('viewreset moveend zoomend', repositionAll);
            map.remove();
            mapRef.current = null;
            svgRef.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Update edge colours on congestion change ────────────────────────── */
    useEffect(() => {
        if (!svgRef.current) return;
        d3.select(svgRef.current).select('#layer-edges')
            .selectAll('.city-edge')
            .each(function (d) {
                const ratio = congestion[d.key] ?? 0;
                d3.select(this)
                    .attr('stroke', ratio > 0.05 ? congestionColor(ratio) : '#334155')
                    .attr('stroke-width', ratio > 0.7 ? 3 : 2);
            });
    }, [congestion]);

    /* ── Transit visibility ──────────────────────────────────────────────── */
    useEffect(() => {
        if (!svgRef.current) return;
        d3.select(svgRef.current).select('#layer-transit')
            .attr('opacity', showTransit ? 1 : 0);
    }, [showTransit]);

    /* ── Node selection + demand colours ────────────────────────────────── */
    useEffect(() => {
        if (!svgRef.current) return;
        d3.select(svgRef.current).select('#layer-nodes')
            .selectAll('.node-group')
            .each(function (d) {
                const isOrigin = d.id === selectedOrigin;
                const isDest = d.id === selectedDestination;
                const demand = passengersByNode[d.id] ?? 0;
                const base = NODE_COLORS[d.type] ?? '#64748b';

                let fill = base;
                let stroke = '#050A0F';
                let strokeW = 2;
                let filterV = null;

                if (isOrigin) { fill = '#39FF14'; stroke = '#39FF14'; strokeW = 3; filterV = 'url(#glow-green)'; }
                else if (isDest) { fill = '#00F5FF'; stroke = '#00F5FF'; strokeW = 3; filterV = 'url(#glow-cyan)'; }
                else if (demand > 2) { stroke = '#f59e0b'; strokeW = 2.5; }

                d3.select(this).select('.node-circle')
                    .attr('fill', fill)
                    .attr('stroke', stroke)
                    .attr('stroke-width', strokeW)
                    .attr('filter', filterV);
            });
    }, [selectedOrigin, selectedDestination, passengersByNode]);

    /* ── Heatmap (throttled to every 5 ticks) ────────────────────────────── */
    useEffect(() => {
        if (!svgRef.current) return;
        heatTickRef.current++;
        if (!showHeatmap && heatTickRef.current % 5 !== 0 && heatTickRef.current > 1) return;

        const svg = d3.select(svgRef.current);
        const hLayer = svg.select('#layer-heatmap');
        hLayer.selectAll('*').remove();
        if (!showHeatmap) return;

        // Remove old radial gradients
        svg.select('defs').selectAll('[id^="hm-"]').remove();

        Object.entries(passengersByNode).forEach(([nid, count]) => {
            const node = CITY_NODES[parseInt(nid)];
            if (!node) return;
            const { x, y } = pt(node.lat, node.lng);
            const r = Math.max(25, count * 20);
            const gid = `hm-${nid}`;
            const grad = svg.select('defs').append('radialGradient')
                .attr('id', gid).attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
            grad.append('stop').attr('offset', '0%')
                .attr('stop-color', count > 3 ? '#ef4444' : '#f59e0b').attr('stop-opacity', 0.55);
            grad.append('stop').attr('offset', '100%')
                .attr('stop-color', 'transparent').attr('stop-opacity', 0);

            hLayer.append('circle')
                .datum(node)
                .attr('class', 'hm-circle')
                .attr('cx', x).attr('cy', y).attr('r', r)
                .attr('fill', `url(#${gid})`);
        });
    }, [passengersByNode, showHeatmap, tick]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Route preview ───────────────────────────────────────────────────── */
    useEffect(() => {
        if (!svgRef.current) return;
        const lyr = d3.select(svgRef.current).select('#layer-route-preview');
        lyr.selectAll('*').remove();
        if (selectedOrigin === null || selectedDestination === null) return;
        const o = CITY_NODES[selectedOrigin % 20];
        const d = CITY_NODES[selectedDestination % 20];
        if (!o || !d) return;
        const op = pt(o.lat, o.lng), dp = pt(d.lat, d.lng);
        lyr.append('line').datum({ olat: o.lat, olng: o.lng, dlat: d.lat, dlng: d.lng })
            .attr('class', 'preview-line')
            .attr('x1', op.x).attr('y1', op.y).attr('x2', dp.x).attr('y2', dp.y)
            .attr('stroke', 'white').attr('stroke-width', 2)
            .attr('stroke-dasharray', '6,4').attr('opacity', 0.5);
    }, [selectedOrigin, selectedDestination]);

    /* ── Booking path ────────────────────────────────────────────────────── */
    useEffect(() => {
        if (!svgRef.current) return;
        const lyr = d3.select(svgRef.current).select('#layer-booking-path');
        lyr.selectAll('*').remove();
        if (!activeBooking) return;
        const p = useSimulationStore.getState().passengers
            .find(px => px.id === activeBooking.passenger_id);
        if (!p) return;
        const on = CITY_NODES[p.origin % 20];
        const dn = CITY_NODES[p.destination % 20];
        if (!on || !dn) return;
        const op = pt(on.lat, on.lng), dp = pt(dn.lat, dn.lng);
        lyr.append('line').datum({ olat: on.lat, olng: on.lng, dlat: dn.lat, dlng: dn.lng })
            .attr('class', 'booking-line')
            .attr('x1', op.x).attr('y1', op.y).attr('x2', dp.x).attr('y2', dp.y)
            .attr('stroke', '#a855f7').attr('stroke-width', 2.5).attr('opacity', 0.85);
    }, [activeBooking]);

    /* ── Passenger markers ───────────────────────────────────────────────── */
    useEffect(() => {
        if (!svgRef.current) return;
        const lyr = d3.select(svgRef.current).select('#layer-passengers');
        lyr.selectAll('*').remove();

        Object.entries(passengersByNode).forEach(([nid, count]) => {
            const node = CITY_NODES[parseInt(nid)];
            if (!node) return;
            const { x, y } = pt(node.lat, node.lng);
            const grp = lyr.append('g').datum(node).attr('class', 'pax-group')
                .attr('transform', `translate(${x},${y})`);
            grp.append('circle').attr('r', 10).attr('fill', '#ef4444')
                .attr('opacity', 0.35).attr('class', 'passenger-pulse');
            grp.append('circle').attr('r', 5).attr('fill', '#ef4444');
            if (count > 1) {
                grp.append('circle').attr('cx', 7).attr('cy', -7).attr('r', 7)
                    .attr('fill', '#1e293b').attr('stroke', '#ef4444').attr('stroke-width', 1);
                grp.append('text').attr('x', 7).attr('y', -3)
                    .attr('text-anchor', 'middle').attr('fill', 'white')
                    .attr('font-size', '8px').attr('font-weight', 'bold').text(count);
            }
        });
    }, [passengersByNode]);

    /* ── Vehicles via Zustand subscription ───────────────────────────────── */
    useEffect(() => {
        const unsub = useSimulationStore.subscribe(state => {
            if (!svgRef.current || !mapRef.current) return;
            const svg = d3.select(svgRef.current);
            const vLayer = svg.select('#layer-vehicles');
            const trailLayer = svg.select('#layer-active-routes');
            const { vehicles, activeBooking: ab, showVehicleLabels: labels,
                showRouteTrails: trails } = state;

            // Route polylines for active vehicles
            trailLayer.selectAll('*').remove();
            if (trails) {
                vehicles.filter(v => v.status !== 'idle' && v.route && v.route.length > 0)
                    .forEach(v => {
                        // Full remaining route: current node + route
                        const routeNodeIds = [v.node, ...v.route];
                        const coords = getPathCoords(routeNodeIds);
                        if (coords.length < 2) return;
                        // Draw each segment
                        for (let i = 0; i < coords.length - 1; i++) {
                            const sp = pt(coords[i].lat, coords[i].lng);
                            const tp = pt(coords[i + 1].lat, coords[i + 1].lng);
                            trailLayer.append('line')
                                .attr('x1', sp.x).attr('y1', sp.y)
                                .attr('x2', tp.x).attr('y2', tp.y)
                                .attr('stroke', v.color || '#00F5FF').attr('stroke-width', 1.5)
                                .attr('stroke-opacity', 0.45).attr('stroke-dasharray', '6,3')
                                .attr('class', 'route-trail');
                        }
                    });
            } else {
                // Always draw active vehicle routes even without trail toggle
                vehicles.filter(v => v.status !== 'idle' && v.route && v.route.length > 1)
                    .forEach(v => {
                        const routeNodeIds = [v.node, ...v.route.slice(0, 3)];
                        const coords = getPathCoords(routeNodeIds);
                        if (coords.length < 2) return;
                        for (let i = 0; i < coords.length - 1; i++) {
                            const sp = pt(coords[i].lat, coords[i].lng);
                            const tp = pt(coords[i + 1].lat, coords[i + 1].lng);
                            trailLayer.append('line')
                                .attr('x1', sp.x).attr('y1', sp.y)
                                .attr('x2', tp.x).attr('y2', tp.y)
                                .attr('stroke', v.color || '#00F5FF').attr('stroke-width', 1.5)
                                .attr('stroke-opacity', 0.3).attr('stroke-dasharray', '4,4')
                                .attr('class', 'route-trail');
                        }
                    });
            }

            // Vehicles
            vLayer.selectAll('.vehicle-group')
                .data(vehicles, d => d.id)
                .join(
                    enter => {
                        const g = enter.append('g').attr('class', 'vehicle-group');
                        g.append('circle').attr('class', 'vehicle-ring')
                            .attr('r', 12).attr('fill', 'none')
                            .attr('stroke', '#00F5FF').attr('stroke-width', 1.5).attr('opacity', 0);
                        g.append('polygon').attr('class', 'vehicle-body').attr('points', ARROW);
                        g.append('text').attr('class', 'vehicle-label')
                            .attr('y', -13).attr('text-anchor', 'middle')
                            .attr('fill', '#00F5FF').attr('font-size', '7px')
                            .attr('font-family', 'Share Tech Mono, monospace');
                        g.append('title');
                        return g;
                    },
                    update => update,
                    exit => exit.remove()
                )
                .style('transition', 'transform 0.35s linear')
                .attr('transform', d => {
                    // Interpolate along route for smooth movement
                    if (d.route && d.route.length > 0 && d.route_progress > 0) {
                        const curNode = getCityNode(d.node);
                        const nxtNode = getCityNode(d.route[0]);
                        if (curNode && nxtNode) {
                            const t = Math.max(0, Math.min(1, d.route_progress));
                            const lat = curNode.lat + t * (nxtNode.lat - curNode.lat);
                            const lng = curNode.lng + t * (nxtNode.lng - curNode.lng);
                            const p = pt(lat, lng);
                            return `translate(${p.x},${p.y})`;
                        }
                    }
                    const cn = getCityNode(d.node);
                    const p = pt(cn.lat, cn.lng);
                    return `translate(${p.x},${p.y})`;
                })
                .each(function (d) {
                    const g = d3.select(this);
                    g.select('.vehicle-body').attr('fill', vehicleColor[d.status] ?? '#64748b');
                    g.select('.vehicle-ring').attr('opacity',
                        ab && d.id === ab.vehicle_id ? 1 : 0);
                    g.select('.vehicle-label').text(labels ? d.id : '');
                    g.select('title').text(`${d.id} [${d.status}]`);
                });
        });
        return unsub;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Particle burst on serve ─────────────────────────────────────────── */
    useEffect(() => {
        const unsub = useSimulationStore.subscribe((state, prev) => {
            if (!svgRef.current || !mapRef.current) return;
            const nowS = new Set(state.passengers.filter(p => p.status === 'served').map(p => p.id));
            const wasS = new Set((prev.passengers || []).filter(p => p.status === 'served').map(p => p.id));
            nowS.forEach(id => {
                if (wasS.has(id)) return;
                const p = state.passengers.find(px => px.id === id);
                if (!p) return;
                const node = CITY_NODES[p.destination % 20];
                if (!node) return;
                const { x, y } = pt(node.lat, node.lng);
                const vL = d3.select(svgRef.current).select('#layer-vehicles');
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * 2 * Math.PI;
                    vL.append('circle')
                        .attr('cx', x).attr('cy', y).attr('r', 4)
                        .attr('fill', '#39FF14').attr('opacity', 0.9)
                        .transition().duration(600).ease(d3.easeQuadOut)
                        .attr('cx', x + Math.cos(angle) * 26)
                        .attr('cy', y + Math.sin(angle) * 26)
                        .attr('r', 0).attr('opacity', 0).remove();
                }
            });
        });
        return unsub;
    }, []);

    return (
        <div ref={mapDivRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
    );
});
