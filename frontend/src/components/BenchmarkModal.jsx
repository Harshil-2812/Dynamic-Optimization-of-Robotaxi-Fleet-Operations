// BenchmarkModal.jsx
import React from 'react';

const API = 'http://localhost:8000';

const PLOT_IMAGES = [
    'waiting_time_comparison.png',
    'fleet_utilization_comparison.png',
    'vehicle_energy_comparison.png',
    'service_rate_comparison.png',
    'operational_cost_comparison.png'
];

export default function BenchmarkModal({ isOpen, isRunning, onClose }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-8">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-6xl h-full max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-800/50">
                    <h2 className="text-xl font-bold text-white flex items-center gap-3">
                        <span className="text-indigo-400">📊</span>
                        Simulation Benchmark Results
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={isRunning}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-6 flex flex-col bg-slate-900/50">
                    {isRunning ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-6">
                            <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                            <div className="text-center">
                                <h3 className="text-2xl font-bold text-white mb-2 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 animate-pulse">Running 500-Step Simulation...</h3>
                                <p className="text-slate-400">This will take a few seconds. Do not close this window.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-5xl mx-auto">
                            {PLOT_IMAGES.map((img, idx) => (
                                <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg group">
                                    <div className="p-3 bg-slate-800/80 border-b border-slate-700">
                                        <h4 className="text-sm font-semibold text-slate-300 capitalize">
                                            {img.replace(/_/g, ' ').replace('.png', '')}
                                        </h4>
                                    </div>
                                    <div className="aspect-video w-full bg-white flex items-center justify-center relative overflow-hidden p-2">
                                        <img
                                            src={`${API}/results/${img}?t=${Date.now()}`}
                                            alt={img}
                                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 mix-blend-multiply"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-800 bg-slate-800/50 flex justify-end shrink-0">
                    {isRunning ? (
                        <span className="text-sm text-slate-400 font-mono animate-pulse">Running benchmark script...</span>
                    ) : (
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                        >
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
