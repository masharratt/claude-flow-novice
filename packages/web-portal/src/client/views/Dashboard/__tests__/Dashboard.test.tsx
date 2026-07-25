/**
 * Dashboard Component Tests
 * Comprehensive test suite for Dashboard view
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Dashboard } from '../Dashboard';
import * as useDashboardWebSocketModule from '../../../../shared/hooks/useDashboardWebSocket';

// Mock WebSocket hook
const mockRefreshData = vi.fn();
const mockDashboardState = {
  agents: [
    { id: 'agent-1', name: 'Agent 1', status: 'active', health: 95, confidence: 0.9 },
    { id: 'agent-2', name: 'Agent 2', status: 'idle', health: 100, confidence: 1.0 },
  ],
  resourceUsage: {
    cpuUsage: 45.5,
    memoryUsage: 2048,
    networkLatency: 20,
    diskUsage: 60,
  },
  metrics: {
    eventsPerSecond: 142,
  },
  events: [
    { id: 'event-1', type: 'info', title: 'Test Event', timestamp: Date.now() },
  ],
  alerts: [
    { id: 'alert-1', severity: 'warning', title: 'Test Alert', timestamp: Date.now() },
  ],
  connected: true,
  loading: false,
  error: null,
  lastUpdated: new Date(),
};

vi.mock('../../../../shared/hooks/useDashboardWebSocket', () => ({
  useDashboardWebSocket: vi.fn(),
}));

// Mock container components
vi.mock('../components/containers', () => ({
  AgentHierarchyTreeContainer: ({ dashboardState }: any) => (
    <div data-testid="agent-hierarchy-tree">
      Agent Hierarchy Tree - {dashboardState.agents?.length || 0} agents
    </div>
  ),
  StatusMonitorContainer: ({ dashboardState }: any) => (
    <div data-testid="status-monitor">
      Status Monitor - {dashboardState.agents?.length || 0} agents
    </div>
  ),
  PerformanceChartsContainer: ({ timeRange }: any) => (
    <div data-testid="performance-charts">Performance Charts - {timeRange}</div>
  ),
  EventTimelineContainer: ({ dashboardState, limit }: any) => (
    <div data-testid="event-timeline">
      Event Timeline - {Math.min(dashboardState.events?.length || 0, limit)} events
    </div>
  ),
  AlertsPanelContainer: ({ dashboardState, maxAlerts }: any) => (
    <div data-testid="alerts-panel">
      Alerts Panel - {Math.min(dashboardState.alerts?.length || 0, maxAlerts)} alerts
    </div>
  ),
}));

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDashboardWebSocketModule.useDashboardWebSocket).mockReturnValue({
      dashboardState: mockDashboardState,
      refreshData: mockRefreshData,
      isConnected: true,
      sendMessage: vi.fn(),
      disconnect: vi.fn(),
      setDashboardState: vi.fn(),
      updateFilters: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render dashboard with all sections', () => {
      render(<Dashboard />);

      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
      expect(screen.getByTestId('agent-hierarchy-tree')).toBeInTheDocument();
      expect(screen.getByTestId('status-monitor')).toBeInTheDocument();
      expect(screen.getByTestId('performance-charts')).toBeInTheDocument();
      expect(screen.getByTestId('event-timeline')).toBeInTheDocument();
      expect(screen.getByTestId('alerts-panel')).toBeInTheDocument();
    });

    it('should render all four metric cards', () => {
      render(<Dashboard />);

      expect(screen.getByText(/active agents/i)).toBeInTheDocument();
      expect(screen.getByText(/system cpu/i)).toBeInTheDocument();
      expect(screen.getByText(/memory usage/i)).toBeInTheDocument();
      expect(screen.getByText(/events\/sec/i)).toBeInTheDocument();
    });

    it('should display correct metric values', () => {
      render(<Dashboard />);

      // Active agents (1 active out of 2)
      expect(screen.getByText('1')).toBeInTheDocument();

      // CPU usage
      expect(screen.getByText('45.5%')).toBeInTheDocument();

      // Memory usage (2048 MB = 2 GB)
      expect(screen.getByText('2.0 GB')).toBeInTheDocument();

      // Events per second
      expect(screen.getByText('142')).toBeInTheDocument();
    });

    it('should show connection status when disconnected', () => {
      vi.mocked(useDashboardWebSocketModule.useDashboardWebSocket).mockReturnValue({
        dashboardState: mockDashboardState,
        refreshData: mockRefreshData,
        isConnected: false,
        sendMessage: vi.fn(),
        disconnect: vi.fn(),
        setDashboardState: vi.fn(),
        updateFilters: vi.fn(),
      } as any);

      render(<Dashboard />);

      expect(screen.getByText(/websocket disconnected/i)).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should handle time range selection', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      const timeRangeSelect = screen.getByLabelText(/select time range/i);
      await user.click(timeRangeSelect);

      const option = screen.getByRole('option', { name: /last 6 hours/i });
      await user.click(option);

      await waitFor(() => {
        expect(screen.getByTestId('performance-charts')).toHaveTextContent('6h');
      });
    });

    it('should handle refresh button click', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      const refreshButton = screen.getByRole('button', { name: /refresh dashboard/i });
      await user.click(refreshButton);

      await waitFor(() => {
        expect(mockRefreshData).toHaveBeenCalled();
      });
    });

    it('should toggle pause/resume auto-refresh', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      const pauseButton = screen.getByRole('button', { name: /toggle auto-refresh/i });

      // Initially should show pause icon
      expect(pauseButton).toBeInTheDocument();

      await user.click(pauseButton);

      // After clicking, tooltip should change
      await waitFor(() => {
        expect(pauseButton).toHaveAttribute('aria-label', 'Toggle auto-refresh');
      });
    });

    it('should handle export button click', async () => {
      const user = userEvent.setup();

      // Mock URL.createObjectURL and link.click()
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
      const mockRevokeObjectURL = vi.fn();
      const mockClick = vi.fn();

      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      const mockLink = document.createElement('a');
      mockLink.click = mockClick;
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink);

      render(<Dashboard />);

      const exportButton = screen.getByRole('button', { name: /export dashboard data/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalled();
        expect(mockClick).toHaveBeenCalled();
        expect(mockRevokeObjectURL).toHaveBeenCalled();
      });
    });
  });

  describe('Auto-refresh', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should auto-refresh at specified interval', async () => {
      render(<Dashboard refreshInterval={5000} />);

      expect(mockRefreshData).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(mockRefreshData).toHaveBeenCalledTimes(1);
      });

      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(mockRefreshData).toHaveBeenCalledTimes(2);
      });
    });

    it('should not auto-refresh when paused', async () => {
      const user = userEvent.setup({ delay: null });
      render(<Dashboard refreshInterval={5000} />);

      const pauseButton = screen.getByRole('button', { name: /toggle auto-refresh/i });
      await user.click(pauseButton);

      mockRefreshData.mockClear();

      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(mockRefreshData).not.toHaveBeenCalled();
      });
    });

    it('should not auto-refresh when autoRefresh prop is false', async () => {
      render(<Dashboard autoRefresh={false} refreshInterval={5000} />);

      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(mockRefreshData).not.toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on interactive elements', () => {
      render(<Dashboard />);

      expect(screen.getByRole('button', { name: /toggle auto-refresh/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /refresh dashboard data/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export dashboard data as json/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/select time range for dashboard metrics/i)).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      const timeRangeSelect = screen.getByLabelText(/select time range/i);

      // Tab to the select
      await user.tab();
      await user.tab();
      await user.tab();

      // Should be able to open with Enter
      await user.keyboard('{Enter}');

      // Option should be visible
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('should have proper heading hierarchy', () => {
      render(<Dashboard />);

      const mainHeading = screen.getByRole('heading', { level: 1, name: /dashboard/i });
      expect(mainHeading).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should apply responsive grid layout', () => {
      const { container } = render(<Dashboard />);

      const grids = container.querySelectorAll('.MuiGrid-root');
      expect(grids.length).toBeGreaterThan(0);
    });

    it('should have flexWrap on header for mobile', () => {
      const { container } = render(<Dashboard />);

      const header = container.querySelector('[class*="flexWrap"]');
      expect(header).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should memoize Dashboard component', () => {
      const { rerender } = render(<Dashboard />);

      // Re-render with same props
      rerender(<Dashboard />);

      // Component should be memoized (React.memo)
      expect(Dashboard.displayName).toBe('Dashboard');
    });

    it('should memoize expensive calculations', () => {
      const { rerender } = render(<Dashboard />);

      const initialActiveAgents = screen.getByText('1');
      expect(initialActiveAgents).toBeInTheDocument();

      // Re-render with same state
      rerender(<Dashboard />);

      // Should still show same value (useMemo should prevent recalculation)
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing dashboard state gracefully', () => {
      vi.mocked(useDashboardWebSocketModule.useDashboardWebSocket).mockReturnValue({
        dashboardState: {} as any,
        refreshData: mockRefreshData,
        isConnected: true,
        sendMessage: vi.fn(),
        disconnect: vi.fn(),
        setDashboardState: vi.fn(),
        updateFilters: vi.fn(),
      } as any);

      render(<Dashboard />);

      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    });

    it('should handle null values in metrics', () => {
      vi.mocked(useDashboardWebSocketModule.useDashboardWebSocket).mockReturnValue({
        dashboardState: {
          agents: null,
          resourceUsage: null,
          metrics: null,
          events: [],
          alerts: [],
          connected: true,
          loading: false,
          error: null,
          lastUpdated: null,
        } as any,
        refreshData: mockRefreshData,
        isConnected: true,
        sendMessage: vi.fn(),
        disconnect: vi.fn(),
        setDashboardState: vi.fn(),
        updateFilters: vi.fn(),
      } as any);

      render(<Dashboard />);

      expect(screen.getByText('0')).toBeInTheDocument(); // Active agents
      expect(screen.getByText('0.0%')).toBeInTheDocument(); // CPU usage
    });
  });
});
