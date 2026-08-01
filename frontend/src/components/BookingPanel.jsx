// BookingPanel.jsx – Cyberpunk left sidebar: booking + fleet status + eco impact + system log

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useWebSocket from '../hooks/useWebSocket';
import useSimulationStore from '../store/simulationStore';
import { CITY_NODES, NODE_ICONS, getCityNode, METRO_LINES } from '../data/cityGraph';
import RideStatusPanel from './RideStatusPanel';

/* ── helpers — PRESERVED ─────────────────────────────────────────────────── */
function nodeDist(aId, bId) {
    const aCol = aId % 10, aRow = Math.floor(aId / 10);
    const bCol = bId % 10, bRow = Math.floor(bId / 10);
    return Math.abs(aCol - bCol) + Math.abs(aRow - bRow);
}

/* ── Status badge colours ─────────────────────────────────────────────────── */
const STATUS_COLORS = {
    idle: { text: 'text-slate-400', bg: 'bg-slate-800', border: 'border-slate-600' },
    dispatched: { text: 'text-blue-400', bg: 'bg-blue-950', border: 'border-blue-600' },
    pickup: { text: 'text-amber-400', bg: 'bg-amber-950', border: 'border-amber-600' },
    dropoff: { text: 'text-purple-400', bg: 'bg-purple-950', border: 'border-purple-600' },
};

function StatusBadge({ status }) {
    const c = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
    return (
        <span className={`font-orbitron text-[7px] px-1 py-0.5 rounded border uppercase tracking-widest
                          ${c.text} ${c.bg} ${c.border}`}>{status}</span>
    );
}

/* ── Get node name from city graph ───────────────────────────────────────── */
const getNodeName = (backendId) => (backendId === null || backendId === undefined)
    ? null
    : getCityNode(backendId)?.name ?? `Node ${backendId}`;

/* ── Transit suggestion ────────────────────────────────────────────────────── */
function transitSuggestion(originId, destId) {
    const o = getCityNode(originId), d = getCityNode(destId);
    if (!o || !d) return '🚗 Direct robotaxi route';
    if (o.type === 'transit_hub' || d.type === 'transit_hub') {
        const metroName = METRO_LINES.find(m =>
            m.stops.includes(o.id) || m.stops.includes(d.id)
        )?.name;
        if (metroName) return `🚇 Suggested: ${metroName} + robotaxi last mile`;
    }
    return '🚗 Direct robotaxi route';
}

/* ── Log colours ──────────────────────────────────────────────────────────── */
const LOG_COLORS = { success: 'text-green-400', info: 'text-cyan-400', warn: 'text-amber-400', error: 'text-red-400' };

/* ── Panel section wrapper ────────────────────────────────────────────────── */
function Section({ title, children }) {
    return (
        <div className="border-t border-cyan-500/15 pt-2.5 flex flex-col gap-2">
            <span className="font-orbitron text-[8px] text-cyan-400/70 uppercase tracking-widest">◈ {title}</span>
            {children}
        </div>
    );
}

/* ── Eco bar (CSS only, no Recharts) ─────────────────────────────────────── */
function EcoBar({ label, pct, color }) {
    return (
        <div className="flex items-center gap-2">
            <span className="font-mono-cyber text-[9px] text-slate-500 w-20 shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="font-mono-cyber text-[9px] text-slate-400 w-6">{pct}%</span>
        </div>
    );
}

