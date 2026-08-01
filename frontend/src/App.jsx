// App.jsx – Smart City Command Center shell

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import BookingPanel from './components/BookingPanel';
import CityMap from './components/CityMap';
import FleetStatusBar from './components/FleetStatusBar';
import MetricsDashboard from './components/MetricsDashboard';
import RightSidebar from './components/RightSidebar';
import BottomBar from './components/BottomBar';
import BenchmarkModal from './components/BenchmarkModal';
import useWebSocket from './hooks/useWebSocket';
import useSimulationStore from './store/simulationStore';


/* ── Main App ─────────────────────────────────────────────────────────────── */
export default function App() {
    useWebSocket();

    const { demandSpikeActive } = useSimulationStore();

    const [showMetrics, setShowMetrics] = useState(false);
    const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);
    const [isBenchmarkRunning, setIsBenchmarkRunning] = useState(false);

    useEffect(() => {
        const open = async () => {
            setIsBenchmarkOpen(true);
            setIsBenchmarkRunning(true);
            try { await fetch('http://localhost:8000/api/run-benchmark', { method: 'POST' }); }
            catch (e) { console.error(e); }
            finally { setIsBenchmarkRunning(false); }
        };
        document.addEventListener('open-benchmark', open);
        return () => document.removeEventListener('open-benchmark', open);
    }, []);

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-[#050A0F] text-white">


            {/* Demand spike banner */}
            <AnimatePresence>
                {demandSpikeActive && (
                    <motion.div className="fixed top-14 left-1/2 z-[100] -translate-x-1/2
                                           px-6 py-2 bg-red-900/80 border border-red-400/60
                                           rounded-full font-orbitron text-red-300 text-xs
                                           tracking-widest shadow-[0_0_20px_rgba(239,68,68,0.5)]"
                        initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -20, opacity: 0 }}>
                        ⚡ DEMAND SPIKE ACTIVE
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── TOP BAR 52px ── */}
            <header className="h-[52px] shrink-0 z-50">
                <FleetStatusBar />
            </header>

            {/* ── BODY: 3-column ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* LEFT 280px */}
                <aside className="w-[280px] shrink-0 overflow-y-auto overflow-x-hidden p-2">
                    <BookingPanel />
                </aside>

                {/* CENTER: map */}
                <main className="flex-1 flex flex-col min-w-0 p-1.5">
                    <motion.div
                        className="glass-panel gradient-border rounded-xl flex-1 overflow-hidden relative"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.4 }}
                    >
                        <CityMap />
                    </motion.div>
                </main>

                {/* RIGHT 280px */}
                <aside className="w-[280px] shrink-0 overflow-y-auto overflow-x-hidden p-2">
                    <RightSidebar />
                </aside>
            </div>

            {/* ── BOTTOM BAR 38px ── */}
            <footer className="h-[38px] shrink-0 z-50">
                <BottomBar showMetrics={showMetrics} onToggleMetrics={() => setShowMetrics(v => !v)} />
            </footer>

            {/* ── METRICS DRAWER ── */}
            <AnimatePresence>
                {showMetrics && (
                    <motion.div
                        className="fixed bottom-[38px] left-0 right-0 z-40
                                   glass-panel border-t border-cyan-500/25 overflow-y-auto"
                        style={{ maxHeight: '54vh' }}
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    >
                        <div className="p-4"><MetricsDashboard /></div>
                    </motion.div>
                )}
            </AnimatePresence>

            <BenchmarkModal
                isOpen={isBenchmarkOpen}
                isRunning={isBenchmarkRunning}
                onClose={() => setIsBenchmarkOpen(false)}
            />
        </div>
    );
}
