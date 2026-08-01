// RightSidebar.jsx – Cyberpunk right panel: city overview, performance, analytics, transit, controls

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { motion } from 'framer-motion';
import useSimulationStore from '../store/simulationStore';
import { CITY_NODES, METRO_LINES, BUS_ROUTES } from '../data/cityGraph';

const API = 'http://localhost:8000';

/* ── Paper seed data ─────────────────────────────────────────────────────── */
const PAPER_DATA = {
    waitingTime: { proposed: [4.0, 3.8, 3.5, 3.2, 3.0, 2.8, 2.5, 2.3, 2.1, 2.0], baseline: [6.0, 5.7, 5.4, 5.2, 5.0, 4.8, 4.6, 4.4, 4.2, 4.0] },
    fleetUtilization: { proposed: [60, 65, 68, 72, 75, 78, 80, 84, 87, 90], baseline: [50, 53, 56, 58, 61, 63, 65, 67, 70, 73] },
    travelTime: { proposed: [24, 23.5, 23, 22.5, 22, 21.5, 21, 20, 19, 18], baseline: [30, 29, 28, 27.5, 27, 26.5, 26, 25.5, 25, 24] },
    operationalCost: { proposed: [120, 115, 110, 105, 100, 97, 93, 88, 84, 80], baseline: [150, 145, 140, 135, 130, 125, 122, 118, 114, 110] },
    energyConsumption: { proposed: [50, 48, 46, 44, 42, 40, 38, 37, 36, 35], baseline: [60, 58, 56, 55, 54, 53, 52, 51, 50, 48] },
    rideThroughput: { proposed: [200, 215, 230, 245, 255, 265, 280, 305, 325, 350], baseline: [175, 185, 200, 210, 215, 220, 230, 240, 250, 260] },
    congestionSensitivity: { proposed: [0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.46, 0.42, 0.40], baseline: [0.90, 0.87, 0.84, 0.82, 0.80, 0.78, 0.75, 0.72, 0.68, 0.62] },
    systemEfficiency: { proposed: [70, 73, 76, 79, 81, 84, 86, 89, 92, 95], baseline: [60, 62, 65, 67, 70, 72, 74, 76, 78, 80] },
};

const CHART_OPTIONS = [
    { id: 'waitingTime', label: 'Waiting Time', liveKey: 'waiting_time', lowerBetter: true },
    { id: 'fleetUtilization', label: 'Fleet Utilization', liveKey: 'fleet_utilization', lowerBetter: false },
    { id: 'travelTime', label: 'Travel Time', liveKey: 'travel_time', lowerBetter: true },
    { id: 'systemEfficiency', label: 'Sys Efficiency', liveKey: 'service_rate', lowerBetter: false },
    { id: 'rideThroughput', label: 'Throughput', liveKey: 'throughput', lowerBetter: false },
    { id: 'energyConsumption', label: 'Energy', liveKey: 'fuel', lowerBetter: true },
    { id: 'operationalCost', label: 'Op Cost', liveKey: 'operational_cost', lowerBetter: true },
    { id: 'congestionSensitivity', label: 'Congestion', liveKey: 'traffic_load', lowerBetter: true },
];

const INTERVALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SPEEDS = [0.5, 1, 2, 5];

/* ── Donut ring ─────────────────────────────────────────────────────────── */
function DonutRing({ label, value, color = '#00F5FF' }) {
    const pct = Math.max(0, Math.min(100, value || 0));
    const R = 28, sw = 7;
    const circ = 2 * Math.PI * R;
    const dash = (pct / 100) * circ;
    return (
        <div className="flex flex-col items-center gap-1">
            <div style={{ position: 'relative', width: 70, height: 70 }}>
                <svg width="70" height="70" viewBox="0 0 70 70">
                    <circle cx="35" cy="35" r={R} fill="none" stroke="#1e293b" strokeWidth={sw} />
                    <circle cx="35" cy="35" r={R} fill="none" stroke={color} strokeWidth={sw}
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${circ}`}
                        strokeDashoffset={circ / 4}
                        className="donut-arc"
                        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
                    />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="font-mono-cyber text-[10px] font-bold" style={{ color }}>{pct.toFixed(0)}%</span>
                </div>
            </div>
            <span className="font-orbitron text-[7px] text-cyan-400/60 uppercase tracking-wider text-center leading-tight w-14">{label}</span>
        </div>
    );
}

/* ── Cyber toggle ────────────────────────────────────────────────────────── */
function CyberToggle({ label, checked, onChange }) {
    return (
        <label className="flex items-center justify-between cursor-pointer select-none">
            <span className="font-mono-cyber text-[10px] text-cyan-300/60">{label}</span>
            <div className="relative ml-2">
                <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
                <div className={`w-8 h-4 rounded-full transition-colors ${checked ? 'bg-cyan-500/50' : 'bg-slate-700'} border ${checked ? 'border-cyan-400' : 'border-slate-600'}`} />
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full transition-all duration-200 ${checked ? 'translate-x-4 bg-cyan-300 shadow-[0_0_6px_rgba(0,245,255,0.8)]' : 'bg-slate-500'}`} />
            </div>
        </label>
    );
}

