import { useState, useEffect, useCallback, useRef } from 'react';
import { Agent, Task, SwarmMetrics } from '@/types/swarm';

interface RealtimeDataState {
  agents: Agent[];
  tasks: Task[];
  metrics: SwarmMetrics;
  isConnected: boolean;
  lastUpdate: Date | null;
  connectionError: string | null;
}

interface UseSwarmRealtimeDataOptions {
  swarmId: string;
  websocketUrl?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  enableReconnect?: boolean;
  heartbeatInterval?: number;
}

interface WebSocketMessage {
  type: string;
  swarmId?: string;
  data?: any;
  timestamp?: string;
}

const DEFAULT_OPTIONS: Partial<UseSwarmRealtimeDataOptions> = {
  websocketUrl: 'ws://localhost:8080',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  enableReconnect: true,
  heartbeatInterval: 30000
};

export const useSwarmRealtimeData = (options: UseSwarmRealtimeDataOptions) => {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const [state, setState] = useState<RealtimeDataState>({
    agents: [],
    tasks: [],
    metrics: {
      totalAgents: 0,
      activeAgents: 0,
      completedTasks: 0,
      totalTasks: 0,
      averageConfidence: 0,
      systemHealth: 0,
      processingTime: 0,
      memoryUsage: 0,
      networkLatency: 0
    },
    isConnected: false,
    lastUpdate: null,
    connectionError: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Heartbeat function
  const sendHeartbeat = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      }));
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    try {
      const wsUrl = `${config.websocketUrl}/swarm/${config.swarmId}/visualization`;
      console.log(`Connecting to WebSocket: ${wsUrl}`);

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected successfully');
        setState(prev => ({
          ...prev,
          isConnected: true,
          connectionError: null
        }));
        reconnectAttemptsRef.current = 0;

        // Start heartbeat
        if (config.heartbeatInterval) {
          heartbeatIntervalRef.current = setInterval(sendHeartbeat, config.heartbeatInterval);
        }

        // Request initial data
        wsRef.current?.send(JSON.stringify({
          type: 'request-full-sync',
          swarmId: config.swarmId
        }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          const timestamp = new Date(message.timestamp || Date.now());

          switch (message.type) {
            case 'initial-data':
            case 'full-sync':
              if (message.data) {
                setState(prev => ({
                  ...prev,
                  agents: message.data.agents || [],
                  tasks: message.data.tasks || [],
                  metrics: message.data.metrics || prev.metrics,
                  lastUpdate: timestamp
                }));
              }
              break;

            case 'agents-update':
              if (message.agents) {
                setState(prev => ({
                  ...prev,
                  agents: message.agents,
                  lastUpdate: timestamp
                }));
              }
              break;

            case 'tasks-update':
              if (message.tasks) {
                setState(prev => ({
                  ...prev,
                  tasks: message.tasks,
                  lastUpdate: timestamp
                }));
              }
              break;

            case 'metrics-update':
              if (message.metrics) {
                setState(prev => ({
                  ...prev,
                  metrics: message.metrics,
                  lastUpdate: timestamp
                }));
              }
              break;

            case 'agent-status-change':
              if (message.agentId && message.updates) {
                setState(prev => ({
                  ...prev,
                  agents: prev.agents.map(agent =>
                    agent.id === message.agentId
                      ? { ...agent, ...message.updates, lastUpdate: timestamp }
                      : agent
                  ),
                  lastUpdate: timestamp
                }));
              }
              break;

            case 'task-status-change':
              if (message.taskId && message.updates) {
                setState(prev => ({
                  ...prev,
                  tasks: prev.tasks.map(task =>
                    task.id === message.taskId
                      ? { ...task, ...message.updates }
                      : task
                  ),
                  lastUpdate: timestamp
                }));
              }
              break;

            case 'swarm-data-update':
              if (message.data) {
                setState(prev => ({
                  ...prev,
                  agents: message.data.agents || prev.agents,
                  tasks: message.data.tasks || prev.tasks,
                  metrics: message.data.metrics || prev.metrics,
                  lastUpdate: timestamp
                }));
              }
              break;

            case 'connection-established':
              console.log('Connection established with server:', message.connectionId);
              break;

            case 'pong':
              // Heartbeat response
              break;

            default:
              console.log('Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        setState(prev => ({
          ...prev,
          isConnected: false,
          connectionError: event.reason || 'Connection closed'
        }));

        // Cleanup heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Attempt reconnection if enabled
        if (config.enableReconnect && reconnectAttemptsRef.current < (config.maxReconnectAttempts || 10)) {
          reconnectAttemptsRef.current++;
          console.log(`Attempting reconnection ${reconnectAttemptsRef.current}/${config.maxReconnectAttempts}...`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, config.reconnectInterval);
        } else {
          console.log('Max reconnection attempts reached or reconnection disabled');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({
          ...prev,
          connectionError: 'WebSocket connection error',
          isConnected: false
        }));
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setState(prev => ({
        ...prev,
        connectionError: 'Failed to create connection',
        isConnected: false
      }));
    }
  }, [config, sendHeartbeat]);

  // Manual reconnection
  const reconnect = useCallback(() => {
    cleanup();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [cleanup, connect]);

  // Send message to server
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Subscribe to specific swarm
  const subscribeToSwarm = useCallback((swarmId: string) => {
    return sendMessage({
      type: 'subscribe-to-swarm',
      swarmId
    });
  }, [sendMessage]);

  // Request full data sync
  const requestFullSync = useCallback(() => {
    return sendMessage({
      type: 'request-full-sync',
      swarmId: config.swarmId
    });
  }, [sendMessage, config.swarmId]);

  // Initialize connection
  useEffect(() => {
    connect();

    return cleanup;
  }, [connect, cleanup]);

  return {
    // State
    agents: state.agents,
    tasks: state.tasks,
    metrics: state.metrics,
    isConnected: state.isConnected,
    lastUpdate: state.lastUpdate,
    connectionError: state.connectionError,

    // Actions
    reconnect,
    sendMessage,
    subscribeToSwarm,
    requestFullSync,

    // Utilities
    reconnectAttempts: reconnectAttemptsRef.current
  };
};

export default useSwarmRealtimeData;