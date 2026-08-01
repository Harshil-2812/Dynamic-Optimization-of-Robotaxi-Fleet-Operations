// MetricsDashboard.jsx – Collapsible metrics panel — cyberpunk theme

import React, { useMemo } from 'react';
import {
    CartesianGrid, Legend, Line, LineChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import useSimulationStore from '../store/simulationStore';

/* ── Paper seed data — PRESERVED EXACTLY ─────────────────────────────────── */
const PAPER_DATA = {
    waitingTime: { proposed: [4.0, 3.8, 3.5, 3.2, 3.0, 2.8, 2.5, 2.3, 2.1, 2.0], baseline: [6.0, 5.7, 5.4, 5.2, 5.0, 4.8, 4.6, 4.4, 4.2, 4.0] },
    fleetUtilization: { proposed: [60, 65, 68, 72, 75, 78, 80, 84, 87, 90], baseline: [50, 53, 56, 58, 61, 63, 65, 67, 70, 73] },
    travelTime: { proposed: [24, 23.5, 23, 22.5, 22, 21.5, 21, 20, 19, 18], baseline: [30, 29, 28, 27.5, 27, 26.5, 26, 25.5, 25, 24] },
    operationalCost: { proposed: [120, 115, 110, 105, 100, 97, 93, 88, 84, 80], baseline: [150, 145, 140, 135, 130, 125, 122, 118, 114, 110] },
    energyConsumption: { proposed: [50, 48, 46, 44, 42, 40, 38, 37, 36, 35], baseline: [60, 58, 56, 55, 54, 53, 52, 51, 50, 48] },
    rideThroughput: { proposed: [200, 215, 230, 245, 255, 265, 280, 305, 325, 350], baseline: [175, 185, 200, 210, 215, 220, 230, 240, 250, 260] },
    congestionSensitivity: { proposed: [0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.46, 0.42, 0.40], baseline: [0.90, 0.87, 0.84, 0.82, 0.80, 0.78, 0.75, 0.72, 0.68, 0.62] },
    systemEfficiency: { proposed: [70, 73, 76, 79, 81, 84, 86, 89, 92, 95], baseline: [60, 62, 65, 67, 70, 72, 74, 76, 78, 80] },
    tripDelay: { proposed: [8.0, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5, 4.0, 3.0], baseline: [10.0, 9.5, 9.0, 8.7, 8.5, 8.2, 8.0, 7.5, 7.0, 6.0] },
    networkLoad: { proposed: [0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.57, 0.53, 0.50], baseline: [1.00, 0.95, 0.92, 0.90, 0.87, 0.84, 0.82, 0.80, 0.77, 0.72] },
    emissionReduction: { proposed: [40, 37, 35, 33, 31, 30, 28, 27, 25, 23], baseline: [50, 48, 46, 44, 42, 40, 39, 38, 37, 35] },
    scalabilityPerformance: { proposed: [65, 68, 72, 75, 78, 80, 83, 85, 88, 92], baseline: [55, 58, 61, 63, 65, 68, 70, 72, 74, 78] },
};

/* ── Chart config — PRESERVED EXACTLY ────────────────────────────────────── */
const CHART_CONFIG = [
    { id: 'waitingTime', title: 'Avg Passenger Waiting Time', yLabel: 'Waiting Time (min)', liveKey: 'waiting_time' },
    { id: 'fleetUtilization', title: 'Fleet Utilization Efficiency', yLabel: 'Utilization (%)', liveKey: 'fleet_utilization' },
    { id: 'travelTime', title: 'Travel Time Optimization', yLabel: 'Travel Time (min)', liveKey: 'travel_time' },
    { id: 'operationalCost', title: 'Operational Cost Reduction', yLabel: 'Cost Index', liveKey: 'operational_cost' },
    { id: 'energyConsumption', title: 'Energy Consumption Efficiency', yLabel: 'Energy Units', liveKey: 'fuel' },
    { id: 'rideThroughput', title: 'Ride Throughput Comparison', yLabel: 'Trips Served', liveKey: 'throughput' },
    { id: 'congestionSensitivity', title: 'Traffic Congestion Sensitivity', yLabel: 'Congestion Index', liveKey: 'traffic_load' },
    { id: 'systemEfficiency', title: 'System Efficiency Comparison', yLabel: 'Efficiency (%)', liveKey: 'service_rate' },
    { id: 'tripDelay', title: 'Trip Delay Reduction', yLabel: 'Delay (min)', liveKey: 'delay' },
    { id: 'networkLoad', title: 'Network Load Balancing', yLabel: 'Load Index', liveKey: 'traffic_load' },
    { id: 'emissionReduction', title: 'Emission Reduction Comparison', yLabel: 'Emission Units', liveKey: 'emission' },
    { id: 'scalabilityPerformance', title: 'Scalability Performance', yLabel: 'Performance Score', liveKey: 'fleet_utilization' },
];

const INTERVALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/* ── format helper — PRESERVED ───────────────────────────────────────────── */
function formatChartData(seedP, seedB, liveP, liveB) {
    return INTERVALS.map((iv, i) => ({
        interval: iv,
        proposed: +((liveP?.[i] ?? seedP[i]) ?? 0).toFixed(3),
        baseline: +((liveB?.[i] ?? seedB[i]) ?? 0).toFixed(3),
    }));
}

const TT = {
    contentStyle: { background: '#050A0F', border: '1px solid rgba(0,245,255,0.18)', borderRadius: 6, fontSize: 9 },
    labelStyle: { color: '#94a3b8' },
};

/* ── Memoized card ────────────────────────────────────────────────────────── */
const ChartCard = React.memo(function ChartCard({ title, yLabel, data }) {
    return (
        <div className="bg-black/60 backdrop-blur-sm rounded-xl p-3 flex flex-col gap-1
                        border border-cyan-500/15 hover:border-cyan-500/35 transition-colors">
            <h3 className="font-orbitron text-[8px] text-cyan-300/80 uppercase tracking-wide leading-tight mb-1">
                {title}
            </h3>
            <ResponsiveContainer width="100%" height={150}>
                <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" opacity={0.8} />
                    <XAxis dataKey="interval" tick={{ fontSize: 8, fill: '#334155' }}
                        label={{ value: 'Interval', position: 'insideBottom', offset: -2, fontSize: 7, fill: '#334155' }} />
                    <YAxis tick={{ fontSize: 8, fill: '#334155' }}
                        label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 12, fontSize: 7, fill: '#334155' }} />
                    <Tooltip {...TT} formatter={(v, n) => [v, n === 'proposed' ? 'Proposed' : 'Baseline']} />
                    <Legend wrapperStyle={{ fontSize: 8, paddingTop: 2 }}
                        formatter={n => n === 'proposed' ? 'Proposed' : 'Baseline'} />
                    <Line type="monotone" dataKey="proposed" stroke="#00F5FF" strokeWidth={2}
                        dot={false} activeDot={{ r: 3 }} style={{ filter: 'drop-shadow(0 0 3px #00F5FF)' }} />
                    <Line type="monotone" dataKey="baseline" stroke="#F59E0B" strokeWidth={1.5}
                        dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
});