/* ── Panel wrapper ───────────────────────────────────────────────────────── */
function Panel({ title, children }) {
    return (
        <div className="glass-panel rounded-xl p-3 flex flex-col gap-2.5">
            <span className="font-orbitron text-[8px] text-cyan-400/70 uppercase tracking-widest border-b border-cyan-500/15 pb-1.5">
                ◈ {title}
            </span>
            {children}
        </div>
    );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function RightSidebar() {
    const {
        metrics, passengers, vehicles, congestion, tick,
        isPaused, simulationSpeed, isConnected,
        setPaused, setSpeed, clearBookingSelection,
        showHeatmap, setShowHeatmap,
        showRouteTrails, setShowRouteTrails,
        showVehicleLabels, setShowVehicleLabels,
        showTransit, setShowTransit,
        setDemandSpikeActive,
    } = useSimulationStore();

    const [selectedMetric, setSelectedMetric] = useState('waitingTime');
    const [transitCountdowns, setTransitCountdowns] = useState(() =>
        [...METRO_LINES, ...BUS_ROUTES].map(l => ({
            id: l.id, name: l.name, color: l.color,
            countdown: Math.floor(Math.random() * 28) + 2,
        }))
    );

    /* ── One setInterval at 30s for transit countdown ── */
    const cdRef = useRef(null);
    useEffect(() => {
        cdRef.current = setInterval(() => {
            setTransitCountdowns(prev =>
                prev.map(l => ({
                    ...l,
                    countdown: l.countdown <= 1 ? 30 : l.countdown - 1,
                }))
            );
        }, 1000);
        return () => clearInterval(cdRef.current);
    }, []);

    const post = useCallback(path => fetch(`${API}${path}`, { method: 'POST' }), []);

    const handlePause = async () => { await post('/api/simulation/pause'); setPaused(true); };
    const handleResume = async () => { await post('/api/simulation/resume'); setPaused(false); };
    const handleReset = async () => {
        await post('/api/simulation/reset');
        setPaused(false); setSpeed(1); clearBookingSelection();
    };
    const handleSpeed = async (m) => {
        setSpeed(m);
        await fetch(`${API}/api/simulation/set-speed`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ multiplier: m }),
        });
    };

    const handleDemandSpike = () => {
        setDemandSpikeActive(true);
        setTimeout(() => setDemandSpikeActive(false), 3000);
    };

    /* ── Panel 1: City Overview ── */
    const distinctTypes = useMemo(() => {
        const recent = new Set(passengers.filter(p => p.status !== 'served').map(p => getCityNodeType(p.origin)));
        return recent.size;
    }, [passengers]);

    const avgCongestion = useMemo(() => {
        const vals = Object.values(congestion);
        if (!vals.length) return 0;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }, [congestion]);
    const congestionLabel = avgCongestion < 0.3 ? 'LOW' : avgCongestion < 0.6 ? 'MODERATE' : 'HIGH';
    const congestionColor = avgCongestion < 0.3 ? 'text-green-400' : avgCongestion < 0.6 ? 'text-amber-400' : 'text-red-400';

    const served = passengers.filter(p => p.status === 'served').length;
    const waitingN = passengers.filter(p => p.status === 'waiting').length;
    const mobilityIndex = Math.round(served / (served + waitingN + 1) * 100);

    const gridLoad = Math.round(Math.sin(tick / 20) * 11 + 78);

    /* ── Panel 2: Performance ── */
    const cfg = CHART_OPTIONS.find(c => c.id === selectedMetric) ?? CHART_OPTIONS[0];
    const seed = PAPER_DATA[cfg.id] ?? { proposed: [0], baseline: [0] };
    const liveP = metrics?.proposed?.[cfg.liveKey];
    const liveB = metrics?.baseline?.[cfg.liveKey];

    const chartData = useMemo(() =>
        INTERVALS.map((iv, i) => ({
            iv,
            proposed: +(liveP?.[i] ?? seed.proposed[i] ?? 0).toFixed(3),
            baseline: +(liveB?.[i] ?? seed.baseline[i] ?? 0).toFixed(3),
        })), [seed, liveP, liveB]);

    const lastP = chartData[chartData.length - 1]?.proposed ?? 0;
    const lastB = chartData[chartData.length - 1]?.baseline ?? 0;
    const advantagePct = lastB !== 0 ? Math.abs((lastP - lastB) / lastB * 100).toFixed(1) : '0.0';
    const isImprovement = cfg.lowerBetter ? lastP < lastB : lastP > lastB;
    const advantageLabel = cfg.lowerBetter ? `↓ ${advantagePct}% REDUCTION` : `↑ ${advantagePct}% IMPROVEMENT`;

    /* ── Panel 3: Live Analytics ── */
    const utilPct = (metrics?.proposed?.fleet_utilization?.slice(-1)[0] ?? 0) * 100;
    const effPct = metrics?.proposed?.service_rate?.slice(-1)[0] ?? 0;
    const demandMet = mobilityIndex;

    return (
        <div className="flex flex-col gap-2.5 h-full">

            {/* ── City Overview ── */}
            <Panel title="City Overview">
                <div className="grid grid-cols-2 gap-1.5">
                    {[
                        { icon: '🏙️', label: 'ZONES ACTIVE', value: `${distinctTypes}`, sub: 'node types' },
                        { icon: '🚦', label: 'CONGESTION', value: congestionLabel, sub: `${(avgCongestion * 100).toFixed(0)}% avg`, valueClass: congestionColor },
                        { icon: '👥', label: 'MOBILITY IDX', value: `${mobilityIndex}%`, sub: 'served/demand' },
                        { icon: '⚡', label: 'GRID LOAD', value: `${gridLoad}%`, sub: 'city power' },
                    ].map(c => (
                        <div key={c.label} className="bg-black/40 rounded-lg p-2 border border-cyan-500/10">
                            <div className="flex items-center gap-1">
                                <span className="text-base">{c.icon}</span>
                                <span className="font-orbitron text-[7px] text-cyan-400/50 tracking-widest leading-tight">{c.label}</span>
                            </div>
                            <div className={`font-mono-cyber text-sm font-bold mt-0.5 ${c.valueClass ?? 'text-white'}`}>{c.value}</div>
                            <div className="font-mono-cyber text-[8px] text-slate-600">{c.sub}</div>
                        </div>
                    ))}
                </div>
            </Panel>

            {/* ── Performance Advantage ── */}
            <Panel title="Performance Advantage">
                <select value={selectedMetric} onChange={e => setSelectedMetric(e.target.value)}
                    className="font-mono-cyber text-[9px] bg-black/60 border border-cyan-500/25
                               text-cyan-300 rounded px-2 py-1 outline-none cursor-pointer w-full">
                    {CHART_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>

                <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="iv" tick={{ fontSize: 7, fill: '#475569' }} />
                        <YAxis tick={{ fontSize: 7, fill: '#475569' }} />
                        <Tooltip contentStyle={{ background: '#050A0F', border: '1px solid rgba(0,245,255,0.2)', borderRadius: 6, fontSize: 9 }}
                            labelStyle={{ color: '#94a3b8' }} />
                        <Line type="monotone" dataKey="proposed" stroke="#00F5FF" strokeWidth={2} dot={false}
                            style={{ filter: 'drop-shadow(0 0 3px #00F5FF)' }} />
                        <Line type="monotone" dataKey="baseline" stroke="#F59E0B" strokeWidth={1.5}
                            strokeDasharray="4 2" dot={false} />
                    </LineChart>
                </ResponsiveContainer>

                <div className="text-center">
                    <span className={`font-orbitron text-sm font-black tracking-widest
                                     ${isImprovement ? 'text-green-400' : 'text-red-400'}`}
                        style={{ textShadow: isImprovement ? '0 0 10px #39FF14' : '0 0 10px #EF4444' }}>
                        {advantageLabel}
                    </span>
                    <p className="font-mono-cyber text-[8px] text-cyan-400/40 mt-0.5">PROPOSED vs BASELINE</p>
                </div>
            </Panel>

            {/* ── Live Analytics Rings ── */}
            <Panel title="Live Analytics">
                <div className="flex justify-around py-1">
                    <DonutRing label="Fleet Util." value={utilPct} color="#00F5FF" />
                    <DonutRing label="Sys Efficiency" value={effPct} color="#39FF14" />
                    <DonutRing label="Demand Met" value={demandMet} color="#F59E0B" />
                </div>
            </Panel>

            {/* ── Transit Status ── */}
            <Panel title="Transit Status">
                <div className="flex flex-col gap-1">
                    {transitCountdowns.map(l => (
                        <div key={l.id} className="flex items-center gap-1.5 px-1.5 py-1
                                                    rounded bg-black/30 border border-cyan-500/10">
                            <div className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: l.color, boxShadow: `0 0 4px ${l.color}` }} />
                            <span className="font-mono-cyber text-[9px] text-slate-400 flex-1 truncate">{l.name}</span>
                            <span className="font-mono-cyber text-[9px] text-cyan-300 shrink-0">
                                {l.countdown}s
                            </span>
                        </div>
                    ))}
                </div>
            </Panel>

            {/* ── Sim Controls ── */}
            <Panel title="Sim Controls">
                <motion.button
                    onClick={isPaused ? handleResume : handlePause}
                    whileTap={{ scale: 0.97 }}
                    animate={isPaused ? { boxShadow: '0 0 14px rgba(57,255,20,0.35)' } : { boxShadow: '0 0 14px rgba(245,158,11,0.35)' }}
                    className={`w-full py-2 rounded-lg font-orbitron text-xs font-bold uppercase tracking-widest cursor-pointer
                               ${isPaused
                            ? 'bg-green-500/20 border border-green-400/50 text-green-400'
                            : 'bg-amber-500/20 border border-amber-400/50 text-amber-400'}`}>
                    {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
                </motion.button>

                <button onClick={handleReset}
                    className="w-full py-1.5 rounded-lg font-orbitron text-[9px] uppercase tracking-widest cursor-pointer
                               bg-black/40 border border-slate-600/40 text-slate-400
                               hover:border-cyan-500/50 hover:text-cyan-400 transition-all">
                    🔄 RESET
                </button>

                <div className="flex gap-1">
                    {SPEEDS.map(s => (
                        <button key={s} onClick={() => handleSpeed(s)}
                            className={`flex-1 py-1.5 rounded font-orbitron text-[8px] uppercase cursor-pointer
                                        border transition-all duration-150
                                        ${simulationSpeed === s
                                    ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.3)]'
                                    : 'bg-black/30 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'}`}>
                            {s}×
                        </button>
                    ))}
                </div>

                <button onClick={handleDemandSpike}
                    className="w-full py-1.5 rounded-lg font-orbitron text-[9px] uppercase tracking-widest
                               border border-amber-500/30 text-amber-400 bg-black/30 cursor-pointer
                               hover:border-amber-400/70 hover:shadow-[0_0_10px_rgba(245,158,11,0.3)] transition-all">
                    ⚡ INJECT DEMAND SPIKE
                </button>

                <div className="flex flex-col gap-1.5 pt-1 border-t border-cyan-500/15">
                    <CyberToggle label="Heatmap" checked={showHeatmap} onChange={setShowHeatmap} />
                    <CyberToggle label="Route Trails" checked={showRouteTrails} onChange={setShowRouteTrails} />
                    <CyberToggle label="Vehicle Labels" checked={showVehicleLabels} onChange={setShowVehicleLabels} />
                    <CyberToggle label="Transit Layer" checked={showTransit} onChange={setShowTransit} />
                </div>

                <div className="flex items-center justify-center gap-1.5 pt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`}
                        style={isConnected ? { boxShadow: '0 0 6px rgba(57,255,20,0.9)' } : {}} />
                    <span className="font-mono-cyber text-[9px] text-slate-600">
                        {isConnected ? 'CONNECTED · ws://localhost:8000/ws' : 'DISCONNECTED'}
                    </span>
                </div>
            </Panel>
        </div>
    );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function getCityNodeType(backendId) {
    if (backendId === null || backendId === undefined) return 'unknown';
    return CITY_NODES[backendId % 20]?.type ?? 'unknown';
}
