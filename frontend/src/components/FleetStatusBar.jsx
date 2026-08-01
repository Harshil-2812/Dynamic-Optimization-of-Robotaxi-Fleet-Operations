// FleetStatusBar.jsx – Smart City top command bar

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSimulationStore from '../store/simulationStore';
import { getCurrentPeriod, formatSimTime } from '../data/demandPatterns';

/* ── Animated counter chip ────────────────────────────────────────────────── */
function StatChip({ icon, label, value, unit = '', colorClass = 'text-cyan-400' }) {
    const [display, setDisplay] = useState(value);
    const [flashing, setFlashing] = useState(false);
    const prev = useRef(value);

    useEffect(() => {
        if (value !== prev.current) {
            prev.current = value;
            setDisplay(value);
            setFlashing(true);
            const id = setTimeout(() => setFlashing(false), 600);
            return () => clearTimeout(id);
        }
    }, [value]);

    return (
        <div className="flex items-center gap-1 px-2.5 py-1 rounded
                        bg-black/50 border border-cyan-500/20 backdrop-blur-sm shrink-0">
            <span className="text-sm select-none">{icon}</span>
            <span className="font-orbitron text-[8px] text-cyan-400/50 uppercase tracking-widest">{label}</span>
            <motion.span
                key={display}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={`font-mono-cyber text-xs font-bold ${colorClass} ${flashing ? 'value-flash' : ''}`}
            >
                {display}{unit}
            </motion.span>
        </div>
    );
}

/* ── Live clock ───────────────────────────────────────────────────────────── */
function LiveClock() {
    const [t, setT] = useState(() => new Date().toLocaleTimeString('en-GB', { hour12: false }));
    useEffect(() => {
        const id = setInterval(() =>
            setT(new Date().toLocaleTimeString('en-GB', { hour12: false })), 1000);
        return () => clearInterval(id);
    }, []);
    return <span className="font-mono-cyber text-xs text-cyan-300">{t}</span>;
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export default function FleetStatusBar() {
    const { vehicles, passengers, metrics, tick, isConnected, simTime, demandSpikeActive } =
        useSimulationStore();

    const active = vehicles.filter(v => v.status !== 'idle').length;
    const idle = vehicles.filter(v => v.status === 'idle').length;
    const dispatched = vehicles.filter(v => v.status === 'dispatched').length;
    const waiting = passengers.filter(p => p.status === 'waiting').length;
    const served = passengers.filter(p => p.status === 'served').length;

    const util = metrics?.proposed?.fleet_utilization?.slice(-1)[0] ?? 0;
    const avgW = metrics?.proposed?.waiting_time?.slice(-1)[0] ?? 0;

    const period = getCurrentPeriod(simTime);
    const formattedTime = formatSimTime(simTime);
    const mins = Math.floor(tick / 60), secs = Math.floor(tick % 60);

    const isRush = period.id === 'morning' || period.id === 'evening';

    return (
        <div className="w-full h-full flex items-center px-3 gap-3
                        bg-black/85 backdrop-blur-md border-b border-cyan-500/20
                        shadow-[0_4px_20px_rgba(0,245,255,0.07)]">

            {/* Brand */}
            <div className="flex flex-col leading-none shrink-0">
                <div className="flex items-center gap-2">
                    <span className="font-orbitron text-lg font-black tracking-[0.25em]
                                     text-transparent bg-clip-text
                                     bg-gradient-to-r from-cyan-400 to-green-400">
                        URBANFLOW
                    </span>
                    <span className="w-2 h-2 rounded-full bg-cyan-400 blink
                                     shadow-[0_0_8px_rgba(0,245,255,0.9)]" />
                </div>
                <span className="font-orbitron text-[6px] tracking-[0.2em] text-cyan-400/40 mt-0.5">
                    SMART CITY MOBILITY PLATFORM — NOVA CITY
                </span>
            </div>

            <div className="w-px h-7 bg-cyan-500/20 shrink-0" />

            {/* Stat chips */}
            <div className="flex items-center gap-1.5 flex-1 overflow-x-auto min-w-0 py-0.5">
                <StatChip icon="🚗" label="Active" value={active} colorClass="text-cyan-400" />
                <StatChip icon="⏳" label="Idle" value={idle} colorClass="text-slate-400" />
                <StatChip icon="📡" label="Dispatch" value={dispatched} colorClass="text-blue-400" />
                <StatChip icon="👤" label="Waiting" value={waiting}
                    colorClass={waiting > 5 ? 'text-amber-400' : 'text-white'} />
                <StatChip icon="✅" label="Served" value={served} colorClass="text-green-400" />
                <StatChip icon="⚡" label="Util" value={(util * 100).toFixed(1)} unit="%"
                    colorClass={util >= 0.7 ? 'text-green-400' : 'text-amber-400'} />
                <StatChip icon="🕐" label="AvgWait" value={avgW.toFixed(1)} unit="m"
                    colorClass={avgW <= 3 ? 'text-green-400' : 'text-amber-400'} />
            </div>

            <div className="w-px h-7 bg-cyan-500/20 shrink-0" />

            {/* Sim time + period */}
            <div className="flex items-center gap-2 shrink-0">
                <div className="flex flex-col items-end">
                    <span className="font-mono-cyber text-[8px] text-cyan-400/40 uppercase tracking-widest">SIM TIME</span>
                    <span className="font-mono-cyber text-xs text-cyan-300">{formattedTime}</span>
                </div>

                {/* Period badge */}
                <div className="px-2 py-0.5 rounded border font-orbitron text-[8px] uppercase tracking-widest"
                    style={{
                        color: period.color,
                        borderColor: period.color + '50',
                        background: period.color + '15',
                        boxShadow: isRush ? `0 0 8px ${period.color}40` : undefined,
                    }}>
                    {period.label}
                </div>

                {/* Tick */}
                <div className="flex flex-col items-end">
                    <span className="font-mono-cyber text-[8px] text-cyan-400/40 uppercase">LOCAL</span>
                    <LiveClock />
                </div>

                {/* LIVE badge */}
                {isConnected ? (
                    <div className="flex items-center gap-1 px-2 py-1 rounded
                                    bg-red-950/60 border border-red-500/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse
                                         shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
                        <span className="font-orbitron text-[8px] text-red-400 tracking-widest">LIVE</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 px-2 py-1 rounded
                                    bg-slate-900/60 border border-slate-600/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        <span className="font-orbitron text-[8px] text-slate-500 tracking-widest">OFFLINE</span>
                    </div>
                )}
            </div>
        </div>
    );
}