/* ── Main dashboard ───────────────────────────────────────────────────────── */
export default function MetricsDashboard() {
    const { metrics } = useSimulationStore();

    const charts = useMemo(() =>
        CHART_CONFIG.map(cfg => {
            const seed = PAPER_DATA[cfg.id];
            return {
                ...cfg,
                data: formatChartData(
                    seed.proposed, seed.baseline,
                    metrics?.proposed?.[cfg.liveKey],
                    metrics?.baseline?.[cfg.liveKey],
                ),
            };
        }), [metrics]);

    return (
        <div className="w-full">
            <div className="flex items-center gap-3 mb-4 border-b border-cyan-500/15 pb-3">
                <span className="font-orbitron text-[10px] text-cyan-400 tracking-widest uppercase">
                    ◈ Performance Metrics — Proposed vs IEEE 2025 Baseline
                </span>
                <div className="flex items-center gap-4 ml-auto font-mono-cyber text-[9px] text-slate-500">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-0.5 bg-cyan-400 rounded"
                            style={{ boxShadow: '0 0 4px #00F5FF' }} />
                        Proposed
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-px border-b-2 border-dashed border-amber-400" />
                        Baseline
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
                {charts.map(cfg => (
                    <ChartCard key={cfg.id} title={cfg.title} yLabel={cfg.yLabel} data={cfg.data} />
                ))}
            </div>
        </div>
    );
}
