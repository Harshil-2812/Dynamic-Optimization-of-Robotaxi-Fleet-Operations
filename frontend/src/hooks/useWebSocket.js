// useWebSocket.js - Custom hook for managing WebSocket connection to the backend

import { useCallback, useEffect, useRef } from 'react';
import useSimulationStore from '../store/simulationStore';

const API_BASE = 'http://localhost:8000';
const RECONNECT_DELAY_CLOSE = 2000;   // ms — reconnect after clean close
const RECONNECT_DELAY_ERROR = 3000;   // ms — reconnect after error

/**
 * Custom hook that owns the WebSocket lifecycle.
 *
 * @param {string} url  WebSocket endpoint URL.
 * @returns {{ isConnected: boolean, sendMessage: Function, sendBooking: Function }}
 */
const useWebSocket = (url = 'ws://localhost:8000/ws') => {
    const socketRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const isMountedRef = useRef(true);

    const { updateFromWebSocket, setConnected, setGraphData, setActiveBooking, isConnected } =
        useSimulationStore();

    // ---------------------------------------------------------------------------
    // Graph fetch (called once on each successful WS open)
    // ---------------------------------------------------------------------------
    const fetchCityGraph = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/city-graph`);
            if (!res.ok) throw new Error(`City graph fetch failed: ${res.status}`);
            const data = await res.json();
            setGraphData(data);
        } catch (err) {
            console.error('[useWebSocket] fetchCityGraph error:', err);
        }
    }, [setGraphData]);

    // ---------------------------------------------------------------------------
    // Connect
    // ---------------------------------------------------------------------------
    const connect = useCallback(() => {
        if (!isMountedRef.current) return;

        // Clean up any existing socket before creating a new one
        if (socketRef.current) {
            socketRef.current.onclose = null;   // prevent double-reconnect
            socketRef.current.close();
        }

        const ws = new WebSocket(url);
        socketRef.current = ws;

        ws.onopen = () => {
            if (!isMountedRef.current) return;
            console.info('[useWebSocket] Connected');
            setConnected(true);
            fetchCityGraph();
        };

        let lastUpdate = 0;

        ws.onmessage = (event) => {
            if (!isMountedRef.current) return;
            try {
                const data = JSON.parse(event.data);
                const now = Date.now();
                if (now - lastUpdate > 100) {
                    updateFromWebSocket(data);
                    lastUpdate = now;
                }
            } catch (err) {
                console.error('[useWebSocket] Message parse error:', err);
            }
        };

        ws.onclose = () => {
            if (!isMountedRef.current) return;
            console.warn('[useWebSocket] Connection closed — reconnecting in', RECONNECT_DELAY_CLOSE, 'ms');
            setConnected(false);
            reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_CLOSE);
        };

        ws.onerror = (err) => {
            console.error('[useWebSocket] Socket error:', err);
            ws.close();   // triggers onclose → reconnect
        };
    }, [url, setConnected, fetchCityGraph, updateFromWebSocket]);

    // ---------------------------------------------------------------------------
    // Mount / unmount lifecycle
    // ---------------------------------------------------------------------------
    useEffect(() => {
        isMountedRef.current = true;
        connect();

        return () => {
            isMountedRef.current = false;
            clearTimeout(reconnectTimerRef.current);
            if (socketRef.current) {
                socketRef.current.onclose = null;   // suppress reconnect on unmount
                socketRef.current.close();
            }
        };
    }, [connect]);

    // ---------------------------------------------------------------------------
    // sendMessage — generic JSON sender
    // ---------------------------------------------------------------------------
    const sendMessage = useCallback((data) => {
        const ws = socketRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        } else {
            console.warn('[useWebSocket] sendMessage called while socket is not open');
        }
    }, []);

    // ---------------------------------------------------------------------------
    // sendBooking — POST a manual ride booking + update store
    // ---------------------------------------------------------------------------
    const sendBooking = useCallback(async (originNode, destinationNode) => {
        try {
            const res = await fetch(`${API_BASE}/api/book-ride`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    origin_node: originNode,
                    destination_node: destinationNode,
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Book ride failed (${res.status}): ${text}`);
            }

            const result = await res.json();
            // result = { passenger_id, message, origin_name, destination_name }
            setActiveBooking({
                passenger_id: result.passenger_id,
                status: 'waiting',
                vehicle_id: null,
                origin_name: result.origin_name ?? '',
                destination_name: result.destination_name ?? '',
            });

            return result;
        } catch (err) {
            console.error('[useWebSocket] sendBooking error:', err);
            throw err;
        }
    }, [setActiveBooking]);

    // ---------------------------------------------------------------------------
    // Exposed interface
    // ---------------------------------------------------------------------------
    return { isConnected, sendMessage, sendBooking };
};

export default useWebSocket;
