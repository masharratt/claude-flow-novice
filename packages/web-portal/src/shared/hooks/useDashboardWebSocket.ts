/**
 * Dashboard WebSocket Hook
 * Specialized hook for dashboard state management with WebSocket
 */

import { useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import type {
  WebSocketClientConfig,
  DashboardWebSocketState,
  UseDashboardWebSocketReturn,
  WebSocketMessage
} from '../types/websocket';

export function useDashboardWebSocket(
  initialData: Partial<DashboardWebSocketState> = {},
  config: WebSocketClientConfig = {}
): UseDashboardWebSocketReturn {
  const [dashboardState, setDashboardState] = useState<DashboardWebSocketState>({
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

  // Initialize WebSocket with dashboard-specific message handlers
  const webSocket = useWebSocket({
    ...config,
    onMessage: (message: WebSocketMessage) => {
      handleDashboardMessage(message);
      config.onMessage?.(message);
    },
    onConnect: () => {
      setDashboardState(prev => ({
        ...prev,
        connected: true,
        error: null,
        loading: false,
        lastUpdated: new Date()
      }));
      config.onConnect?.();
    },
    onDisconnect: (reason) => {
      setDashboardState(prev => ({
        ...prev,
        connected: false,
        lastUpdated: new Date()
      }));
      config.onDisconnect?.(reason);
    },
    onError: (error) => {
      setDashboardState(prev => ({
        ...prev,
        connected: false,
        error: error.message,
        loading: false,
        lastUpdated: new Date()
      }));
      config.onError?.(error);
    }
  });

  /**
   * Handle dashboard-specific messages
   */
  const handleDashboardMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'agent_update':
      case 'mcp-status':
        setDashboardState(prev => ({
          ...prev,
          statuses: {
            ...prev.statuses,
            ...(message.payload.statuses || {})
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
      case 'swarm-metrics':
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
          events: [
            message.payload.event || message.payload,
            ...prev.events.slice(0, 999) // Keep last 1000 events
          ],
          lastUpdated: new Date()
        }));
        break;

      case 'agents-update':
        setDashboardState(prev => ({
          ...prev,
          agents: message.payload.agents || message.payload || prev.agents,
          lastUpdated: new Date()
        }));
        break;

      case 'tasks-update':
        setDashboardState(prev => ({
          ...prev,
          events: [
            ...(message.payload.tasks || message.payload || []),
            ...prev.events.slice(0, 999)
          ],
          lastUpdated: new Date()
        }));
        break;

      case 'initial-data':
      case 'full-sync':
      case 'swarm-data-update':
        const data = message.payload.data || message.payload;
        setDashboardState(prev => ({
          ...prev,
          agents: data.agents || prev.agents,
          metrics: data.metrics || prev.metrics,
          events: data.tasks ? [...data.tasks, ...prev.events.slice(0, 999)] : prev.events,
          lastUpdated: new Date()
        }));
        break;

      case 'error':
        setDashboardState(prev => ({
          ...prev,
          error: message.payload.message || 'Unknown error',
          lastUpdated: new Date()
        }));
        break;

      default:
        // Unknown message type - log for debugging
        if (config.debug) {
          console.log('[useDashboardWebSocket] Unknown message type:', message.type, message);
        }
    }
  }, [config.debug]);

  /**
   * Refresh dashboard data
   */
  const refreshData = useCallback(() => {
    if (webSocket.isConnected) {
      webSocket.sendMessage('refresh', {});
      webSocket.sendMessage('request-mcp-status', {});
      webSocket.sendMessage('request-swarm-metrics', {});
      webSocket.sendMessage('request-full-sync', {});
    }
  }, [webSocket]);

  /**
   * Update filters
   */
  const updateFilters = useCallback((filters: Partial<DashboardWebSocketState['filters']>) => {
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
}

export default useDashboardWebSocket;