/* ── Main component ────────────────────────────────────────────────────────── */
export default function BookingPanel() {
    const {
        selectedOrigin, selectedDestination,
        activeBooking, vehicles, passengers,
        clearBookingSelection, setActiveBooking, addLogEntry,
    } = useSimulationStore();

    const { sendBooking } = useWebSocket();
    const [isRequesting, setIsRequesting] = useState(false);
    const [tripSummary, setTripSummary] = useState(null);
    const [localLog, setLocalLog] = useState([]);
    const logRef = useRef(null);

    /* ── Nearest idle ── */
    const nearestIdleDist = useMemo(() => {
        if (selectedOrigin === null) return null;
        const idle = vehicles.filter(v => v.status === 'idle');
        if (!idle.length) return null;
        return Math.min(...idle.map(v => nodeDist(v.node, selectedOrigin)));
    }, [vehicles, selectedOrigin]);
    const estWaitMin = nearestIdleDist !== null ? Math.ceil(nearestIdleDist / 3) : null;

    /* ── Booked passenger + vehicle ── */
    const bookedPassenger = useMemo(() =>
        activeBooking ? passengers.find(p => p.id === activeBooking.passenger_id) ?? null : null,
        [activeBooking, passengers]);

    const assignedVehicle = useMemo(() =>
        activeBooking?.vehicle_id ? vehicles.find(v => v.id === activeBooking.vehicle_id) ?? null : null,
        [activeBooking, vehicles]);

    /* ── State machine — PRESERVED ── */
    const bookingStatus = useMemo(() => {
        if (!activeBooking) return 'idle';
        if (tripSummary) return 'complete';
        if (!bookedPassenger) return 'waiting';
        const s = bookedPassenger.status;
        if (s === 'served') return 'complete';
        if (s === 'onboard') return 'onboard';
        if (s === 'assigned' || s === 'waiting') return assignedVehicle ? 'en_route' : 'finding';
        return 'finding';
    }, [activeBooking, bookedPassenger, assignedVehicle, tripSummary]);

    useMemo(() => {
        if (bookedPassenger?.status === 'served' && !tripSummary)
            setTripSummary({ wait: bookedPassenger.waiting_time?.toFixed(1) ?? '—', travel: bookedPassenger.travel_time?.toFixed(1) ?? '—' });
    }, [bookedPassenger, tripSummary]);

    /* ── Vehicle progress ── */
    const vehicleProgress = useMemo(() => {
        if (!assignedVehicle || !bookedPassenger) return 0;
        return Math.max(0, Math.min(100, 100 - nodeDist(assignedVehicle.node, bookedPassenger.origin) * 10));
    }, [assignedVehicle, bookedPassenger]);

    /* ── CO₂ saved (trip distance × 0.3 kg) ── */
    const tripDist = selectedOrigin !== null && selectedDestination !== null
        ? nodeDist(selectedOrigin, selectedDestination) : 0;
    const co2Saved = (tripDist * 0.3).toFixed(1);

    /* ── Handlers — PRESERVED ── */
    const handleRequest = useCallback(async () => {
        if (selectedOrigin === null || selectedDestination === null) return;
        setIsRequesting(true);
        try { await sendBooking(selectedOrigin, selectedDestination); clearBookingSelection(); }
        catch { /* hook handles error */ }
        finally { setIsRequesting(false); }
    }, [selectedOrigin, selectedDestination, sendBooking, clearBookingSelection]);

    const handleReset = useCallback(() => {
        setActiveBooking(null); setTripSummary(null); clearBookingSelection();
    }, [setActiveBooking, clearBookingSelection]);

    /* ── System log watcher ── */
    const prevP = useRef([]), prevV = useRef([]);
    useEffect(() => {
        const now = new Date().toLocaleTimeString('en-GB', { hour12: false });
        const add = (message, type = 'info') => {
            const entry = { time: now, message, type };
            setLocalLog(l => [entry, ...l].slice(0, 30));
            addLogEntry(entry);
        };
        passengers.forEach(p => { if (!prevP.current.find(pp => pp.id === p.id)) add(`▶ BOOKING ${p.id} RECEIVED`, 'warn'); });
        passengers.forEach(p => {
            const was = prevP.current.find(pp => pp.id === p.id);
            if (p.status === 'served' && was && was.status !== 'served') add(`✅ TRIP ${p.id} COMPLETE`, 'success');
        });
        vehicles.forEach(v => {
            const was = prevV.current.find(pv => pv.id === v.id);
            if (v.status === 'dispatched' && was && was.status !== 'dispatched') {
                const nodeName = getCityNode(v.node)?.name ?? `N${v.node}`;
                add(`🚗 V${v.id} → ${nodeName}`, 'info');
            }
        });
        prevP.current = passengers; prevV.current = vehicles;
    }, [passengers, vehicles]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0; }, [localLog]);

    /* ── Eco stats ── */
    const servedCount = useMemo(() => passengers.filter(p => p.status === 'served').length, [passengers]);
    const ecoStats = useMemo(() => ({
        co2: (servedCount * 2.1).toFixed(1),
        trees: Math.floor(servedCount * 2.1 / 21),
        cars: Math.round(servedCount * 0.3),
    }), [servedCount]);

    /* ── Origin / destination display names ── */
    const originName = getNodeName(selectedOrigin);
    const destName = getNodeName(selectedDestination);
    const originNode = selectedOrigin !== null ? getCityNode(selectedOrigin) : null;
    const destNode = selectedDestination !== null ? getCityNode(selectedDestination) : null;

    return (
        <div className="glass-panel gradient-border rounded-xl p-3 flex flex-col gap-2.5
                        text-white h-full overflow-y-auto">

            {/* Header */}
            <div className="flex items-center gap-2 pb-1.5 border-b border-cyan-500/15">
                <span className="font-orbitron text-[10px] text-cyan-400 tracking-widest uppercase">◈ Ride Dispatch</span>
            </div>

            {/* ─── STATE 1: idle ─── */}
            {!activeBooking && selectedOrigin === null && (
                <p className="font-mono-cyber text-cyan-300/50 text-[10px] leading-relaxed">
                    Click a <span className="text-green-400 font-bold">zone</span> on the map to set pickup,
                    then click another for destination.
                </p>
            )}

            {/* FROM/TO display */}
            {!activeBooking && (
                <div className="space-y-1.5">
                    <div className="border border-dashed rounded-lg px-2.5 py-2 flex items-center gap-2
                                    border-cyan-500/25 bg-black/30">
                        <span className="font-orbitron text-[8px] text-cyan-400/50 w-7">FROM</span>
                        {originName
                            ? <span className="font-mono-cyber text-xs text-green-400 flex-1">
                                {NODE_ICONS[originNode?.type]} {originName}
                            </span>
                            : <span className="font-mono-cyber text-slate-600 text-xs">—</span>}
                    </div>
                    <div className={`border border-dashed rounded-lg px-2.5 py-2 flex items-center gap-2
                                    border-cyan-500/25 bg-black/30 ${selectedOrigin !== null && selectedDestination === null ? 'animate-pulse' : ''}`}>
                        <span className="font-orbitron text-[8px] text-cyan-400/50 w-7">TO</span>
                        {destName
                            ? <span className="font-mono-cyber text-xs text-cyan-400 flex-1">
                                {NODE_ICONS[destNode?.type]} {destName}
                            </span>
                            : <span className="font-mono-cyber text-slate-600 text-xs">
                                {selectedOrigin !== null ? 'Click map to select…' : '—'}
                            </span>}
                    </div>
                </div>
            )}

            {/* ─── STATE 3: Both selected ─── */}
            {!activeBooking && selectedOrigin !== null && selectedDestination !== null && (
                <>
                    {/* Transit suggestion */}
                    <div className="bg-black/30 rounded-lg p-2 border border-cyan-500/10 font-mono-cyber text-[10px] text-cyan-300/70">
                        {transitSuggestion(selectedOrigin, selectedDestination)}
                    </div>

                    {/* Trip info */}
                    <div className="bg-black/40 rounded-lg p-2 border border-cyan-500/10 space-y-1">
                        <div className="flex justify-between font-mono-cyber text-[10px]">
                            <span className="text-cyan-400/50">Nearest idle</span>
                            <span className="text-white">{nearestIdleDist ?? '—'} nodes</span>
                        </div>
                        <div className="flex justify-between font-mono-cyber text-[10px]">
                            <span className="text-cyan-400/50">Est. wait</span>
                            <span className="text-white">{estWaitMin !== null ? `~${estWaitMin} min` : '—'}</span>
                        </div>
                        <div className="flex justify-between font-mono-cyber text-[10px]">
                            <span className="text-cyan-400/50">CO₂ saved</span>
                            <span className="text-green-400">🌱 {co2Saved} kg</span>
                        </div>
                    </div>

                    <motion.button onClick={handleRequest} disabled={isRequesting}
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                        className="w-full py-2.5 rounded-lg font-orbitron text-xs font-bold text-black
                                   uppercase tracking-widest cursor-pointer disabled:opacity-50
                                   bg-gradient-to-r from-cyan-400 to-green-400
                                   shadow-[0_0_20px_rgba(0,245,255,0.4)]">
                        {isRequesting ? 'REQUESTING…' : '⚡ REQUEST RIDE'}
                    </motion.button>

                    <button onClick={clearBookingSelection}
                        className="text-[9px] font-mono-cyber text-slate-600 hover:text-cyan-400 transition-colors">
                        ✕ CLEAR SELECTION
                    </button>
                </>
            )}

            {/* ─── STATE 4: finding ─── */}
            {activeBooking && bookingStatus === 'finding' && (
                <div className="flex flex-col items-center gap-3 py-3">
                    <div className="w-8 h-8 rounded-full border-2 border-cyan-900 border-t-cyan-400
                                    animate-spin shadow-[0_0_10px_rgba(0,245,255,0.4)]" />
                    <p className="font-orbitron text-xs text-cyan-400 tracking-widest">LOCATING VEHICLE…</p>
                </div>
            )}

            {/* ─── STATE 5: en_route ─── */}
            {activeBooking && bookingStatus === 'en_route' && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 font-orbitron text-xs text-blue-400">
                        <span>🚗</span><span>V{assignedVehicle?.id} EN ROUTE</span>
                    </div>
                    <div className="bg-black/40 rounded-lg p-2.5 border border-blue-500/15">
                        <div className="flex justify-between font-mono-cyber text-[10px] mb-2">
                            <span className="text-cyan-400/50">Approaching</span>
                            <span className="text-white">
                                ~{nodeDist(assignedVehicle?.node ?? 0, bookedPassenger?.origin ?? 0)} nodes
                            </span>
                        </div>
                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-full transition-all duration-500"
                                style={{ width: `${vehicleProgress}%` }} />
                        </div>
                    </div>
                    <p className="font-mono-cyber text-cyan-400/40 text-[9px]">{activeBooking.passenger_id}</p>
                </div>
            )}

            {/* ─── STATE 6: onboard ─── */}
            {activeBooking && bookingStatus === 'onboard' && (
                <div className="flex flex-col items-center gap-2 py-2">
                    <span className="text-2xl">🎉</span>
                    <p className="font-orbitron text-xs text-green-400 tracking-widest">ONBOARD — EN ROUTE</p>
                    <p className="font-mono-cyber text-cyan-400/50 text-[10px]">
                        → {getNodeName(bookedPassenger?.destination)}
                    </p>
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-400 to-purple-400 animate-pulse" style={{ width: '65%' }} />
                    </div>
                </div>
            )}

            {/* ─── STATE 7: complete ─── */}
            {(bookingStatus === 'complete' || tripSummary) && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 font-orbitron text-xs text-green-400">
                        <span>✅</span><span>ARRIVED</span>
                    </div>
                    {tripSummary && (
                        <>
                            <div className="bg-black/40 rounded-lg p-2 border border-green-500/15 space-y-1">
                                <div className="flex justify-between font-mono-cyber text-[10px]">
                                    <span className="text-cyan-400/50">Wait time</span>
                                    <span className="text-white">{tripSummary.wait}s</span>
                                </div>
                                <div className="flex justify-between font-mono-cyber text-[10px]">
                                    <span className="text-cyan-400/50">Travel time</span>
                                    <span className="text-white">{tripSummary.travel}s</span>
                                </div>
                                <div className="flex justify-between font-mono-cyber text-[10px]">
                                    <span className="text-cyan-400/50">CO₂ saved</span>
                                    <span className="text-green-400">🌱 {co2Saved} kg vs driving</span>
                                </div>
                            </div>
                        </>
                    )}
                    <motion.button onClick={handleReset} whileTap={{ scale: 0.97 }}
                        className="w-full py-2 rounded-lg font-orbitron text-xs font-bold text-black
                                   bg-gradient-to-r from-green-400 to-teal-400
                                   shadow-[0_0_16px_rgba(57,255,20,0.35)]">
                        BOOK ANOTHER RIDE
                    </motion.button>
                </div>
            )}

            {/* ── RIDE STATUS ── */}
            <RideStatusPanel />

            {/* ── FLEET STATUS ── */}
            <Section title="Fleet Status">
                <div className="max-h-44 overflow-y-auto flex flex-col gap-1 pr-1">
                    <AnimatePresence>
                        {vehicles.map((v, i) => (
                            <motion.div key={v.id}
                                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0 }} transition={{ delay: i * 0.025 }}
                                className="flex items-center gap-1.5 px-2 py-1 rounded
                                           bg-black/30 border border-cyan-500/10">
                                <span className="font-mono-cyber text-[9px] text-cyan-300/70 w-8 shrink-0">{v.id}</span>
                                <StatusBadge status={v.status} />
                                <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: v.status === 'idle' ? '5%' : v.status === 'dispatched' ? '40%' : v.status === 'pickup' ? '70%' : '90%',
                                            background: v.status === 'idle' ? '#374151' : v.status === 'dispatched' ? '#3b82f6' : v.status === 'pickup' ? '#f59e0b' : '#a855f7',
                                        }} />
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </Section>

            {/* ── ECO IMPACT ── */}
            <Section title="🌱 Eco Impact">
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between font-mono-cyber text-[10px]">
                        <span className="text-cyan-400/60">CO₂ Saved</span>
                        <span className="text-green-400 font-bold">↓ {ecoStats.co2} kg</span>
                    </div>
                    <div className="flex items-center justify-between font-mono-cyber text-[10px]">
                        <span className="text-cyan-400/60">Equiv Trees</span>
                        <span className="text-green-400">≡ {ecoStats.trees} trees/yr</span>
                    </div>
                    <div className="flex items-center justify-between font-mono-cyber text-[10px]">
                        <span className="text-cyan-400/60">Cars Displaced</span>
                        <span className="text-green-400">↓ {ecoStats.cars} private cars</span>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 mt-1 px-2 py-1 rounded
                                    bg-green-950/40 border border-green-500/30
                                    shadow-[0_0_10px_rgba(57,255,20,0.2)]">
                        <span className="text-green-400 text-sm">⚡</span>
                        <span className="font-orbitron text-[8px] text-green-400 tracking-widest">100% ELECTRIC FLEET</span>
                    </div>
                    {/* Relative emissions bar chart */}
                    <div className="space-y-1 mt-1">
                        <EcoBar label="Proposed" pct={25} color="#39FF14" />
                        <EcoBar label="Baseline" pct={55} color="#f59e0b" />
                        <EcoBar label="Private" pct={100} color="#ef4444" />
                    </div>
                </div>
            </Section>

            {/* ── SYSTEM LOG ── */}
            <Section title="System Log">
                <div ref={logRef} className="max-h-32 overflow-y-auto flex flex-col gap-0.5 pr-1">
                    {localLog.length === 0 && (
                        <span className="font-mono-cyber text-[9px] text-slate-700">Awaiting events…</span>
                    )}
                    {localLog.map((e, i) => (
                        <div key={i} className="flex items-start gap-1 font-mono-cyber text-[9px]"
                            style={{ animation: 'fadeInUp 0.2s ease-out' }}>
                            <span className="text-slate-700 shrink-0">{e.time}</span>
                            <span className={LOG_COLORS[e.type] ?? 'text-slate-400'}>{e.message}</span>
                        </div>
                    ))}
                </div>
            </Section>
        </div>
    );
}
