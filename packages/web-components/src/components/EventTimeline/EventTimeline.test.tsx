/**
 * EventTimeline Component Tests
 * Unit tests for EventTimeline component with search, filters, virtual scrolling, and export
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EventTimeline } from './EventTimeline';
import { TimelineEvent } from './EventTimeline.types';

// Mock react-window
vi.mock('react-window', () => ({
  FixedSizeList: ({ children, itemCount }: any) => (
    <div data-testid="virtual-list">
      {Array.from({ length: itemCount }).map((_, index) =>
        children({ index, style: {} })
      )}
    </div>
  ),
}));

describe('EventTimeline', () => {
  const mockEvents: TimelineEvent[] = [
    {
      id: 'event-1',
      timestamp: new Date('2025-10-11T10:00:00Z'),
      type: 'spawned',
      category: 'agent',
      title: 'Agent spawned',
      description: 'Agent coder-1 spawned at level 1',
      agentId: 'coder-1',
      severity: 'info',
      metadata: {
        level: 1,
        priority: 5,
      },
    },
    {
      id: 'event-2',
      timestamp: new Date('2025-10-11T10:05:00Z'),
      type: 'error_occurred',
      category: 'error',
      title: 'Error occurred',
      description: 'Compilation error in module',
      agentId: 'coder-1',
      severity: 'error',
      metadata: {
        errorCode: 'E001',
        module: 'auth.ts',
      },
    },
    {
      id: 'event-3',
      timestamp: new Date('2025-10-11T10:10:00Z'),
      type: 'task_completed',
      category: 'success',
      title: 'Task completed',
      description: 'Authentication module implementation complete',
      agentId: 'coder-2',
      severity: 'success',
      metadata: {
        duration: 300000,
        filesChanged: 5,
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render EventTimeline component', () => {
      render(<EventTimeline events={mockEvents} />);
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    it('should display event statistics', () => {
      render(<EventTimeline events={mockEvents} />);
      expect(screen.getByText('Total Events')).toBeInTheDocument();
      expect(screen.getByText('Errors')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Active Agents')).toBeInTheDocument();
    });

    it('should render all events', () => {
      render(<EventTimeline events={mockEvents} />);
      expect(screen.getByText('Agent spawned')).toBeInTheDocument();
      expect(screen.getByText('Error occurred')).toBeInTheDocument();
      expect(screen.getByText('Task completed')).toBeInTheDocument();
    });

    it('should show empty state when no events', () => {
      render(<EventTimeline events={[]} />);
      expect(screen.getByText('No events found')).toBeInTheDocument();
      expect(screen.getByText('Events will appear here when agents are active')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should render search input', () => {
      render(<EventTimeline events={mockEvents} enableSearch />);
      expect(screen.getByPlaceholderText('Search events...')).toBeInTheDocument();
    });

    it('should filter events by search query', async () => {
      render(<EventTimeline events={mockEvents} enableSearch />);
      const searchInput = screen.getByPlaceholderText('Search events...');

      fireEvent.change(searchInput, { target: { value: 'error' } });

      await waitFor(() => {
        expect(screen.getByText('Error occurred')).toBeInTheDocument();
        expect(screen.queryByText('Task completed')).not.toBeInTheDocument();
      });
    });

    it('should show empty state for no search results', async () => {
      render(<EventTimeline events={mockEvents} enableSearch />);
      const searchInput = screen.getByPlaceholderText('Search events...');

      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('No events found')).toBeInTheDocument();
        expect(screen.getByText('Try adjusting your search or filters')).toBeInTheDocument();
      });
    });
  });

  describe('Filter Functionality', () => {
    it('should render filter button', () => {
      render(<EventTimeline events={mockEvents} showFilters />);
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('should toggle filter panel', () => {
      render(<EventTimeline events={mockEvents} showFilters />);
      const filterButton = screen.getByText('Filters');

      fireEvent.click(filterButton);
      expect(screen.getByText('Categories')).toBeInTheDocument();
      expect(screen.getByText('Severity')).toBeInTheDocument();

      fireEvent.click(filterButton);
    });

    it('should filter events by category', async () => {
      render(<EventTimeline events={mockEvents} showFilters />);
      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      const errorCategoryChip = screen.getByText('error');
      fireEvent.click(errorCategoryChip);

      await waitFor(() => {
        expect(screen.getByText('Error occurred')).toBeInTheDocument();
        expect(screen.queryByText('Task completed')).not.toBeInTheDocument();
      });
    });

    it('should filter events by severity', async () => {
      render(<EventTimeline events={mockEvents} showFilters />);
      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      const successSeverityChip = screen.getAllByText('success')[0]; // First occurrence
      fireEvent.click(successSeverityChip);

      await waitFor(() => {
        expect(screen.getByText('Task completed')).toBeInTheDocument();
        expect(screen.queryByText('Error occurred')).not.toBeInTheDocument();
      });
    });

    it('should clear all filters', async () => {
      render(<EventTimeline events={mockEvents} showFilters />);
      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      const errorCategoryChip = screen.getByText('error');
      fireEvent.click(errorCategoryChip);

      const clearButton = screen.getByText('Clear all filters');
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.getByText('Agent spawned')).toBeInTheDocument();
        expect(screen.getByText('Error occurred')).toBeInTheDocument();
        expect(screen.getByText('Task completed')).toBeInTheDocument();
      });
    });
  });

  describe('Event Interaction', () => {
    it('should call onEventSelect when event clicked', () => {
      const onEventSelect = vi.fn();
      render(<EventTimeline events={mockEvents} onEventSelect={onEventSelect} />);

      const eventTitle = screen.getByText('Agent spawned');
      fireEvent.click(eventTitle.closest('[role="button"]') || eventTitle.parentElement!);

      expect(onEventSelect).toHaveBeenCalledWith('event-1');
    });

    it('should highlight selected event', () => {
      render(<EventTimeline events={mockEvents} />);

      const eventTitle = screen.getByText('Agent spawned');
      const eventContainer = eventTitle.closest('[role="button"]') || eventTitle.parentElement!;

      fireEvent.click(eventContainer);

      expect(eventContainer).toHaveAttribute('data-selected', 'true');
    });
  });

  describe('Export Functionality', () => {
    it('should render export buttons when enabled', () => {
      render(<EventTimeline events={mockEvents} enableExport />);
      expect(screen.getByText('JSON')).toBeInTheDocument();
      expect(screen.getByText('CSV')).toBeInTheDocument();
    });

    it('should export events to JSON', () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      render(<EventTimeline events={mockEvents} enableExport />);

      const jsonButton = screen.getByText('JSON');
      fireEvent.click(jsonButton);

      expect(createElementSpy).toHaveBeenCalledWith('a');
    });

    it('should export events to CSV', () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      render(<EventTimeline events={mockEvents} enableExport />);

      const csvButton = screen.getByText('CSV');
      fireEvent.click(csvButton);

      expect(createElementSpy).toHaveBeenCalledWith('a');
    });
  });

  describe('Virtual Scrolling', () => {
    it('should use virtual scrolling when enabled', () => {
      render(<EventTimeline events={mockEvents} enableVirtualScrolling />);
      expect(screen.getByTestId('virtual-list')).toBeInTheDocument();
    });

    it('should render all items in virtual list', () => {
      render(<EventTimeline events={mockEvents} enableVirtualScrolling />);
      const virtualList = screen.getByTestId('virtual-list');
      expect(virtualList.children.length).toBe(mockEvents.length);
    });

    it('should disable virtual scrolling when flag is false', () => {
      render(<EventTimeline events={mockEvents} enableVirtualScrolling={false} />);
      expect(screen.queryByTestId('virtual-list')).not.toBeInTheDocument();
    });
  });

  describe('Auto-refresh', () => {
    it('should auto-refresh when enabled', () => {
      vi.useFakeTimers();
      render(<EventTimeline events={mockEvents} autoRefresh refreshInterval={1000} />);

      const initialTime = screen.getByText(/Last updated:/);
      const initialTimeText = initialTime.textContent;

      vi.advanceTimersByTime(1000);

      waitFor(() => {
        expect(initialTime.textContent).not.toBe(initialTimeText);
      });

      vi.useRealTimers();
    });
  });

  describe('Details Toggle', () => {
    it('should toggle event details visibility', () => {
      render(<EventTimeline events={mockEvents} />);

      const visibilityButton = screen.getByRole('button', { name: /visibility/i });
      fireEvent.click(visibilityButton);

      // Details should be hidden
      expect(screen.queryByText('level:')).not.toBeInTheDocument();

      fireEvent.click(visibilityButton);

      // Details should be visible
      waitFor(() => {
        expect(screen.getByText('level:')).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Button', () => {
    it('should refresh events when refresh button clicked', async () => {
      render(<EventTimeline events={mockEvents} />);

      const refreshButton = screen.getByText('Refresh');
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(refreshButton).toBeDisabled();
      });

      await waitFor(
        () => {
          expect(refreshButton).not.toBeDisabled();
        },
        { timeout: 2000 }
      );
    });
  });

  describe('Max Events Limit', () => {
    it('should limit number of events displayed', () => {
      const manyEvents = Array.from({ length: 100 }, (_, i) => ({
        ...mockEvents[0],
        id: `event-${i}`,
        timestamp: new Date(Date.now() + i * 1000),
      }));

      render(<EventTimeline events={manyEvents} maxEvents={50} enableVirtualScrolling />);

      const virtualList = screen.getByTestId('virtual-list');
      expect(virtualList.children.length).toBe(50);
    });
  });

  describe('Time Range Filter', () => {
    it('should filter events by time range', () => {
      const timeRange = {
        start: new Date('2025-10-11T10:00:00Z'),
        end: new Date('2025-10-11T10:05:00Z'),
      };

      render(
        <EventTimeline
          events={mockEvents}
          filter={{ timeRange }}
        />
      );

      expect(screen.getByText('Agent spawned')).toBeInTheDocument();
      expect(screen.getByText('Error occurred')).toBeInTheDocument();
      expect(screen.queryByText('Task completed')).not.toBeInTheDocument();
    });
  });

  describe('Agent Filter', () => {
    it('should filter events by agent ID', async () => {
      render(<EventTimeline events={mockEvents} showFilters />);

      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      expect(screen.getByText('Agents')).toBeInTheDocument();

      const agentChip = screen.getByText('coder-1');
      fireEvent.click(agentChip);

      await waitFor(() => {
        expect(screen.getByText('Agent spawned')).toBeInTheDocument();
        expect(screen.getByText('Error occurred')).toBeInTheDocument();
        expect(screen.queryByText('Task completed')).not.toBeInTheDocument();
      });
    });
  });
});
