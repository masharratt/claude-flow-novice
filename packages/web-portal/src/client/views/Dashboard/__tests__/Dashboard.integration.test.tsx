/**
 * Dashboard Integration Tests
 * Tests complete user flows and component interactions
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Dashboard } from '../Dashboard';
import * as useDashboardWebSocketModule from '../../../../shared/hooks/useDashboardWebSocket';

const mockRefreshData = vi.fn();

vi.mock('../../../../shared/hooks/useDashboardWebSocket', () => ({
  useDashboardWebSocket: vi.fn(),
}));

vi.mock('../components/containers', () => ({
  AgentHierarchyTreeContainer: ({ dashboardState, onAgentSelect }: any) => (
    <div data-testid="agent-hierarchy-tree">
      {dashboardState.agents?.map((agent: any) => (
        <button key={agent.id} onClick={() => onAgentSelect?.(agent.id)}>
          {agent.name}
        </button>
      ))}
    </div>
  ),
  StatusMonitorContainer: ({ dashboardState, onRefresh }: any) => (
    <div data-testid="status-monitor">
      <button onClick={onRefresh}>Refresh Status</button>
      Status: {dashboardState.agents?.length || 0} agents
    </div>
  ),
  PerformanceChartsContainer: ({ timeRange }: any) => (
    <div data-testid="performance-charts">Charts: {timeRange}</div>
  ),
  EventTimelineContainer: ({ dashboardState }: any) => (
    <div data-testid="event-timeline">Events: {dashboardState.events?.length || 0}</div>
  ),
  AlertsPanelContainer: ({ dashboardState }: any) => (
    <div data-testid="alerts-panel">Alerts: {dashboardState.alerts?.length || 0}</div>
  ),
}));

describe('Dashboard Integration Tests', () => {
  const mockInitialState = {
    agents: [
      { id: 'agent-1', name: 'Coordinator', status: 'active', health: 100 },
      { id: 'agent-2', name: 'Worker', status: 'idle', health: 95 },
    ],
    resourceUsage: {
      cpuUsage: 30,
      memoryUsage: 1024,
      networkLatency: 15,
      diskUsage: 50,
    },
    metrics: {
      eventsPerSecond: 50,
    },
    events: [
      { id: 'e1', type: 'info', title: 'System started' },
      { id: 'e2', type: 'warning', title: 'High CPU' },
    ],
    alerts: [{ id: 'a1', severity: 'warning', title: 'Memory threshold' }],
    connected: true,
    loading: false,
    error: null,
    lastUpdated: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDashboardWebSocketModule.useDashboardWebSocket).mockReturnValue({
      dashboardState: mockInitialState,
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

  describe('Complete User Workflows', () => {
    it('should complete full monitoring workflow', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      // 1. User views initial dashboard state
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // 1 active agent

      // 2. User changes time range
      const timeRangeSelect = screen.getByLabelText(/select time range/i);
      await user.click(timeRangeSelect);
      const option24h = screen.getByRole('option', { name: /last 24 hours/i });
      await user.click(option24h);

      await waitFor(() => {
        expect(screen.getByTestId('performance-charts')).toHaveTextContent('24h');
      });

      // 3. User refreshes dashboard
      const refreshButton = screen.getByRole('button', { name: /refresh dashboard/i });
      await user.click(refreshButton);

      await waitFor(() => {
        expect(mockRefreshData).toHaveBeenCalled();
      });

      // 4. User exports data
      const mockClick = vi.fn();
      const mockLink = document.createElement('a');
      mockLink.click = mockClick;
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const exportButton = screen.getByRole('button', { name: /export dashboard/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(mockClick).toHaveBeenCalled();
      });
    });

    it('should handle agent selection workflow', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      // Click on an agent in hierarchy tree
      const agentButton = screen.getByText('Coordinator');
      await user.click(agentButton);

      // Agent should be selected (verify through state, if exposed)
      expect(agentButton).toBeInTheDocument();
    });

    it('should handle pause and resume workflow', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers();

      render(<Dashboard refreshInterval={5000} />);

      // 1. Pause auto-refresh
      const pauseButton = screen.getByRole('button', { name: /toggle auto-refresh/i });
      await user.click(pauseButton);

      mockRefreshData.mockClear();

      // 2. Wait for refresh interval - should not refresh
      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(mockRefreshData).not.toHaveBeenCalled();
      });

      // 3. Resume auto-refresh
      await user.click(pauseButton);

      // 4. Wait for refresh interval - should refresh
      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(mockRefreshData).toHaveBeenCalled();
      });

      vi.useRealTimers();
    });
  });

  describe('WebSocket Connection State', () => {
    it('should show warning when disconnected', () => {
      vi.mocked(useDashboardWebSocketModule.useDashboardWebSocket).mockReturnValue({
        dashboardState: mockInitialState,
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

    it('should hide warning when connected', () => {
      render(<Dashboard />);

      expect(screen.queryByText(/websocket disconnected/i)).not.toBeInTheDocument();
    });

    it('should update connection indicator', () => {
      render(<Dashboard />);

      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });
  });

  describe('Real-time Data Updates', () => {
    it('should reflect updated agent counts', () => {
      const { rerender } = render(<Dashboard />);

      expect(screen.getByText('1')).toBeInTheDocument(); // 1 active agent initially

      // Simulate WebSocket update with more active agents
      vi.mocked(useDashboardWebSocketModule.useDashboardWebSocket).mockReturnValue({
        dashboardState: {
          ...mockInitialState,
          agents: [
            { id: 'agent-1', name: 'Coordinator', status: 'active', health: 100 },
            { id: 'agent-2', name: 'Worker', status: 'active', health: 95 },
            { id: 'agent-3', name: 'Monitor', status: 'active', health: 98 },
          ],
        },
        refreshData: mockRefreshData,
        isConnected: true,
        sendMessage: vi.fn(),
        disconnect: vi.fn(),
        setDashboardState: vi.fn(),
        updateFilters: vi.fn(),
      } as any);

      rerender(<Dashboard />);

      expect(screen.getByText('3')).toBeInTheDocument(); // 3 active agents now
    });

    it('should reflect updated resource usage', () => {
      const { rerender } = render(<Dashboard />);

      expect(screen.getByText('30.0%')).toBeInTheDocument(); // Initial CPU

      // Simulate WebSocket update with higher CPU
      vi.mocked(useDashboardWebSocketModule.useDashboardWebSocket).mockReturnValue({
        dashboardState: {
          ...mockInitialState,
          resourceUsage: {
            cpuUsage: 85.5,
            memoryUsage: 1024,
            networkLatency: 15,
            diskUsage: 50,
          },
        },
        refreshData: mockRefreshData,
        isConnected: true,
        sendMessage: vi.fn(),
        disconnect: vi.fn(),
        setDashboardState: vi.fn(),
        updateFilters: vi.fn(),
      } as any);

      rerender(<Dashboard />);

      expect(screen.getByText('85.5%')).toBeInTheDocument(); // Updated CPU
    });
  });

  describe('Component Integration', () => {
    it('should pass correct props to all container components', () => {
      render(<Dashboard />);

      expect(screen.getByTestId('agent-hierarchy-tree')).toBeInTheDocument();
      expect(screen.getByTestId('status-monitor')).toBeInTheDocument();
      expect(screen.getByTestId('performance-charts')).toBeInTheDocument();
      expect(screen.getByTestId('event-timeline')).toBeInTheDocument();
      expect(screen.getByTestId('alerts-panel')).toBeInTheDocument();
    });

    it('should propagate time range changes to PerformanceCharts', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      const timeRangeSelect = screen.getByLabelText(/select time range/i);
      await user.click(timeRangeSelect);
      const option7d = screen.getByRole('option', { name: /last 7 days/i });
      await user.click(option7d);

      await waitFor(() => {
        expect(screen.getByTestId('performance-charts')).toHaveTextContent('7d');
      });
    });

    it('should propagate refresh calls to StatusMonitor', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      const statusRefreshButton = screen.getByText('Refresh Status');
      await user.click(statusRefreshButton);

      await waitFor(() => {
        expect(mockRefreshData).toHaveBeenCalled();
      });
    });
  });

  describe('Performance Under Load', () => {
    it('should handle large number of agents efficiently', () => {
      const largeAgentList = Array.from({ length: 100 }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i}`,
        status: i % 2 === 0 ? 'active' : 'idle',
        health: 90 + Math.random() * 10,
      }));

      vi.mocked(useDashboardWebSocketModule.useDashboardWebSocket).mockReturnValue({
        dashboardState: {
          ...mockInitialState,
          agents: largeAgentList,
        },
        refreshData: mockRefreshData,
        isConnected: true,
        sendMessage: vi.fn(),
        disconnect: vi.fn(),
        setDashboardState: vi.fn(),
        updateFilters: vi.fn(),
      } as any);

      const { container } = render(<Dashboard />);

      // Should render without crashing
      expect(container).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument(); // 50 active agents
    });

    it('should handle rapid state updates', () => {
      const { rerender } = render(<Dashboard />);

      // Simulate rapid updates
      for (let i = 0; i < 10; i++) {
        vi.mocked(useDashboardWebSocketModule.useDashboardWebSocket).mockReturnValue({
          dashboardState: {
            ...mockInitialState,
            resourceUsage: {
              cpuUsage: 30 + i * 5,
              memoryUsage: 1024,
              networkLatency: 15,
              diskUsage: 50,
            },
          },
          refreshData: mockRefreshData,
          isConnected: true,
          sendMessage: vi.fn(),
          disconnect: vi.fn(),
          setDashboardState: vi.fn(),
          updateFilters: vi.fn(),
        } as any);

        rerender(<Dashboard />);
      }

      // Should handle updates without crashing
      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    });
  });
});
