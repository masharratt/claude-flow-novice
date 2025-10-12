/**
 * Core WebSocket Hook
 * Provides WebSocket connection management with automatic reconnection
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { WebSocketClient } from '../services/WebSocketClient';
import type {
  WebSocketClientConfig,
  ConnectionStatus,
  ConnectionMetrics,
  WebSocketMessage,
  EventHandler,
  UnsubscribeFunction,
  UseWebSocketReturn
} from '../types/websocket';

export function useWebSocket(config: WebSocketClientConfig = {}): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>({
    state: 'disconnected' as any,
    connected: false,
    reconnectAttempts: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [metrics, setMetrics] = useState<ConnectionMetrics>({
    messagesReceived: 0,
    messagesSent: 0,
    bytesReceived: 0,
    bytesSent: 0,
    averageLatency: 0,
    uptime: 0,
    reconnections: 0,
    errors: 0
  });

  const clientRef = useRef<WebSocketClient | null>(null);
  const metricsIntervalRef = useRef<NodeJS.Timeout>();

  // Initialize WebSocket client
  useEffect(() => {
    const client = new WebSocketClient({
      ...config,
      onConnect: () => {
        setStatus(client.getStatus());
        setError(null);
        config.onConnect?.();
      },
      onDisconnect: (reason) => {
        setStatus(client.getStatus());
        config.onDisconnect?.(reason);
      },
      onError: (err) => {
        setError(err.message);
        setStatus(client.getStatus());
        config.onError?.(err);
      },
      onMessage: (message) => {
        setLastMessage(message);
        config.onMessage?.(message);
      },
      onReconnecting: (attempt, delay) => {
        setStatus(client.getStatus());
        config.onReconnecting?.(attempt, delay);
      },
      onReconnectFailed: () => {
        setStatus(client.getStatus());
        config.onReconnectFailed?.();
      }
    });

    clientRef.current = client;

    // Start metrics collection
    metricsIntervalRef.current = setInterval(() => {
      if (clientRef.current) {
        setMetrics(clientRef.current.getMetrics());
      }
    }, 1000);

    // Cleanup on unmount
    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
      }
    };
  }, []); // Empty deps - only initialize once

  const sendMessage = useCallback((type: string, payload: any) => {
    clientRef.current?.sendMessage(type, payload);
  }, []);

  const subscribe = useCallback(<T = any>(
    event: string,
    callback: EventHandler<T>,
    options?: any
  ): UnsubscribeFunction => {
    if (!clientRef.current) {
      return () => {};
    }
    return clientRef.current.subscribe(event, callback, options);
  }, []);

  const unsubscribe = useCallback((event: string, callback?: EventHandler) => {
    clientRef.current?.unsubscribe(event, callback);
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const reconnect = useCallback(() => {
    clientRef.current?.reconnect();
  }, []);

  const getMetrics = useCallback(() => {
    return clientRef.current?.getMetrics() || metrics;
  }, [metrics]);

  return {
    socket: clientRef.current?.['socket'] || null,
    status,
    isConnected: status.connected,
    error,
    metrics,
    sendMessage,
    subscribe,
    unsubscribe,
    disconnect,
    reconnect,
    lastMessage,
    getMetrics
  };
}

export default useWebSocket;
