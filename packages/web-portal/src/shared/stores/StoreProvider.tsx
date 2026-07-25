/**
 * Store Provider - Context provider for all Zustand stores
 * Features: Hydration from localStorage, cleanup on unmount, centralized store access
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAgentStore } from './agentStore';
import { useMetricsStore } from './metricsStore';
import { useEventsStore } from './eventsStore';
import { useUIStore } from './uiStore';

interface StoreContextValue {
  isHydrated: boolean;
  clearAllStores: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export const useStoreContext = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStoreContext must be used within StoreProvider');
  }
  return context;
};

interface StoreProviderProps {
  children: React.ReactNode;
  onHydrated?: () => void;
}

export const StoreProvider: React.FC<StoreProviderProps> = ({ children, onHydrated }) => {
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate stores from storage on mount
  useEffect(() => {
    const hydrateStores = async () => {
      try {
        // Zustand persist middleware handles hydration automatically
        // We just need to wait for it to complete
        await Promise.all([
          // Agent store hydrates from localStorage with TTL check
          new Promise<void>((resolve) => {
            const unsubscribe = useAgentStore.persist.onFinishHydration(() => {
              unsubscribe();
              resolve();
            });
          }),

          // Metrics store hydrates from sessionStorage
          new Promise<void>((resolve) => {
            const unsubscribe = useMetricsStore.persist.onFinishHydration(() => {
              unsubscribe();
              resolve();
            });
          }),

          // UI store hydrates from localStorage (permanent)
          new Promise<void>((resolve) => {
            const unsubscribe = useUIStore.persist.onFinishHydration(() => {
              unsubscribe();
              resolve();
            });
          })
        ]);

        setIsHydrated(true);
        onHydrated?.();

        if (process.env.NODE_ENV === 'development') {
          console.log('[StoreProvider] All stores hydrated successfully');
        }
      } catch (error) {
        console.error('[StoreProvider] Hydration error:', error);
        setIsHydrated(true); // Set hydrated anyway to prevent blocking
      }
    };

    hydrateStores();
  }, [onHydrated]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear volatile stores (events store has no persistence)
      useEventsStore.getState().reset();

      if (process.env.NODE_ENV === 'development') {
        console.log('[StoreProvider] Stores cleaned up on unmount');
      }
    };
  }, []);

  const clearAllStores = () => {
    useAgentStore.getState().reset();
    useMetricsStore.getState().reset();
    useEventsStore.getState().reset();
    useUIStore.getState().reset();

    // Clear all storage
    localStorage.removeItem('agent-store');
    sessionStorage.removeItem('metrics-store');
    localStorage.removeItem('ui-store');

    if (process.env.NODE_ENV === 'development') {
      console.log('[StoreProvider] All stores cleared');
    }
  };

  return (
    <StoreContext.Provider value={{ isHydrated, clearAllStores }}>
      {children}
    </StoreContext.Provider>
  );
};

/**
 * Hook to wait for store hydration before rendering
 */
export const useStoreHydration = () => {
  const { isHydrated } = useStoreContext();
  return isHydrated;
};

/**
 * HOC to wrap components that require hydrated stores
 */
export function withStoreHydration<P extends object>(
  Component: React.ComponentType<P>,
  LoadingComponent?: React.ComponentType
) {
  return (props: P) => {
    const isHydrated = useStoreHydration();

    if (!isHydrated) {
      return LoadingComponent ? <LoadingComponent /> : <div>Loading...</div>;
    }

    return <Component {...props} />;
  };
}
