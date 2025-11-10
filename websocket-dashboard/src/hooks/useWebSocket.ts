import { useState, useEffect, useRef, useCallback } from 'react';
import { WebSocketMessage, SwarmInfo, SwarmEvent } from '../types/websocket';

export const useWebSocket = (url: string = 'ws://localhost:3456') => {
  const [isConnected, setIsConnected] = useState(false);
  const [swarms, setSwarms] = useState<SwarmInfo[]>([]);
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to WebSocket server');
        setIsConnected(true);
        setError(null);
        
        // Request initial swarms data
        ws.send(JSON.stringify({
          type: 'request-swarms',
          timestamp: new Date().toISOString()
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('Received message:', message);

          switch (message.type) {
            case 'initial-swarms':
            case 'swarms-list':
              setSwarms(message.payload || []);
              break;
            
            case 'swarm-event':
              const swarmEvent: SwarmEvent = message.payload;
              setEvents(prev => [swarmEvent, ...prev.slice(0, 99)]); // Keep last 100 events
              
              // Update swarms list if event contains swarm data
              if (swarmEvent.swarmId) {
                setSwarms(prev => prev.map(swarm => 
                  swarm.id === swarmEvent.swarmId 
                    ? { ...swarm, ...swarmEvent.data }
                    : swarm
                ));
              }
              break;
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from WebSocket server');
        setIsConnected(false);
        // Auto-reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error');
      };

    } catch (err) {
      console.error('Error creating WebSocket connection:', err);
      setError('Failed to connect to WebSocket server');
    }
  }, [url]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendRequestSwarms = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'request-swarms',
        timestamp: new Date().toISOString()
      }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    swarms,
    events,
    error,
    sendRequestSwarms,
    disconnect,
    reconnect: connect
  };
};
