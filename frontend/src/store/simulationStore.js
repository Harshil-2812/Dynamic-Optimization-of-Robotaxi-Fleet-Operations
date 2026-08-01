// simulationStore.js - Global state store for simulation data (Zustand)

import { create } from 'zustand';

const useSimulationStore = create((set) => ({
    // -------------------------------------------------------------------------
    // State — PRESERVED EXACTLY
    // -------------------------------------------------------------------------
    vehicles: [],
    passengers: [],
    graphData: null,
    congestion: {},
    metrics: { proposed: {}, baseline: {} },
    tick: 0,
    isRunning: false,
    isPaused: false,
    simulationSpeed: 1,
    selectedOrigin: null,
    selectedDestination: null,
    activeBooking: null,
    isConnected: false,
    rideEvents: [],           // live ride status events from backend

    // -------------------------------------------------------------------------
    // Actions — PRESERVED EXACTLY
    // -------------------------------------------------------------------------
    setVehicles: (vehicles) => set({ vehicles }),
    setPassengers: (passengers) => set({ passengers }),
    setGraphData: (data) => set({ graphData: data }),
    updateCongestion: (congestionMap) => set({ congestion: congestionMap }),
    updateMetrics: (metrics) => set({
        metrics: {
            proposed: metrics?.proposed ?? {},
            baseline: metrics?.baseline ?? {},
        },
    }),
    setTick: (tick) => set({ tick }),
    setRunning: (bool) => set({ isRunning: bool }),
    setPaused: (bool) => set({ isPaused: bool }),
    setSpeed: (multiplier) => set({ simulationSpeed: multiplier }),
    setOrigin: (nodeId) => set({ selectedOrigin: nodeId }),
    setDestination: (nodeId) => set({ selectedDestination: nodeId }),
    setActiveBooking: (booking) => set({ activeBooking: booking }),
    setConnected: (bool) => set({ isConnected: bool, isRunning: bool }),
    clearBookingSelection: () => set({ selectedOrigin: null, selectedDestination: null }),

    updateFromWebSocket: (message) => {
        if (!message) return;
        const update = {};
        if (message.tick !== undefined) update.tick = message.tick;
        if (message.vehicles) update.vehicles = message.vehicles;
        if (message.passengers) update.passengers = message.passengers;
        if (message.graph_congestion) update.congestion = message.graph_congestion;
        if (message.metrics?.series) {
            update.metrics = {
                proposed: message.metrics.series.proposed ?? {},
                baseline: message.metrics.series.baseline ?? {},
            };
        }
        // Process ride events from backend
        if (message.events && message.events.length > 0) {
            update._newEvents = message.events.map(e => ({
                ...e,
                wallTime: Date.now(),
            }));
        }
        set(s => {
            const base = { ...s, ...update, simTime: (s.simTime + 1) % 1440 };
            if (update._newEvents) {
                base.rideEvents = [...update._newEvents, ...s.rideEvents].slice(0, 50);
                // Update activeBooking status if event references it
                if (s.activeBooking) {
                    const pid = s.activeBooking.passenger_id;
                    const relevant = update._newEvents.filter(e => e.passenger_id === pid);
                    if (relevant.length > 0) {
                        const last = relevant[relevant.length - 1];
                        base.activeBooking = {
                            ...s.activeBooking,
                            status: last.type,
                            vehicle_id: last.vehicle_id ?? s.activeBooking.vehicle_id,
                        };
                    }
                }
            }
            return base;
        });
    },

    // -------------------------------------------------------------------------
    // NEW: UI toggle flags
    // -------------------------------------------------------------------------
    showHeatmap: true,
    showRouteTrails: false,
    showVehicleLabels: false,
    showTransit: true,

    // -------------------------------------------------------------------------
    // NEW: Sim time (minutes from midnight; 420 = 07:00)
    // -------------------------------------------------------------------------
    simTime: 420,

    // -------------------------------------------------------------------------
    // NEW: Event log
    // -------------------------------------------------------------------------
    eventLog: [],

    // -------------------------------------------------------------------------
    // NEW: Demand spike visual flag
    // -------------------------------------------------------------------------
    demandSpikeActive: false,

    // -------------------------------------------------------------------------
    // NEW: Actions
    // -------------------------------------------------------------------------
    setShowHeatmap: (v) => set({ showHeatmap: v }),
    setShowRouteTrails: (v) => set({ showRouteTrails: v }),
    setShowVehicleLabels: (v) => set({ showVehicleLabels: v }),
    setShowTransit: (v) => set({ showTransit: v }),
    incrementSimTime: () => set(s => ({ simTime: (s.simTime + 1) % 1440 })),
    setDemandSpikeActive: (v) => set({ demandSpikeActive: v }),

    addLogEntry: (entry) =>
        set(s => ({ eventLog: [entry, ...s.eventLog].slice(0, 30) })),

    clearRideEvents: () => set({ rideEvents: [] }),
    addRideEvent: (event) =>
        set(s => ({ rideEvents: [event, ...s.rideEvents].slice(0, 50) })),
}));

export default useSimulationStore;
