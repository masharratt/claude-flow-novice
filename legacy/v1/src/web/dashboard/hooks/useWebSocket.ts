/**
 * WebSocket Hook for Real-time Updates
 * Provides WebSocket connection management for real-time dashboard updates
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { WebSocketMessage, WebSocketStatus, DashboardState } from '../types';

interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (message: WebSocketMessage) => void;
}

interface UseWebSocketReturn {
  socket: Socket | null;
  status: WebSocketStatus;
  isConnected: boolean;
  error: string | null;
  sendMessage: (type: string, payload: any) => void;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  disconnect: () => void;
  reconnect: () => void;
  lastMessage: WebSocketMessage | null;
}

export const useWebSocket = (options: UseWebSocketOptions = {}): UseWebSocketReturn => {
  const {
    url = `ws://${window.location.host}`,
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectDelay = 1000,
    heartbeatInterval = 30000,
    onConnect,
    onDisconnect,
    onError,
    onMessage
  } = options;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<WebSocketStatus>({
    connected: false,
    reconnectAttempts: 0,
    lastConnected: undefined,
    lastMessage: undefined,
    error: undefined
  });
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();
  const subscriptionsRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    try {
      const newSocket = io(url, {
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 10000,
        forceNew: true
      });

      socketRef.current = newSocket;
      setSocket(newSocket);

      // Connection established
      newSocket.on('connect', () => {
        console.log('WebSocket connected');
        setStatus(prev => ({
          ...prev,
          connected: true,
          reconnectAttempts: 0,
          lastConnected: new Date(),
          error: undefined
        }));
        setError(null);
        onConnect?.();

        // Start heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
          if (newSocket.connected) {
            newSocket.emit('ping');
          }
        }, heartbeatInterval);

        // Request initial data
        newSocket.emit('request-mcp-status');
        newSocket.emit('request-swarm-metrics');
      });

      // Connection lost
      newSocket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        setStatus(prev => ({
          ...prev,
          connected: false
        }));
        onDisconnect?.();

        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }

        // Auto-reconnect
        if (reason !== 'io client disconnect' && status.reconnectAttempts < reconnectAttempts) {
          const delay = reconnectDelay * Math.pow(2, status.reconnectAttempts);
          console.log(`Reconnecting in ${delay}ms...`);

          reconnectTimeoutRef.current = setTimeout(() => {
            setStatus(prev => ({
              ...prev,
              reconnectAttempts: prev.reconnectAttempts + 1
            }));
            connect();
          }, delay);
        }
      });

      // Connection error
      newSocket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        const errorMessage = error.message || 'Connection failed';
        setError(errorMessage);
        setStatus(prev => ({
          ...prev,
          connected: false,
          error: errorMessage
        }));
        onError?.(error);
      });

      // Handle messages
      newSocket.on('message', (data: WebSocketMessage) => {
        try {
          const message = typeof data === 'string' ? JSON.parse(data) : data;
          setLastMessage(message);
          setStatus(prev => ({
            ...prev,
            lastMessage: new Date()
          }));

          // Notify subscribers
          const subscribers = subscriptionsRef.current.get(message.type);
          if (subscribers) {
            subscribers.forEach(callback => callback(message.payload));
          }

          onMessage?.(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      // Handle specific dashboard events
      newSocket.on('mcp-status', (data) => {
        const message: WebSocketMessage = {
          type: 'agent_update',
          timestamp: new Date(),
          payload: data
        };
        setLastMessage(message);
        onMessage?.(message);
      });

      newSocket.on('swarm-metrics', (data) => {
        const message: WebSocketMessage = {
          type: 'metrics_update',
          timestamp: new Date(),
          payload: data
        };
        setLastMessage(message);
        onMessage?.(message);
      });

      newSocket.on('hierarchy-change', (data) => {
        const message: WebSocketMessage = {
          type: 'hierarchy_change',
          timestamp: new Date(),
          payload: data
        };
        setLastMessage(message);
        onMessage?.(message);
      });

      newSocket.on('event-stream', (data) => {
        const message: WebSocketMessage = {
          type: 'event_stream',
          timestamp: new Date(),
          payload: data
        };
        setLastMessage(message);
        onMessage?.(message);
      });

      newSocket.on('error', (data) => {
        const message: WebSocketMessage = {
          type: 'error',
          timestamp: new Date(),
          payload: data
        };
        setLastMessage(message);
        setError(data.message || 'WebSocket error');
        onMessage?.(message);
      });

      // Heartbeat response
      newSocket.on('pong', () => {
        // Heartbeat received
      });

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      onError?.(error instanceof Error ? error : new Error('Unknown error'));
    }
  }, [url, reconnectAttempts, reconnectDelay, heartbeatInterval, status.reconnectAttempts, onConnect, onDisconnect, onError, onMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSocket(null);
    setStatus(prev => ({
      ...prev,
      connected: false
    }));
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(connect, 100);
  }, [disconnect, connect]);

  const sendMessage = useCallback((type: string, payload: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message', { type, payload });
    } else {
      console.warn('WebSocket not connected, cannot send message:', type);
    }
  }, []);

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    if (!subscriptionsRef.current.has(event)) {
      subscriptionsRef.current.set(event, new Set());
    }
    subscriptionsRef.current.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      const subscribers = subscriptionsRef.current.get(event);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          subscriptionsRef.current.delete(event);
        }
      }
    };
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    socket,
    status,
    isConnected: status.connected,
    error,
    sendMessage,
    subscribe,
    disconnect,
    reconnect,
    lastMessage
  };
};

// Higher-order hook for dashboard state management
export const useDashboardWebSocket = (
  initialData: Partial<DashboardState>,
  options?: UseWebSocketOptions
) => {
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    agents: initialData.agents || [],
    statuses: initialData.statuses || {},
    events: initialData.events || [],
    metrics: initialData.metrics || null,
    alerts: initialData.alerts || [],
    resourceUsage: initialData.resourceUsage || {
      memoryUsage: 0,
      cpuUsage: 0,
      networkLatency: 0,
      diskUsage: 0
    },
    filters: initialData.filters || {},
    loading: initialData.loading || false,
    error: initialData.error || null,
    lastUpdated: initialData.lastUpdated || null,
    connected: initialData.connected || false
  });

  const webSocket = useWebSocket({
    ...options,
    onMessage: (message) => {
      switch (message.type) {
        case 'agent_update':
          setDashboardState(prev => ({
            ...prev,
            statuses: {
              ...prev.statuses,
              ...message.payload.statuses
            },
            lastUpdated: new Date()
          }));
          break;

        case 'hierarchy_change':
          setDashboardState(prev => ({
            ...prev,
            agents: message.payload.agents || prev.agents,
            lastUpdated: new Date()
          }));
          break;

        case 'metrics_update':
          setDashboardState(prev => ({
            ...prev,
            metrics: message.payload.metrics || prev.metrics,
            resourceUsage: message.payload.resourceUsage || prev.resourceUsage,
            alerts: message.payload.alerts || prev.alerts,
            lastUpdated: new Date()
          }));
          break;

        case 'event_stream':
          setDashboardState(prev => ({
            ...prev,
            events: [message.payload.event, ...prev.events.slice(0, 999)], // Keep last 1000 events
            lastUpdated: new Date()
          }));
          break;

        case 'error':
          setDashboardState(prev => ({
            ...prev,
            error: message.payload.message,
            lastUpdated: new Date()
          }));
          break;
      }

      options?.onMessage?.(message);
    },
    onConnect: () => {
      setDashboardState(prev => ({
        ...prev,
        connected: true,
        error: null,
        lastUpdated: new Date()
      }));
      options?.onConnect?.();
    },
    onDisconnect: () => {
      setDashboardState(prev => ({
        ...prev,
        connected: false,
        lastUpdated: new Date()
      }));
      options?.onDisconnect?.();
    },
    onError: (error) => {
      setDashboardState(prev => ({
        ...prev,
        connected: false,
        error: error.message,
        lastUpdated: new Date()
      }));
      options?.onError?.(error);
    }
  });

  const refreshData = useCallback(() => {
    if (webSocket.isConnected) {
      webSocket.sendMessage('refresh', {});
    }
  }, [webSocket]);

  const updateFilters = useCallback((filters: Partial<DashboardState['filters']>) => {
    setDashboardState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...filters }
    }));
  }, []);

  return {
    ...webSocket,
    dashboardState,
    setDashboardState,
    refreshData,
    updateFilters
  };
};

export default useWebSocket;