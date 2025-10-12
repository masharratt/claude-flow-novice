/**
 * WebSocket Event Hook
 * Subscribe to specific WebSocket events with TypeScript types
 */

import { useState, useEffect } from 'react';
import type { UseWebSocketReturn, UseWebSocketEventReturn } from '../types/websocket';

export function useWebSocketEvent<T = unknown>(
  webSocket: UseWebSocketReturn,
  eventType: string,
  options?: {
    filter?: (data: T) => boolean;
    transform?: (data: T) => T;
    debounceMs?: number;
  }
): UseWebSocketEventReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!webSocket.isConnected) {
      setLoading(true);
      return () => {
        // Cleanup function even when not connected to prevent leaks on connection state changes
      };
    }

    let debounceTimeout: NodeJS.Timeout | undefined;
    let unsubscribe: (() => void) | undefined;

    const handleEvent = (eventData: T) => {
      try {
        // Apply filter if provided
        if (options?.filter && !options.filter(eventData)) {
          return;
        }

        // Apply transform if provided
        const transformedData = options?.transform
          ? options.transform(eventData)
          : eventData;

        // Debounce if specified
        if (options?.debounceMs) {
          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
          }
          debounceTimeout = setTimeout(() => {
            setData(transformedData);
            setLastUpdated(new Date());
            setLoading(false);
            setError(null);
          }, options.debounceMs);
        } else {
          setData(transformedData);
          setLastUpdated(new Date());
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setLoading(false);
      }
    };

    // Subscribe to the event
    unsubscribe = webSocket.subscribe<T>(eventType, handleEvent);

    // Initial loading complete once connected
    setLoading(false);

    // Cleanup subscription on unmount or event change
    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [webSocket, eventType, options?.filter, options?.transform, options?.debounceMs]);

  return {
    data,
    loading,
    error,
    lastUpdated
  };
}

export default useWebSocketEvent;
