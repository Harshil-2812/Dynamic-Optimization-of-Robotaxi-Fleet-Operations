// BottomBar.jsx – Slim smart city bottom status bar

import useSimulationStore from '../store/simulationStore';

const MARQUEE_ITEMS = [
    'NOVA CITY SMART MOBILITY',
    'EV FLEET: ZERO EMISSIONS',
    'METRO + BUS + ROBOTAXI INTEGRATION',
    'ROLLING HORIZON ACTIVE',
    'SERVING 20 LONDON ZONES',
];

const LOG_COLORS = {
    success: '#39FF14',
    info: '#00F5FF',
    warn: '#F59E0B',
    error: '#EF4444',
};

export default function BottomBar({ showMetrics, onToggleMetrics }) {
    const { tick, isConnected, eventLog } = useSimulationStore();

    const progressPct = Math.min(100, (tick / 500) * 100);

    // Build marquee from log entries or default slogans
    const last5 = eventLog.slice(0, 5);
    const baseItems = last5.length > 0
        ? last5.map(e => e.message)
        : MARQUEE_ITEMS;

    // Double for seamless loop
    const allItems = [...baseItems, ...MARQUEE_ITEMS];
    const marqueeText = allItems.join('   ◆   ');

    return (
        <div className="w-full h-full flex items-center px-3 gap-3
                        bg-black/90 backdrop-blur-md border-t border-cyan-500/15
                        shadow-[0_-4px_20px_rgba(0,245,255,0.05)]">

            {/* ── Left: marquee ── */}
            <div className="flex-1 overflow-hidden min-w-0 h-full flex items-center">
                <div className="overflow-hidden w-full">
                    <div className="marquee-inner font-mono-cyber text-[9px]">
                        {allItems.map((item, i) => (
                            <span key={i}>
                                <span style={{
                                    color: i < last5.length && eventLog[i]
                                        ? (LOG_COLORS[eventLog[i].type] ?? '#00F5FF')
                                        : 'rgba(0,245,255,0.5)'
                                }}>
                                    {item}
                                </span>
                                <span className="mx-3 text-cyan-500/20">◆</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Center: progress bar + branding ── */}
            <div className="flex flex-col items-center gap-0.5 shrink-0 w-44">
                <div className="w-full h-0.5 bg-slate-900 rounded-full overflow-hidden border border-cyan-900/30">
                    <div className="h-full rounded-full transition-all duration-1000"
                        style={{
                            width: `${progressPct}%`,
                            background: 'linear-gradient(90deg,#00F5FF,#39FF14)',
                            boxShadow: '0 0 5px rgba(0,245,255,0.7)',
                        }} />
                </div>
                <span className="font-orbitron text-[6px] text-cyan-400/35 tracking-widest uppercase">
                    URBANFLOW V2.0 · CONTINUOUS SIMULATION
                </span>
            </div>

            {/* ── Right: status + metrics toggle ── */}
            <div className="flex items-center gap-1.5 shrink-0">
                {/* Connection pill */}
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded border font-mono-cyber text-[8px]
                                ${isConnected
                        ? 'bg-green-950/50 border-green-500/25 text-green-400'
                        : 'bg-red-950/50 border-red-500/25 text-red-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`}
                        style={isConnected ? { boxShadow: '0 0 4px rgba(57,255,20,0.9)' } : {}} />
                    {isConnected ? 'CONN' : 'DISC'}
                </div>

                {/* Metrics toggle */}
                <button onClick={onToggleMetrics}
                    className={`flex items-center gap-1 px-2.5 py-0.5 rounded border font-orbitron text-[8px]
                               uppercase tracking-widest cursor-pointer transition-all duration-200
                               ${showMetrics
                            ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300 shadow-[0_0_8px_rgba(0,245,255,0.3)]'
                            : 'bg-black/40 border-cyan-500/15 text-cyan-400/60 hover:border-cyan-500/45 hover:text-cyan-400'}`}>
                    📊 METRICS
                </button>
            </div>
        </div>
    );
}
