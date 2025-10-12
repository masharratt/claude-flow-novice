/**
 * UI Store - User interface preferences and state
 * Features: localStorage persistence (permanent), Immer middleware, DevTools
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type Theme = 'light' | 'dark';
export type ViewType = 'dashboard' | 'agents' | 'metrics' | 'events' | 'settings';

export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  severities: Array<'info' | 'warning' | 'error' | 'critical'>;
}

export interface LayoutSettings {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  headerVisible: boolean;
  footerVisible: boolean;
  compactMode: boolean;
}

export interface ViewSettings {
  dashboard: {
    refreshInterval: number;
    widgetLayout: string[];
  };
  agents: {
    viewMode: 'grid' | 'list' | 'hierarchy';
    sortBy: 'name' | 'status' | 'created' | 'confidence';
    sortOrder: 'asc' | 'desc';
  };
  metrics: {
    chartType: 'line' | 'bar' | 'area';
    timeRange: '1h' | '6h' | '24h' | '7d';
    autoRefresh: boolean;
  };
  events: {
    groupByType: boolean;
    showTimestamps: boolean;
    pageSize: number;
  };
}

interface UIState {
  theme: Theme;
  activeView: ViewType;
  notifications: NotificationSettings;
  layout: LayoutSettings;
  views: ViewSettings;
  loading: boolean;
}

interface UIActions {
  // Theme
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  // Navigation
  setActiveView: (view: ViewType) => void;

  // Layout
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setHeaderVisible: (visible: boolean) => void;
  setFooterVisible: (visible: boolean) => void;
  setCompactMode: (compact: boolean) => void;
  toggleCompactMode: () => void;

  // Notifications
  setNotifications: (settings: Partial<NotificationSettings>) => void;
  toggleNotifications: () => void;

  // View settings
  updateViewSettings: <V extends ViewType>(view: V, settings: Partial<ViewSettings[V]>) => void;

  // State management
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export type UIStore = UIState & UIActions;

// Computed selectors
export const uiSelectors = {
  isDarkTheme: (state: UIStore): boolean => state.theme === 'dark',

  isSidebarVisible: (state: UIStore): boolean => !state.layout.sidebarCollapsed,

  canShowNotifications: (state: UIStore): boolean => state.notifications.enabled,

  getEffectivePageSize: (state: UIStore): number => {
    return state.layout.compactMode
      ? state.views.events.pageSize * 2
      : state.views.events.pageSize;
  },

  shouldAutoRefresh: (state: UIStore): boolean => {
    return state.activeView === 'metrics' && state.views.metrics.autoRefresh;
  },

  getRefreshInterval: (state: UIStore): number => {
    if (state.activeView === 'dashboard') {
      return state.views.dashboard.refreshInterval;
    }
    return 5000; // Default 5 seconds
  }
};

const initialState: UIState = {
  theme: 'dark',
  activeView: 'dashboard',
  notifications: {
    enabled: true,
    sound: true,
    desktop: false,
    severities: ['warning', 'error', 'critical']
  },
  layout: {
    sidebarCollapsed: false,
    sidebarWidth: 240,
    headerVisible: true,
    footerVisible: true,
    compactMode: false
  },
  views: {
    dashboard: {
      refreshInterval: 5000,
      widgetLayout: ['agents', 'metrics', 'events', 'system']
    },
    agents: {
      viewMode: 'grid',
      sortBy: 'created',
      sortOrder: 'desc'
    },
    metrics: {
      chartType: 'line',
      timeRange: '1h',
      autoRefresh: true
    },
    events: {
      groupByType: false,
      showTimestamps: true,
      pageSize: 50
    }
  },
  loading: false
};

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setTheme: (theme) => set((state) => {
          state.theme = theme;
        }),

        toggleTheme: () => set((state) => {
          state.theme = state.theme === 'light' ? 'dark' : 'light';
        }),

        setActiveView: (view) => set((state) => {
          state.activeView = view;
        }),

        setSidebarCollapsed: (collapsed) => set((state) => {
          state.layout.sidebarCollapsed = collapsed;
        }),

        toggleSidebar: () => set((state) => {
          state.layout.sidebarCollapsed = !state.layout.sidebarCollapsed;
        }),

        setSidebarWidth: (width) => set((state) => {
          state.layout.sidebarWidth = Math.max(200, Math.min(400, width));
        }),

        setHeaderVisible: (visible) => set((state) => {
          state.layout.headerVisible = visible;
        }),

        setFooterVisible: (visible) => set((state) => {
          state.layout.footerVisible = visible;
        }),

        setCompactMode: (compact) => set((state) => {
          state.layout.compactMode = compact;
        }),

        toggleCompactMode: () => set((state) => {
          state.layout.compactMode = !state.layout.compactMode;
        }),

        setNotifications: (settings) => set((state) => {
          state.notifications = { ...state.notifications, ...settings };
        }),

        toggleNotifications: () => set((state) => {
          state.notifications.enabled = !state.notifications.enabled;
        }),

        updateViewSettings: (view, settings) => set((state) => {
          state.views[view] = { ...state.views[view], ...settings } as any;
        }),

        setLoading: (loading) => set((state) => {
          state.loading = loading;
        }),

        reset: () => set(() => initialState)
      })),
      {
        name: 'ui-store',
        version: 1,
        // Permanent localStorage storage
        partialize: (state) => ({
          theme: state.theme,
          notifications: state.notifications,
          layout: state.layout,
          views: state.views
        })
      }
    ),
    { name: 'UIStore', enabled: process.env.NODE_ENV === 'development' }
  )
);
