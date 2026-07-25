/**
 * StatusMonitor Component Tests
 * Unit tests for unified status monitoring component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StatusMonitor } from './StatusMonitor';
import { StatusItem } from './StatusMonitor.types';

// Mock Material-UI theme provider
vi.mock('@mui/material/styles', async () => {
  const actual = await vi.importActual('@mui/material/styles');
  return {
    ...actual,
    useTheme: () => ({
      palette: {
        success: { main: '#4caf50', light: '#81c784', lighter: '#c8e6c9', contrastText: '#fff' },
        warning: { main: '#ff9800', light: '#ffb74d', lighter: '#ffe0b2', contrastText: '#000' },
        error: { main: '#f44336', light: '#e57373', lighter: '#ffcdd2', dark: '#d32f2f', contrastText: '#fff' },
        info: { main: '#2196f3', light: '#64b5f6', lighter: '#bbdefb', contrastText: '#fff' },
        primary: { main: '#1976d2' },
        text: { primary: '#000', secondary: '#666' },
        grey: { 50: '#fafafa', 100: '#f5f5f5', 200: '#eee', 300: '#e0e0e0', 400: '#bdbdbd', 600: '#757575' },
        background: { paper: '#fff' },
        divider: '#e0e0e0',
      },
      spacing: (factor: number) => `${factor * 8}px`,
      shape: { borderRadius: 4 },
      shadows: Array(25).fill('0px 2px 4px rgba(0,0,0,0.1)'),
      breakpoints: {
        down: () => '@media (max-width:960px)',
      },
    }),
  };
});

describe('StatusMonitor', () => {
  const mockItems: StatusItem[] = [
    {
      id: 'agent-1',
      name: 'Agent 1',
      status: 'active',
      health: 90,
      progress: 75,
      activity: 'Processing tasks',
      lastActivity: new Date(Date.now() - 60000), // 1 minute ago
      resources: {
        cpu: 45,
        memory: 60,
      },
      metrics: {
        tokensUsed: 1500,
        efficiency: 0.85,
      },
    },
    {
      id: 'agent-2',
      name: 'Agent 2',
      status: 'error',
      health: 30,
      progress: 20,
      activity: 'Failed task',
      lastActivity: new Date(Date.now() - 120000), // 2 minutes ago
      errors: [
        {
          message: 'Connection timeout',
          severity: 'error',
          timestamp: new Date(Date.now() - 30000),
        },
      ],
      resources: {
        cpu: 80,
        memory: 90,
      },
    },
    {
      id: 'agent-3',
      name: 'Agent 3',
      status: 'idle',
      health: 100,
      progress: 0,
      activity: 'Waiting for tasks',
      lastActivity: new Date(Date.now() - 300000), // 5 minutes ago
      resources: {
        cpu: 5,
        memory: 20,
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render status items', () => {
    render(<StatusMonitor items={mockItems} />);

    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.getByText('Agent 2')).toBeInTheDocument();
    expect(screen.getByText('Agent 3')).toBeInTheDocument();
  });

  it('should display summary statistics', () => {
    render(<StatusMonitor items={mockItems} showSummary />);

    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();

    // Check counts
    expect(screen.getByText('3')).toBeInTheDocument(); // Total
    expect(screen.getByText('1')).toBeInTheDocument(); // Active, Idle, and Error each = 1
  });

  it('should filter by status', async () => {
    render(<StatusMonitor items={mockItems} showFilters />);

    const statusSelect = screen.getByLabelText('Status');
    fireEvent.change(statusSelect, { target: { value: 'error' } });

    await waitFor(() => {
      expect(screen.getByText('Agent 2')).toBeInTheDocument();
      expect(screen.queryByText('Agent 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Agent 3')).not.toBeInTheDocument();
    });
  });

  it('should search items by name', async () => {
    render(<StatusMonitor items={mockItems} showFilters />);

    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'Agent 2' } });

    await waitFor(() => {
      expect(screen.getByText('Agent 2')).toBeInTheDocument();
      expect(screen.queryByText('Agent 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Agent 3')).not.toBeInTheDocument();
    });
  });

  it('should sort items by name', async () => {
    render(<StatusMonitor items={mockItems} showSort />);

    const sortSelect = screen.getByLabelText('Sort by');
    fireEvent.change(sortSelect, { target: { value: 'health' } });

    // Health sorting should put Agent 3 (100%) first
    await waitFor(() => {
      const cards = screen.getAllByText(/Agent \d/);
      expect(cards[0]).toHaveTextContent('Agent 3');
    });
  });

  it('should call onItemSelect when card is clicked', () => {
    const handleSelect = vi.fn();
    render(<StatusMonitor items={mockItems} onItemSelect={handleSelect} />);

    const agent1Card = screen.getByText('Agent 1').closest('div[class*="StatusCard"]');
    if (agent1Card) {
      fireEvent.click(agent1Card);
      expect(handleSelect).toHaveBeenCalledWith('agent-1');
    }
  });

  it('should call onRefresh when refresh button is clicked', () => {
    const handleRefresh = vi.fn();
    render(<StatusMonitor items={mockItems} onRefresh={handleRefresh} />);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    expect(handleRefresh).toHaveBeenCalled();
  });

  it('should display progress bars for items with progress', () => {
    render(<StatusMonitor items={mockItems} />);

    // Agent 1 has 75% progress
    expect(screen.getByText('75.0%')).toBeInTheDocument();

    // Agent 2 has 20% progress
    expect(screen.getByText('20.0%')).toBeInTheDocument();
  });

  it('should display error badges for items with errors', () => {
    render(<StatusMonitor items={mockItems} />);

    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
  });

  it('should display resource metrics', () => {
    render(<StatusMonitor items={mockItems} />);

    // Check for CPU percentages
    expect(screen.getByText('45.0%')).toBeInTheDocument(); // Agent 1 CPU
    expect(screen.getByText('80.0%')).toBeInTheDocument(); // Agent 2 CPU

    // Check for memory percentages
    expect(screen.getByText('60.0%')).toBeInTheDocument(); // Agent 1 Memory
    expect(screen.getByText('90.0%')).toBeInTheDocument(); // Agent 2 Memory
  });

  it('should show empty state when no items match filters', () => {
    render(
      <StatusMonitor
        items={mockItems}
        filter={{ statuses: ['offline'] }}
        showFilters
      />
    );

    expect(screen.getByText('No items found')).toBeInTheDocument();
    expect(screen.getByText('No items match the current filters')).toBeInTheDocument();
  });

  it('should handle auto-refresh', async () => {
    vi.useFakeTimers();
    const handleRefresh = vi.fn();

    render(
      <StatusMonitor
        items={mockItems}
        onRefresh={handleRefresh}
        autoRefresh
        refreshInterval={5000}
      />
    );

    // Fast-forward time
    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(handleRefresh).toHaveBeenCalledTimes(1);
    });

    vi.useRealTimers();
  });

  it('should display selected card with highlight', () => {
    render(<StatusMonitor items={mockItems} selectedId="agent-1" />);

    const agent1Card = screen.getByText('Agent 1').closest('div[class*="StatusCard"]');
    expect(agent1Card).toHaveClass('selected');
  });

  it('should render in compact mode', () => {
    const { container } = render(<StatusMonitor items={mockItems} compact />);

    const cards = container.querySelectorAll('div[class*="StatusCard"]');
    expect(cards.length).toBe(3);
    // Compact mode should apply smaller padding
    expect(cards[0]).toHaveStyle({ padding: '12px' }); // 1.5 * 8px
  });

  it('should hide summary when showSummary is false', () => {
    render(<StatusMonitor items={mockItems} showSummary={false} />);

    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('should hide filters when showFilters is false', () => {
    render(<StatusMonitor items={mockItems} showFilters={false} />);

    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('should calculate correct summary statistics', () => {
    render(<StatusMonitor items={mockItems} showSummary />);

    // Total should be 3
    expect(screen.getByText('3')).toBeInTheDocument();

    // Active, Idle, and Error should each be 1
    const statValues = screen.getAllByText('1');
    expect(statValues.length).toBeGreaterThanOrEqual(3);

    // Average health should be (90 + 30 + 100) / 3 = 73%
    expect(screen.getByText('73%')).toBeInTheDocument();
  });
});
