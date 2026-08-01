// SimulationControls.jsx - Horizontal simulation control bar fixed to the bottom

import { useCallback } from 'react';
import useSimulationStore from '../store/simulationStore';

const API = 'http://localhost:8000';

export default function SimulationControls() {
    const {
        isPaused, simulationSpeed, isConnected, tick,
        setPaused, setSpeed, clearBookingSelection,
    } = useSimulationStore();

    const post = useCallback((path) => fetch(`${API}${path}`, { method: 'POST' }), []);

    const handlePause = async () => {
        await post('/api/simulation/pause');
        setPaused(true);
    };

    const handleResume = async () => {
        await post('/api/simulation/resume');
        setPaused(false);
    };

    const handleReset = async () => {
        await post('/api/simulation/reset');
        setPaused(false);
        setSpeed(1);
        clearBookingSelection();
    };

    const handleSpeedChange = async (e) => {
        const multiplier = parseFloat(e.target.value);
        setSpeed(multiplier);
        await fetch(`${API}/api/simulation/set-speed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ multiplier }),
        });
    };

    // The simulation runs continuously. There are 10 metrics tracking segments, but NO 10 simulations. 
    // We will just show standard uptime rather than the confusing "10" segments.
    const uptimeMinutes = Math.floor(tick / 60);
    const uptimeSeconds = Math.floor(tick % 60);
    const progressPercent = Math.min(100, Math.max(0, (tick / 500) * 100)); // Just arbitrary wrap around

    return (
        <div
            className="fixed bottom-0 left-0 right-0 z-50
                 bg-slate-900 border-t border-slate-700 p-3
                 flex items-center gap-6 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]"
            style={{ height: 64 }}
        >
            {/* 1. Play / Pause & Reset */}
            <div className="flex items-center gap-2 shrink-0">
                <button
                    onClick={isPaused ? handleResume : handlePause}
                    className={`w-32 py-2 rounded-lg text-sm font-bold text-white transition-all duration-200
            ${isPaused
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
                            : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'}`}
                >
                    {isPaused ? '▶ Resume' : '⏸ Pause'}
                </button>

                <button
                    onClick={handleReset}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-slate-300
                     bg-slate-800 border border-slate-600 hover:bg-slate-700
                     transition-all duration-200 shadow-sm"
                >
                    🔄 Reset
                </button>
            </div>

            {/* 2. Speed selector */}
            <div className="flex items-center gap-2 shrink-0 bg-slate-800 rounded-lg px-3 py-1.5 border border-slate-700">
                <span className="text-slate-400 text-xs font-semibold">Speed</span>
                <select
                    value={simulationSpeed}
                    onChange={handleSpeedChange}
                    className="bg-transparent text-white text-sm font-bold outline-none cursor-pointer"
                >
                    <option value="0.5">0.5×</option>
                    <option value="1">1×</option>
                    <option value="2">2×</option>
                    <option value="5">5×</option>
                </select>
            </div>

            {/* 3. Progress bar (flex fills remaining space) */}
            <div className="flex-1 flex flex-col justify-center gap-1.5 mr-4 max-w-2xl">
                <div className="flex justify-between items-center px-1">
                    <span className="text-slate-400 text-xs font-semibold">Continuous Simulation Tracking</span>
                    <span className="text-white text-xs font-bold font-mono">
                        Time: {uptimeMinutes}m {uptimeSeconds}s
                    </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden border border-slate-700">
                    <div
                        className="bg-indigo-500 h-1.5 transition-all duration-1000 ease-linear rounded-full"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            {/* 4. Connection indicator and Benchmark */}
            <div className="flex items-center gap-4 shrink-0 px-3 py-1.5 border-l border-slate-700 ml-4">
                <button
                    onClick={() => document.dispatchEvent(new CustomEvent('open-benchmark'))}
                    className="px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2"
                >
                    <span>📊</span> Benchmark
                </button>

                <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5 border border-slate-700">
                    <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-red-500'}`} />
                    <span className="text-xs font-bold text-slate-300 w-20">
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
            </div>
        </div>
    );
}
