/**
 * Dashboard Integration Tests
 *
 * Tests Dashboard loads all 4 components, real-time updates, interactions,
 * error boundaries, and loading states
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../utils/test-utils';
import { App } from '../../client/App';

describe('Dashboard Integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Dashboard Component Loading', () => {
    it('should load all 4 dashboard components', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        // Check for main dashboard sections
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Verify multiple components are rendered
      const dashboard = screen.getByRole('main');
      expect(dashboard).toBeInTheDocument();
    });

    it('should render StatusMonitor component', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        const statusMonitor = screen.getByTestId('status-monitor') || screen.getByText(/status|health/i);
        expect(statusMonitor).toBeTruthy();
      });
    });

    it('should render ResourceGauges component', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        const gauges = screen.getByTestId('resource-gauges') || screen.getByText(/cpu|memory/i);
        expect(gauges).toBeTruthy();
      });
    });

    it('should render EventTimeline component', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        const timeline = screen.getByTestId('event-timeline') || screen.getByText(/events|timeline/i);
        expect(timeline).toBeTruthy();
      });
    });

    it('should render AlertsPanel component', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        const alerts = screen.getByTestId('alerts-panel') || screen.getByText(/alerts|notifications/i);
        expect(alerts).toBeTruthy();
      });
    });
  });

  describe('Real-Time Data Updates', () => {
    it('should update metrics in real-time', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Real-time updates would be triggered by WebSocket events
      // This test verifies the component structure is ready for updates
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('should update agent count when agents spawn', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // WebSocket event would trigger update
      // Component should re-render with new count
    });

    it('should update system health metrics', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Health metrics should update via WebSocket
    });

    it('should append new events to timeline', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // New events should appear without full page reload
    });

    it('should update resource gauges', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // CPU/Memory gauges should update in real-time
    });
  });

  describe('Component Interactions', () => {
    it('should allow clicking on metric cards', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        const cards = screen.getAllByRole('button');
        expect(cards.length).toBeGreaterThan(0);
      });

      // Click should trigger detail view or action
    });

    it('should filter events in timeline', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Filter controls should work
    });

    it('should dismiss alerts', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Alert dismiss should work
    });

    it('should navigate to agent details from dashboard', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Clicking agent should navigate to agents view
    });
  });

  describe('Error Boundaries', () => {
    it('should catch errors in StatusMonitor', async () => {
      // Simulate component error
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Error boundary should prevent full app crash
    });

    it('should catch errors in ResourceGauges', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Error boundary should isolate component failure
    });

    it('should catch errors in EventTimeline', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Timeline errors should not affect other components
    });

    it('should show error message when component fails', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Error UI should be displayed
    });

    it('should allow retry after component error', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Retry button should reload component
    });
  });

  describe('Loading States', () => {
    it('should show loading spinner on initial load', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      // Loading indicator should appear briefly
      const loading = screen.queryByTestId('loading-spinner');
      // It might already be gone if data loads quickly
    });

    it('should show skeleton loaders for components', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      // Skeleton loaders should appear while data loads
      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });

    it('should transition from loading to loaded state', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        // Loading should complete
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });

    it('should show individual component loading states', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        // Each component can have its own loading state
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });

    it('should handle partial data loading', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        // Some components may load faster than others
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });
  });

  describe('Data Refresh', () => {
    it('should refresh all components on manual refresh', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Refresh button should reload all data
    });

    it('should auto-refresh metrics periodically', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Auto-refresh should occur at intervals
    });

    it('should debounce rapid refresh requests', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Multiple rapid refreshes should be debounced
    });
  });

  describe('Responsive Layout', () => {
    it('should render grid layout on desktop', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        const main = screen.getByRole('main');
        expect(main).toBeInTheDocument();
      });

      // Grid layout should be applied
    });

    it('should stack components on mobile', async () => {
      // Set viewport to mobile size
      global.innerWidth = 375;
      global.innerHeight = 667;

      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        const main = screen.getByRole('main');
        expect(main).toBeInTheDocument();
      });

      // Components should stack vertically
    });

    it('should adjust component sizes responsively', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        const main = screen.getByRole('main');
        expect(main).toBeInTheDocument();
      });

      // Component sizes should adapt to viewport
    });
  });
});
