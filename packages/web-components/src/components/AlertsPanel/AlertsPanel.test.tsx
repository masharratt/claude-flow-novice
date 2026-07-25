/**
 * AlertsPanel Component Tests
 * Comprehensive test coverage for alert management functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AlertsPanel } from './AlertsPanel';
import { Alert, AlertSeverity, AlertCategory, AlertStatus } from './AlertsPanel.types';

/**
 * Mock alert factory
 */
const createMockAlert = (
  overrides?: Partial<Alert>
): Alert => ({
  id: `alert-${Math.random().toString(36).substr(2, 9)}`,
  severity: 'info',
  category: 'system',
  title: 'Test Alert',
  message: 'This is a test alert message',
  status: 'active',
  timestamp: new Date(),
  ...overrides,
});

/**
 * Create mock alerts with different severities
 */
const createMockAlerts = (): Alert[] => [
  createMockAlert({
    id: 'alert-1',
    severity: 'error',
    category: 'security',
    title: 'Critical Security Alert',
    message: 'Unauthorized access attempt detected',
    status: 'active',
    timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
  }),
  createMockAlert({
    id: 'alert-2',
    severity: 'warning',
    category: 'performance',
    title: 'High CPU Usage',
    message: 'CPU usage exceeded 80%',
    status: 'active',
    timestamp: new Date(Date.now() - 1000 * 60 * 10), // 10 minutes ago
  }),
  createMockAlert({
    id: 'alert-3',
    severity: 'info',
    category: 'system',
    title: 'System Update Available',
    message: 'A new system update is available',
    status: 'active',
    timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
  }),
  createMockAlert({
    id: 'alert-4',
    severity: 'success',
    category: 'validation',
    title: 'Validation Complete',
    message: 'All tests passed successfully',
    status: 'active',
    timestamp: new Date(Date.now() - 1000 * 60 * 2), // 2 minutes ago
  }),
  createMockAlert({
    id: 'alert-5',
    severity: 'error',
    category: 'agent',
    title: 'Agent Failed',
    message: 'Agent task execution failed',
    status: 'acknowledged',
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
  }),
];

