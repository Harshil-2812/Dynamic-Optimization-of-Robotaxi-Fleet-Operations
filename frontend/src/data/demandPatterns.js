// demandPatterns.js — Time-of-day demand configuration for UrbanFlow

/** Minutes-from-midnight thresholds for each period */
export const TIME_PERIODS = [
    { id: 'quiet', label: 'QUIET HOURS', startH: 0, endH: 6, multiplier: 0.20, color: '#475569', icon: '🌙' },
    { id: 'morning', label: '⚡ MORNING RUSH', startH: 6, endH: 9, multiplier: 1.00, color: '#f59e0b', icon: '☀️' },
    { id: 'midday', label: 'MIDDAY', startH: 9, endH: 12, multiplier: 0.60, color: '#00F5FF', icon: '🌤️' },
    { id: 'lunch', label: 'LUNCH PEAK', startH: 12, endH: 14, multiplier: 0.80, color: '#f59e0b', icon: '🍽️' },
    { id: 'afternoon', label: 'AFTERNOON', startH: 14, endH: 17, multiplier: 0.55, color: '#00F5FF', icon: '🌤️' },
    { id: 'evening', label: '⚡ EVENING RUSH', startH: 17, endH: 20, multiplier: 0.95, color: '#f59e0b', icon: '🌆' },
    { id: 'night', label: 'EVENING', startH: 20, endH: 23, multiplier: 0.50, color: '#00F5FF', icon: '🌃' },
    { id: 'late', label: 'LATE NIGHT', startH: 23, endH: 24, multiplier: 0.30, color: '#334155', icon: '🌑' },
];

/** Node types that get a +0.4 demand bonus during each rush period */
export const HOT_ZONES = {
    morning: ['transit_hub', 'commercial', 'education'],
    lunch: ['commercial', 'civic'],
    evening: ['transit_hub', 'residential'],
    late: ['entertainment'],
};

/** Return the period object for a given simTime (minutes from midnight) */
export function getCurrentPeriod(simTime) {
    const hour = Math.floor(simTime / 60) % 24;
    return TIME_PERIODS.find(p => hour >= p.startH && hour < p.endH) ?? TIME_PERIODS[0];
}

/** Format simTime (minutes) → "HH:MM" */
export function formatSimTime(simTime) {
    const total = Math.abs(simTime) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Demand multiplier for a node type at a given simTime */
export function getDemandMultiplier(simTime, nodeType) {
    const period = getCurrentPeriod(simTime);
    const periodId = period.id;
    const hotZoneTypes = HOT_ZONES[periodId] ?? [];
    const bonus = hotZoneTypes.includes(nodeType) ? 0.4 : 0;
    return period.multiplier + bonus;
}
