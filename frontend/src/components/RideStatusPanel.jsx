// RideStatusPanel.jsx — Live ride status events with time and stats

import { AnimatePresence, motion } from 'framer-motion';
import useSimulationStore from '../store/simulationStore';

const ICONS = {
    ride_dispatched: { icon: '🚗', label: 'Dispatched', color: '#3b82f6' },
    vehicle_at_pickup: { icon: '📍', label: 'Passenger picked up', color: '#f59e0b' },
    trip_complete: { icon: '✅', label: 'Trip complete', color: '#22c55e' },
};

function timeAgo(wallTime) {
    const diff = Math.floor((Date.now() - wallTime) / 1000);
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
}

function simTickToTime(tick) {
    // Each tick = 2.5 simulation seconds. Display as sim minutes.
    const mins = Math.floor(tick / 60);
    const secs = Math.floor(tick % 60);
    return `T+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function RideStatusPanel() {
    const { rideEvents, activeBooking, clearRideEvents } = useSimulationStore();

    if (rideEvents.length === 0 && !activeBooking) return null;

    return (
        <div className="flex flex-col gap-2 mt-2">
            {/* Active booking header */}
            {activeBooking && (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/40 p-3">
                    <div className="flex items-center justify-between mb-1">
                        <span className="font-orbitron text-[10px] text-cyan-400 tracking-widest">ACTIVE BOOKING</span>
                        <span className="text-[9px] text-slate-500 font-mono">{activeBooking.passenger_id}</span>
                    </div>
                    <div className="text-[11px] text-white font-semibold truncate">
                        {activeBooking.origin_name || '—'} → {activeBooking.destination_name || '—'}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                        Status:{' '}
                        <span className={`font-semibold ${activeBooking.status === 'trip_complete' ? 'text-green-400' :
                                activeBooking.status === 'vehicle_at_pickup' ? 'text-yellow-400' :
                                    'text-blue-400'
                            }`}>
                            {activeBooking.status === 'waiting' && '⏳ Waiting for vehicle'}
                            {activeBooking.status === 'ride_dispatched' && '🚗 Vehicle on the way'}
                            {activeBooking.status === 'vehicle_at_pickup' && '📍 Vehicle arrived — boarding'}
                            {activeBooking.status === 'trip_complete' && '✅ Delivered!'}
                        </span>
                    </div>
                </div>
            )}

            {/* Event log */}
            {rideEvents.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                        <span className="font-orbitron text-[9px] text-slate-500 tracking-widest">RIDE EVENTS</span>
                        <button
                            onClick={clearRideEvents}
                            className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                    <AnimatePresence initial={false}>
                        {rideEvents.slice(0, 12).map((ev, i) => {
                            const cfg = ICONS[ev.type] ?? { icon: '•', label: ev.type, color: '#64748b' };
                            return (
                                <motion.div
                                    key={`${ev.passenger_id}-${ev.type}-${ev.tick}`}
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="rounded-lg bg-slate-900/60 border border-slate-700/40 px-3 py-2"
                                >
                                    <div className="flex items-start gap-2">
                                        <span className="text-sm mt-0.5 shrink-0">{cfg.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                                <span className="text-[10px] font-semibold"
                                                    style={{ color: cfg.color }}>{cfg.label}</span>
                                                <span className="text-[9px] text-slate-600 font-mono shrink-0">
                                                    {simTickToTime(ev.tick)}
                                                </span>
                                            </div>

                                            {/* ride_dispatched */}
                                            {ev.type === 'ride_dispatched' && (
                                                <div className="text-[10px] text-slate-400">
                                                    <span className="text-slate-500">{ev.vehicle_id}</span>
                                                    {' → '}<span className="text-white">{ev.origin_name}</span>
                                                    {' → '}<span className="text-cyan-300">{ev.destination_name}</span>
                                                </div>
                                            )}

                                            {/* vehicle_at_pickup */}
                                            {ev.type === 'vehicle_at_pickup' && (
                                                <div className="text-[10px] text-slate-400">
                                                    <span className="text-white">{ev.node_name}</span>
                                                    {ev.waiting_time != null && (
                                                        <span className="text-slate-500 ml-1">
                                                            waited {ev.waiting_time.toFixed(1)}s
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* trip_complete */}
                                            {ev.type === 'trip_complete' && (
                                                <div className="text-[10px] text-slate-400 space-y-0.5">
                                                    <div>
                                                        <span className="text-white">{ev.origin_name}</span>
                                                        {' → '}
                                                        <span className="text-green-300">{ev.destination_name}</span>
                                                    </div>
                                                    <div className="flex gap-3 text-slate-500">
                                                        {ev.distance_km != null && (
                                                            <span>📏 {ev.distance_km} km</span>
                                                        )}
                                                        {ev.travel_time != null && (
                                                            <span>⏱ {ev.travel_time.toFixed(0)}s</span>
                                                        )}
                                                        {ev.waiting_time != null && (
                                                            <span>🕐 wait {ev.waiting_time.toFixed(0)}s</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
