// cityGraph.js — London smart city node topology for UrbanFlow

export const CITY_NODES = [
    { id: 0, name: 'City Hall', type: 'civic', lat: 51.5055, lng: -0.0754 },
    { id: 1, name: 'London Bridge Stn', type: 'transit_hub', lat: 51.5048, lng: -0.0883 },
    { id: 2, name: 'Canary Wharf', type: 'commercial', lat: 51.5054, lng: -0.0235 },
    { id: 3, name: 'Oxford Street', type: 'commercial', lat: 51.5152, lng: -0.1415 },
    { id: 4, name: "King's Cross", type: 'transit_hub', lat: 51.5308, lng: -0.1238 },
    { id: 5, name: 'University of London', type: 'education', lat: 51.5218, lng: -0.1296 },
    { id: 6, name: 'Tech City (Shoreditch)', type: 'commercial', lat: 51.5257, lng: -0.0814 },
    { id: 7, name: 'Heathrow Airport', type: 'transit_hub', lat: 51.4700, lng: -0.4543 },
    { id: 8, name: 'Stratford', type: 'transit_hub', lat: 51.5416, lng: 0.0040 },
    { id: 9, name: 'O2 Arena', type: 'entertainment', lat: 51.5030, lng: 0.0032 },
    { id: 10, name: 'St Thomas Hospital', type: 'medical', lat: 51.4985, lng: -0.1193 },
    { id: 11, name: 'Greenwich', type: 'residential', lat: 51.4826, lng: -0.0077 },
    { id: 12, name: 'Canary Wharf Pier', type: 'transit_hub', lat: 51.5031, lng: -0.0178 },
    { id: 13, name: 'Battersea', type: 'industrial', lat: 51.4816, lng: -0.1449 },
    { id: 14, name: 'Notting Hill', type: 'residential', lat: 51.5130, lng: -0.1960 },
    { id: 15, name: 'Victoria Station', type: 'transit_hub', lat: 51.4965, lng: -0.1447 },
    { id: 16, name: 'Science Museum', type: 'civic', lat: 51.4978, lng: -0.1745 },
    { id: 17, name: 'Hampstead', type: 'residential', lat: 51.5560, lng: -0.1784 },
    { id: 18, name: 'Richmond Park', type: 'utility', lat: 51.4408, lng: -0.2760 },
    { id: 19, name: 'Royal Docks', type: 'transit_hub', lat: 51.5094, lng: 0.0484 },
];

/** Colour per zone type */
export const NODE_COLORS = {
    transit_hub: '#00F5FF',
    medical: '#ef4444',
    commercial: '#f59e0b',
    residential: '#64748b',
    education: '#a855f7',
    civic: '#3b82f6',
    entertainment: '#ec4899',
    industrial: '#78716c',
    utility: '#84cc16',
};

/** Node type icons */
export const NODE_ICONS = {
    transit_hub: '🚉',
    medical: '🏥',
    commercial: '🏢',
    residential: '🏘️',
    education: '🎓',
    civic: '🏛️',
    entertainment: '🎭',
    industrial: '🏭',
    utility: '🌿',
};

/** Road edges between city nodes */
export const CITY_EDGES = [
    { source: 0, target: 1, type: 'highway' },
    { source: 0, target: 6, type: 'highway' },
    { source: 0, target: 10, type: 'highway' },
    { source: 1, target: 2, type: 'highway' },
    { source: 1, target: 6, type: 'highway' },
    { source: 1, target: 10, type: 'highway' },
    { source: 1, target: 12, type: 'highway' },
    { source: 2, target: 9, type: 'highway' },
    { source: 2, target: 12, type: 'highway' },
    { source: 2, target: 19, type: 'highway' },
    { source: 3, target: 4, type: 'highway' },
    { source: 3, target: 5, type: 'highway' },
    { source: 3, target: 14, type: 'highway' },
    { source: 3, target: 15, type: 'highway' },
    { source: 3, target: 16, type: 'highway' },
    { source: 4, target: 5, type: 'highway' },
    { source: 4, target: 6, type: 'highway' },
    { source: 4, target: 8, type: 'highway' },
    { source: 4, target: 17, type: 'highway' },
    { source: 5, target: 6, type: 'highway' },
    { source: 5, target: 10, type: 'highway' },
    { source: 6, target: 8, type: 'highway' },
    { source: 7, target: 14, type: 'highway' },
    { source: 7, target: 15, type: 'highway' },
    { source: 8, target: 9, type: 'highway' },
    { source: 8, target: 19, type: 'highway' },
    { source: 9, target: 11, type: 'highway' },
    { source: 9, target: 12, type: 'highway' },
    { source: 10, target: 13, type: 'highway' },
    { source: 10, target: 15, type: 'highway' },
    { source: 11, target: 12, type: 'highway' },
    { source: 12, target: 19, type: 'highway' },
    { source: 13, target: 15, type: 'highway' },
    { source: 13, target: 16, type: 'highway' },
    { source: 13, target: 18, type: 'highway' },
    { source: 14, target: 15, type: 'highway' },
    { source: 14, target: 16, type: 'highway' },
    { source: 14, target: 17, type: 'highway' },
    { source: 15, target: 16, type: 'highway' },
    { source: 16, target: 18, type: 'highway' },
    { source: 17, target: 4, type: 'highway' },
];

/** Metro lines connecting city nodes */
export const METRO_LINES = [
    {
        id: 'M1', name: 'Elizabeth Line', color: '#9333ea',
        stops: [7, 14, 3, 15, 10, 1, 2, 19],
    },
    {
        id: 'M2', name: 'Jubilee Line', color: '#94a3b8',
        stops: [17, 4, 5, 6, 1, 12, 9, 11],
    },
];

/** Bus routes connecting city nodes */
export const BUS_ROUTES = [
    { id: 'B1', name: 'Airport Express', color: '#f59e0b', stops: [7, 15, 10, 1] },
    { id: 'B2', name: 'Hospital Loop', color: '#84cc16', stops: [15, 10, 13, 16] },
    { id: 'B3', name: 'East Connector', color: '#ec4899', stops: [4, 6, 8, 19, 9] },
];

/** Map a backend node id directly to a CITY_NODE */
export const getCityNode = (nodeId) => {
    const n = CITY_NODES.find(nd => nd.id === nodeId);
    return n ?? CITY_NODES[0];
};
export const getNodeById = (id) => CITY_NODES.find(n => n.id === id) ?? CITY_NODES[0];

/**
 * Given an ordered array of node IDs, return [{lat, lng}] for each.
 * Used to draw actual vehicle route polylines on the map.
 */
export const getPathCoords = (nodeIds = []) =>
    nodeIds.map(id => {
        const n = CITY_NODES.find(nd => nd.id === id);
        return n ? { lat: n.lat, lng: n.lng } : null;
    }).filter(Boolean);
