/**
 * UI Store Tests
 * Coverage: theme, layout, notifications, view settings, persistence
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore, uiSelectors, Theme, ViewType } from '../uiStore';

describe('UIStore', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
    localStorage.clear();
  });

  describe('Theme', () => {
    it('should set theme', () => {
      useUIStore.getState().setTheme('light');
      expect(useUIStore.getState().theme).toBe('light');
    });

    it('should toggle theme', () => {
      const initialTheme = useUIStore.getState().theme;
      useUIStore.getState().toggleTheme();
      const newTheme = useUIStore.getState().theme;

      expect(newTheme).not.toBe(initialTheme);
    });

    it('should toggle between light and dark', () => {
      useUIStore.getState().setTheme('dark');
      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe('light');

      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe('dark');
    });
  });

  describe('Navigation', () => {
    it('should set active view', () => {
      useUIStore.getState().setActiveView('metrics');
      expect(useUIStore.getState().activeView).toBe('metrics');
    });

    it('should change between views', () => {
      const views: ViewType[] = ['dashboard', 'agents', 'metrics', 'events', 'settings'];

      views.forEach(view => {
        useUIStore.getState().setActiveView(view);
        expect(useUIStore.getState().activeView).toBe(view);
      });
    });
  });

  describe('Layout', () => {
    it('should collapse sidebar', () => {
      useUIStore.getState().setSidebarCollapsed(true);
      expect(useUIStore.getState().layout.sidebarCollapsed).toBe(true);
    });

    it('should toggle sidebar', () => {
      const initial = useUIStore.getState().layout.sidebarCollapsed;
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().layout.sidebarCollapsed).toBe(!initial);
    });

    it('should set sidebar width', () => {
      useUIStore.getState().setSidebarWidth(300);
      expect(useUIStore.getState().layout.sidebarWidth).toBe(300);
    });

    it('should enforce min sidebar width', () => {
      useUIStore.getState().setSidebarWidth(150);
      expect(useUIStore.getState().layout.sidebarWidth).toBe(200); // Min is 200
    });

    it('should enforce max sidebar width', () => {
      useUIStore.getState().setSidebarWidth(500);
      expect(useUIStore.getState().layout.sidebarWidth).toBe(400); // Max is 400
    });

    it('should set header visibility', () => {
      useUIStore.getState().setHeaderVisible(false);
      expect(useUIStore.getState().layout.headerVisible).toBe(false);
    });

    it('should set footer visibility', () => {
      useUIStore.getState().setFooterVisible(false);
      expect(useUIStore.getState().layout.footerVisible).toBe(false);
    });

    it('should toggle compact mode', () => {
      useUIStore.getState().toggleCompactMode();
      expect(useUIStore.getState().layout.compactMode).toBe(true);
    });

    it('should set compact mode', () => {
      useUIStore.getState().setCompactMode(true);
      expect(useUIStore.getState().layout.compactMode).toBe(true);
    });
  });

  describe('Notifications', () => {
    it('should update notification settings', () => {
      useUIStore.getState().setNotifications({ enabled: false });
      expect(useUIStore.getState().notifications.enabled).toBe(false);
    });

    it('should toggle notifications', () => {
      const initial = useUIStore.getState().notifications.enabled;
      useUIStore.getState().toggleNotifications();
      expect(useUIStore.getState().notifications.enabled).toBe(!initial);
    });

    it('should update sound setting', () => {
      useUIStore.getState().setNotifications({ sound: false });
      expect(useUIStore.getState().notifications.sound).toBe(false);
    });

    it('should update desktop notification setting', () => {
      useUIStore.getState().setNotifications({ desktop: true });
      expect(useUIStore.getState().notifications.desktop).toBe(true);
    });

    it('should update severity filters', () => {
      useUIStore.getState().setNotifications({ severities: ['critical'] });
      expect(useUIStore.getState().notifications.severities).toEqual(['critical']);
    });
  });

  describe('View Settings', () => {
    it('should update dashboard settings', () => {
      useUIStore.getState().updateViewSettings('dashboard', { refreshInterval: 10000 });
      expect(useUIStore.getState().views.dashboard.refreshInterval).toBe(10000);
    });

    it('should update agents view settings', () => {
      useUIStore.getState().updateViewSettings('agents', { viewMode: 'list' });
      expect(useUIStore.getState().views.agents.viewMode).toBe('list');
    });

    it('should update metrics view settings', () => {
      useUIStore.getState().updateViewSettings('metrics', { chartType: 'bar' });
      expect(useUIStore.getState().views.metrics.chartType).toBe('bar');
    });

    it('should update events view settings', () => {
      useUIStore.getState().updateViewSettings('events', { pageSize: 100 });
      expect(useUIStore.getState().views.events.pageSize).toBe(100);
    });

    it('should partially update view settings', () => {
      useUIStore.getState().updateViewSettings('agents', { sortBy: 'name' });
      const agentsView = useUIStore.getState().views.agents;

      expect(agentsView.sortBy).toBe('name');
      expect(agentsView.viewMode).toBe('grid'); // Other settings unchanged
    });
  });

  describe('Computed Selectors', () => {
    it('should detect dark theme', () => {
      useUIStore.getState().setTheme('dark');
      const state = useUIStore.getState();
      expect(uiSelectors.isDarkTheme(state)).toBe(true);
    });

    it('should detect light theme', () => {
      useUIStore.getState().setTheme('light');
      const state = useUIStore.getState();
      expect(uiSelectors.isDarkTheme(state)).toBe(false);
    });

    it('should detect sidebar visibility', () => {
      useUIStore.getState().setSidebarCollapsed(false);
      let state = useUIStore.getState();
      expect(uiSelectors.isSidebarVisible(state)).toBe(true);

      useUIStore.getState().setSidebarCollapsed(true);
      state = useUIStore.getState();
      expect(uiSelectors.isSidebarVisible(state)).toBe(false);
    });

    it('should check if notifications can be shown', () => {
      useUIStore.getState().setNotifications({ enabled: true });
      let state = useUIStore.getState();
      expect(uiSelectors.canShowNotifications(state)).toBe(true);

      useUIStore.getState().setNotifications({ enabled: false });
      state = useUIStore.getState();
      expect(uiSelectors.canShowNotifications(state)).toBe(false);
    });

    it('should get effective page size in compact mode', () => {
      useUIStore.getState().updateViewSettings('events', { pageSize: 50 });
      useUIStore.getState().setCompactMode(false);
      let state = useUIStore.getState();
      expect(uiSelectors.getEffectivePageSize(state)).toBe(50);

      useUIStore.getState().setCompactMode(true);
      state = useUIStore.getState();
      expect(uiSelectors.getEffectivePageSize(state)).toBe(100); // 2x in compact mode
    });

    it('should detect auto-refresh for metrics view', () => {
      useUIStore.getState().setActiveView('metrics');
      useUIStore.getState().updateViewSettings('metrics', { autoRefresh: true });
      const state = useUIStore.getState();
      expect(uiSelectors.shouldAutoRefresh(state)).toBe(true);
    });

    it('should not auto-refresh for non-metrics views', () => {
      useUIStore.getState().setActiveView('dashboard');
      useUIStore.getState().updateViewSettings('metrics', { autoRefresh: true });
      const state = useUIStore.getState();
      expect(uiSelectors.shouldAutoRefresh(state)).toBe(false);
    });

    it('should get refresh interval for dashboard', () => {
      useUIStore.getState().setActiveView('dashboard');
      useUIStore.getState().updateViewSettings('dashboard', { refreshInterval: 3000 });
      const state = useUIStore.getState();
      expect(uiSelectors.getRefreshInterval(state)).toBe(3000);
    });

    it('should get default refresh interval for other views', () => {
      useUIStore.getState().setActiveView('agents');
      const state = useUIStore.getState();
      expect(uiSelectors.getRefreshInterval(state)).toBe(5000);
    });
  });

  describe('Persistence', () => {
    it('should persist to localStorage', () => {
      useUIStore.getState().setTheme('light');
      useUIStore.getState().setSidebarCollapsed(true);

      const stored = localStorage.getItem('ui-store');
      expect(stored).not.toBeNull();
    });

    it('should persist theme changes', () => {
      useUIStore.getState().setTheme('light');

      const stored = localStorage.getItem('ui-store');
      expect(stored).toContain('light');
    });

    it('should persist layout changes', () => {
      useUIStore.getState().setSidebarWidth(300);

      const stored = localStorage.getItem('ui-store');
      expect(stored).toContain('300');
    });

    it('should not persist loading state', () => {
      useUIStore.getState().setLoading(true);

      const stored = localStorage.getItem('ui-store');
      expect(stored).not.toBeNull();

      // Loading state should not be persisted (partialize filters it out)
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed?.state) {
        const state = typeof parsed.state === 'string' ? JSON.parse(parsed.state) : parsed.state;
        expect(state.loading).toBeUndefined();
      }
    });

    it('should not persist active view', () => {
      useUIStore.getState().setActiveView('metrics');

      const stored = localStorage.getItem('ui-store');
      expect(stored).not.toBeNull();

      // Active view should not be persisted (partialize filters it out)
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed?.state) {
        const state = typeof parsed.state === 'string' ? JSON.parse(parsed.state) : parsed.state;
        expect(state.activeView).toBeUndefined();
      }
    });
  });

  describe('State Management', () => {
    it('should set loading state', () => {
      useUIStore.getState().setLoading(true);
      expect(useUIStore.getState().loading).toBe(true);
    });

    it('should reset to initial state', () => {
      useUIStore.getState().setTheme('light');
      useUIStore.getState().setSidebarCollapsed(true);
      useUIStore.getState().setActiveView('metrics');
      useUIStore.getState().reset();

      const state = useUIStore.getState();
      expect(state.theme).toBe('dark'); // Default
      expect(state.layout.sidebarCollapsed).toBe(false); // Default
      expect(state.activeView).toBe('dashboard'); // Default
    });
  });

  describe('Integration', () => {
    it('should maintain consistent state across multiple updates', () => {
      useUIStore.getState().setTheme('light');
      useUIStore.getState().setSidebarCollapsed(true);
      useUIStore.getState().setActiveView('agents');
      useUIStore.getState().updateViewSettings('agents', { viewMode: 'list' });

      const state = useUIStore.getState();
      expect(state.theme).toBe('light');
      expect(state.layout.sidebarCollapsed).toBe(true);
      expect(state.activeView).toBe('agents');
      expect(state.views.agents.viewMode).toBe('list');
    });

    it('should handle rapid state changes', () => {
      for (let i = 0; i < 100; i++) {
        useUIStore.getState().toggleTheme();
      }

      // Should end up in the same state (even number of toggles)
      expect(useUIStore.getState().theme).toBe('dark');
    });
  });
});