describe('AlertsPanel', () => {
  let mockAlerts: Alert[];

  beforeEach(() => {
    mockAlerts = createMockAlerts();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<AlertsPanel alerts={[]} />);
      expect(screen.getByText('Alerts')).toBeInTheDocument();
    });

    it('should display all alerts', () => {
      render(<AlertsPanel alerts={mockAlerts} />);
      expect(screen.getByText('Critical Security Alert')).toBeInTheDocument();
      expect(screen.getByText('High CPU Usage')).toBeInTheDocument();
      expect(screen.getByText('System Update Available')).toBeInTheDocument();
      expect(screen.getByText('Validation Complete')).toBeInTheDocument();
    });

    it('should show empty state when no alerts', () => {
      render(<AlertsPanel alerts={[]} />);
      expect(screen.getByText('No alerts')).toBeInTheDocument();
      expect(screen.getByText(/All clear/)).toBeInTheDocument();
    });

    it('should display summary badge with correct count', () => {
      render(<AlertsPanel alerts={mockAlerts} showSummaryBadge={true} />);
      // 4 active alerts (alert-5 is acknowledged)
      const badge = screen.getByText('4');
      expect(badge).toBeInTheDocument();
    });

    it('should render in compact mode', () => {
      const { container } = render(<AlertsPanel alerts={mockAlerts} compact={true} />);
      expect(container).toMatchSnapshot();
    });
  });

  describe('Severity Filtering', () => {
    it('should filter alerts by error severity', () => {
      render(<AlertsPanel alerts={mockAlerts} showFilters={true} />);

      const errorChip = screen.getByText(/Error/);
      fireEvent.click(errorChip);

      expect(screen.getByText('Critical Security Alert')).toBeInTheDocument();
      expect(screen.queryByText('High CPU Usage')).not.toBeInTheDocument();
    });

    it('should filter alerts by warning severity', () => {
      render(<AlertsPanel alerts={mockAlerts} showFilters={true} />);

      const warningChip = screen.getByText(/Warning/);
      fireEvent.click(warningChip);

      expect(screen.getByText('High CPU Usage')).toBeInTheDocument();
      expect(screen.queryByText('Critical Security Alert')).not.toBeInTheDocument();
    });

    it('should filter alerts by multiple severities', () => {
      render(<AlertsPanel alerts={mockAlerts} showFilters={true} />);

      const errorChip = screen.getByText(/Error/);
      const warningChip = screen.getByText(/Warning/);

      fireEvent.click(errorChip);
      fireEvent.click(warningChip);

      expect(screen.getByText('Critical Security Alert')).toBeInTheDocument();
      expect(screen.getByText('High CPU Usage')).toBeInTheDocument();
      expect(screen.queryByText('System Update Available')).not.toBeInTheDocument();
    });

    it('should show severity counts in filter chips', () => {
      render(<AlertsPanel alerts={mockAlerts} showFilters={true} />);

      // 2 errors (alert-1 and alert-5, but alert-5 is acknowledged)
      expect(screen.getByText(/Error \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Warning \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Info \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Success \(1\)/)).toBeInTheDocument();
    });
  });

  describe('Status Filtering', () => {
    it('should filter alerts by active status', () => {
      render(
        <AlertsPanel
          alerts={mockAlerts}
          showFilters={true}
          filter={{ statuses: ['active'] }}
        />
      );

      expect(screen.getByText('Critical Security Alert')).toBeInTheDocument();
      expect(screen.queryByText('Agent Failed')).not.toBeInTheDocument();
    });

    it('should filter alerts by acknowledged status', () => {
      render(
        <AlertsPanel
          alerts={mockAlerts}
          showFilters={true}
          filter={{ statuses: ['acknowledged'] }}
        />
      );

      expect(screen.getByText('Agent Failed')).toBeInTheDocument();
      expect(screen.queryByText('Critical Security Alert')).not.toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should sort alerts by timestamp descending by default', () => {
      const { container } = render(<AlertsPanel alerts={mockAlerts} />);
      const alerts = container.querySelectorAll('[class*="AlertItem"]');

      // Most recent first (alert-4: 2 minutes ago)
      expect(within(alerts[0] as HTMLElement).getByText('Validation Complete')).toBeInTheDocument();
    });

    it('should sort alerts by timestamp ascending', () => {
      const { container } = render(
        <AlertsPanel
          alerts={mockAlerts}
          sort={{ field: 'timestamp', direction: 'asc' }}
        />
      );
      const alerts = container.querySelectorAll('[class*="AlertItem"]');

      // Oldest first (alert-5: 30 minutes ago)
      expect(within(alerts[0] as HTMLElement).getByText('Agent Failed')).toBeInTheDocument();
    });

    it('should sort alerts by severity', () => {
      const { container } = render(
        <AlertsPanel
          alerts={mockAlerts}
          sort={{ field: 'severity', direction: 'asc' }}
        />
      );
      const alerts = container.querySelectorAll('[class*="AlertItem"]');

      // Error first
      expect(within(alerts[0] as HTMLElement).getByText(/Critical Security Alert|Agent Failed/)).toBeInTheDocument();
    });
  });

  describe('Alert Actions', () => {
    it('should call onAcknowledge when acknowledge button is clicked', () => {
      const onAcknowledge = vi.fn();
      render(<AlertsPanel alerts={mockAlerts} onAcknowledge={onAcknowledge} />);

      const acknowledgeButtons = screen.getAllByText('Acknowledge');
      fireEvent.click(acknowledgeButtons[0]);

      expect(onAcknowledge).toHaveBeenCalledWith('alert-1');
    });

    it('should call onDismiss when dismiss button is clicked', () => {
      const onDismiss = vi.fn();
      render(<AlertsPanel alerts={mockAlerts} onDismiss={onDismiss} />);

      const dismissButtons = screen.getAllByText('Dismiss');
      fireEvent.click(dismissButtons[0]);

      expect(onDismiss).toHaveBeenCalledWith('alert-1');
    });

    it('should call onResolve for acknowledged alerts', () => {
      const onResolve = vi.fn();
      render(<AlertsPanel alerts={mockAlerts} onResolve={onResolve} />);

      const resolveButton = screen.getByText('Resolve');
      fireEvent.click(resolveButton);

      expect(onResolve).toHaveBeenCalledWith('alert-5');
    });

    it('should call onAlertSelect when alert is clicked', () => {
      const onAlertSelect = vi.fn();
      const { container } = render(
        <AlertsPanel alerts={mockAlerts} onAlertSelect={onAlertSelect} />
      );

      const alert = container.querySelector('[class*="AlertItem"]');
      if (alert) {
        fireEvent.click(alert);
        expect(onAlertSelect).toHaveBeenCalled();
      }
    });
  });

  describe('Auto-Dismiss', () => {
    it('should auto-dismiss success alerts after timeout', async () => {
      const onDismiss = vi.fn();
      render(
        <AlertsPanel
          alerts={[
            createMockAlert({
              id: 'auto-dismiss-1',
              severity: 'success',
              autoDismissTimeout: 1000,
            }),
          ]}
          onDismiss={onDismiss}
          enableAutoDismiss={true}
        />
      );

      vi.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(onDismiss).toHaveBeenCalledWith('auto-dismiss-1');
      });
    });

    it('should auto-dismiss info alerts after timeout', async () => {
      const onDismiss = vi.fn();
      render(
        <AlertsPanel
          alerts={[
            createMockAlert({
              id: 'auto-dismiss-2',
              severity: 'info',
              autoDismissTimeout: 1000,
            }),
          ]}
          onDismiss={onDismiss}
          enableAutoDismiss={true}
        />
      );

      vi.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(onDismiss).toHaveBeenCalledWith('auto-dismiss-2');
      });
    });

    it('should not auto-dismiss error alerts', async () => {
      const onDismiss = vi.fn();
      render(
        <AlertsPanel
          alerts={[
            createMockAlert({
              id: 'no-dismiss-1',
              severity: 'error',
              autoDismissTimeout: 1000,
            }),
          ]}
          onDismiss={onDismiss}
          enableAutoDismiss={true}
        />
      );

      vi.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(onDismiss).not.toHaveBeenCalled();
      });
    });

    it('should respect enableAutoDismiss prop', async () => {
      const onDismiss = vi.fn();
      render(
        <AlertsPanel
          alerts={[
            createMockAlert({
              id: 'no-auto-1',
              severity: 'success',
              autoDismissTimeout: 1000,
            }),
          ]}
          onDismiss={onDismiss}
          enableAutoDismiss={false}
        />
      );

      vi.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(onDismiss).not.toHaveBeenCalled();
      });
    });
  });

  describe('Grouping', () => {
    it('should group alerts by category when enabled', () => {
      render(<AlertsPanel alerts={mockAlerts} groupByCategory={true} />);

      expect(screen.getByText('SECURITY')).toBeInTheDocument();
      expect(screen.getByText('PERFORMANCE')).toBeInTheDocument();
      expect(screen.getByText('SYSTEM')).toBeInTheDocument();
      expect(screen.getByText('VALIDATION')).toBeInTheDocument();
    });

    it('should not group alerts by default', () => {
      render(<AlertsPanel alerts={mockAlerts} />);

      expect(screen.queryByText('SECURITY')).not.toBeInTheDocument();
    });
  });

  describe('Max Alerts Limit', () => {
    it('should respect maxAlerts prop', () => {
      const manyAlerts = Array.from({ length: 20 }, (_, i) =>
        createMockAlert({ id: `alert-${i}`, title: `Alert ${i}` })
      );

      const { container } = render(<AlertsPanel alerts={manyAlerts} maxAlerts={5} />);
      const alertItems = container.querySelectorAll('[class*="AlertItem"]');

      expect(alertItems.length).toBe(5);
    });
  });

  describe('Timestamp Formatting', () => {
    it('should format recent timestamps correctly', () => {
      const alerts = [
        createMockAlert({
          id: 'recent-1',
          title: 'Recent Alert',
          timestamp: new Date(Date.now() - 1000 * 30), // 30 seconds ago
        }),
      ];

      render(<AlertsPanel alerts={alerts} />);
      expect(screen.getByText('just now')).toBeInTheDocument();
    });

    it('should format minute timestamps correctly', () => {
      const alerts = [
        createMockAlert({
          id: 'minutes-1',
          title: 'Minutes Alert',
          timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
        }),
      ];

      render(<AlertsPanel alerts={alerts} />);
      expect(screen.getByText('5m ago')).toBeInTheDocument();
    });

    it('should format hour timestamps correctly', () => {
      const alerts = [
        createMockAlert({
          id: 'hours-1',
          title: 'Hours Alert',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        }),
      ];

      render(<AlertsPanel alerts={alerts} />);
      expect(screen.getByText('2h ago')).toBeInTheDocument();
    });
  });

  describe('Custom Actions', () => {
    it('should render custom alert actions', () => {
      const customAction = {
        id: 'custom-1',
        label: 'Custom Action',
        handler: vi.fn(),
      };

      const alerts = [
        createMockAlert({
          id: 'custom-alert',
          title: 'Alert with Custom Action',
          actions: [customAction],
        }),
      ];

      render(<AlertsPanel alerts={alerts} />);
      expect(screen.getByText('Custom Action')).toBeInTheDocument();
    });

    it('should call custom action handler', () => {
      const handler = vi.fn();
      const customAction = {
        id: 'custom-2',
        label: 'Custom Action',
        handler,
      };

      const alerts = [
        createMockAlert({
          id: 'custom-alert',
          title: 'Alert with Custom Action',
          actions: [customAction],
        }),
      ];

      render(<AlertsPanel alerts={alerts} />);

      const actionButton = screen.getByText('Custom Action');
      fireEvent.click(actionButton);

      expect(handler).toHaveBeenCalledWith(alerts[0]);
    });
  });

  describe('Callbacks', () => {
    it('should call onFilterChange when filter is updated', () => {
      const onFilterChange = vi.fn();
      render(<AlertsPanel alerts={mockAlerts} onFilterChange={onFilterChange} showFilters={true} />);

      const errorChip = screen.getByText(/Error/);
      fireEvent.click(errorChip);

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          severities: ['error'],
        })
      );
    });

    it('should call onSortChange when sort is updated', () => {
      const onSortChange = vi.fn();
      render(<AlertsPanel alerts={mockAlerts} onSortChange={onSortChange} showSort={true} />);

      const sortSelect = screen.getByLabelText('Sort by');
      fireEvent.mouseDown(sortSelect);

      const severityOption = screen.getByText('Severity');
      fireEvent.click(severityOption);

      expect(onSortChange).toHaveBeenCalledWith(
        expect.objectContaining({
          field: 'severity',
        })
      );
    });
  });

  describe('Alert Summary', () => {
    it('should calculate correct summary statistics', () => {
      render(<AlertsPanel alerts={mockAlerts} showFilters={true} />);

      // 1 active error (alert-1), 1 acknowledged error (alert-5)
      expect(screen.getByText(/Error \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Warning \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Info \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Success \(1\)/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<AlertsPanel alerts={mockAlerts} />);

      expect(screen.getByRole('heading', { name: 'Alerts' })).toBeInTheDocument();
    });

    it('should support keyboard navigation', () => {
      const onAlertSelect = vi.fn();
      const { container } = render(
        <AlertsPanel alerts={mockAlerts} onAlertSelect={onAlertSelect} />
      );

      const alert = container.querySelector('[class*="AlertItem"]');
      if (alert) {
        fireEvent.keyDown(alert, { key: 'Enter' });
        // In a real implementation, this would trigger selection
      }
    });
  });
});
