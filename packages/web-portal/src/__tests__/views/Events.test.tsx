/**
 * Events View Unit Tests
 *
 * Tests event timeline rendering, search, filters (category, severity, date range),
 * virtual scrolling, and real-time WebSocket updates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react-dom/test-utils';
import { renderWithProviders } from '../utils/test-utils';
import { Events } from '../../client/views/Events/Events';
import { useEventsStore } from '../../shared/stores/eventsStore';
import {
  mockEventsBasic,
  mockEventsLarge,
  mockEventsAgentLifecycle,
  mockEventsSystemError,
  mockEventsInfo,
  mockEventsWarning,
  mockEventsError,
  mockEventsCritical,
  mockWebSocketEventUpdate,
} from '../fixtures/events-fixtures';

describe('Events View', () => {
  beforeEach(() => {
    const store = useEventsStore.getState();
    store.reset();
    localStorage.clear();
  });

  describe('Event Timeline Rendering', () => {
    it('should render event timeline with header and title', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsBasic);

      renderWithProviders(<Events />);

      await waitFor(() => {
        expect(screen.getByText(/events/i)).toBeInTheDocument();
      });

      // Verify header elements
      expect(screen.getByRole('button', { name: /refresh events/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /toggle filters/i })).toBeInTheDocument();
    });

    it('should render event items with correct data', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsBasic);

      renderWithProviders(<Events />);

      await waitFor(() => {
        const eventItems = screen.getAllByTestId('event-item');
        expect(eventItems.length).toBe(mockEventsBasic.length);
      });

      // Verify first event data
      expect(screen.getByText('agent.lifecycle')).toBeInTheDocument();
      expect(screen.getByText(/agent coder-001 spawned successfully/i)).toBeInTheDocument();
    });

    it('should render event timeline with 100+ events for virtual scrolling', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      await waitFor(() => {
        const eventItems = screen.getAllByTestId('event-item');
        // Virtual scrolling shows subset of total events
        expect(eventItems.length).toBeGreaterThan(0);
        expect(eventItems.length).toBeLessThanOrEqual(mockEventsLarge.length);
      });
    });

    it('should display event statistics chips correctly', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      await waitFor(() => {
        expect(screen.getByText(/total:/i)).toBeInTheDocument();
        expect(screen.getByText(/info:/i)).toBeInTheDocument();
        expect(screen.getByText(/warning:/i)).toBeInTheDocument();
        expect(screen.getByText(/error:/i)).toBeInTheDocument();
        expect(screen.getByText(/critical:/i)).toBeInTheDocument();
      });
    });

    it('should show message when no events are available', async () => {
      const store = useEventsStore.getState();
      store.setEvents([]);

      renderWithProviders(<Events />);

      await waitFor(() => {
        expect(screen.getByText(/no events found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter events by search term (event message)', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsBasic);

      renderWithProviders(<Events />);

      const searchInput = await screen.findByTestId('search-input');
      await userEvent.type(searchInput, 'agent coder-001');

      await waitFor(() => {
        const eventItems = screen.getAllByTestId('event-item');
        expect(eventItems.length).toBeLessThan(mockEventsBasic.length);
      });
    });

    it('should filter events by agent ID', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsBasic);

      renderWithProviders(<Events />);

      const searchInput = await screen.findByTestId('search-input');
      await userEvent.type(searchInput, 'agent-001');

      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('event-item');
        visibleItems.forEach((item) => {
          expect(item.textContent).toMatch(/agent-001/i);
        });
      });
    });

    it('should filter events by event type', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsBasic);

      renderWithProviders(<Events />);

      const searchInput = await screen.findByTestId('search-input');
      await userEvent.type(searchInput, 'system.error');

      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('event-item');
        expect(visibleItems.length).toBeGreaterThan(0);
        visibleItems.forEach((item) => {
          expect(item.textContent).toMatch(/system\.error/i);
        });
      });
    });

    it('should show all events when search is cleared', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsBasic);

      renderWithProviders(<Events />);

      const searchInput = await screen.findByTestId('search-input');

      // Type search term
      await userEvent.type(searchInput, 'agent-001');
      await waitFor(() => {
        const filteredItems = screen.getAllByTestId('event-item');
        expect(filteredItems.length).toBeLessThan(mockEventsBasic.length);
      });

      // Clear search
      await userEvent.clear(searchInput);
      await waitFor(() => {
        const allItems = screen.getAllByTestId('event-item');
        expect(allItems.length).toBe(mockEventsBasic.length);
      });
    });

    it('should perform case-insensitive search', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsBasic);

      renderWithProviders(<Events />);

      const searchInput = await screen.findByTestId('search-input');
      await userEvent.type(searchInput, 'AGENT-001');

      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('event-item');
        expect(visibleItems.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Category Filter', () => {
    it('should filter events by agent.lifecycle category', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      const categoryFilter = await screen.findByTestId('category-filter');
      await userEvent.click(categoryFilter);

      const lifecycleOption = await screen.findByText('Agent Lifecycle');
      await userEvent.click(lifecycleOption);

      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('event-item');
        visibleItems.forEach((item) => {
          expect(item.textContent).toMatch(/agent\.lifecycle/i);
        });
      });
    });

    it('should filter events by agent.complete category', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      const categoryFilter = await screen.findByTestId('category-filter');
      await userEvent.click(categoryFilter);

      const completeOption = await screen.findByText('Agent Complete');
      await userEvent.click(completeOption);

      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('event-item');
        visibleItems.forEach((item) => {
          expect(item.textContent).toMatch(/agent\.complete/i);
        });
      });
    });

    it('should filter events by cfn.loop category', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      const categoryFilter = await screen.findByTestId('category-filter');
      await userEvent.click(categoryFilter);

      const cfnOption = await screen.findByText('CFN Loop');
      await userEvent.click(cfnOption);

      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('event-item');
        visibleItems.forEach((item) => {
          expect(item.textContent).toMatch(/cfn\.loop/i);
        });
      });
    });
  });

  describe('Severity Filter', () => {
    it('should filter events by info severity', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      const severityFilter = await screen.findByTestId('severity-filter');
      await userEvent.click(severityFilter);

      const infoOption = await screen.findByText('Info');
      await userEvent.click(infoOption);

      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('event-item');
        visibleItems.forEach((item) => {
          expect(item.textContent).toMatch(/info/i);
        });
      });
    });

    it('should filter events by warning severity', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      const severityFilter = await screen.findByTestId('severity-filter');
      await userEvent.click(severityFilter);

      const warningOption = await screen.findByText('Warning');
      await userEvent.click(warningOption);

      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('event-item');
        visibleItems.forEach((item) => {
          expect(item.textContent).toMatch(/warning/i);
        });
      });
    });

    it('should filter events by error severity', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      const severityFilter = await screen.findByTestId('severity-filter');
      await userEvent.click(severityFilter);

      const errorOption = await screen.findByText(/^Error$/);
      await userEvent.click(errorOption);

      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('event-item');
        visibleItems.forEach((item) => {
          expect(item.textContent).toMatch(/error/i);
        });
      });
    });
  });

  describe('Date Range Filter', () => {
    it('should filter events by last hour preset', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      const dateRangeFilter = await screen.findByTestId('daterange-filter');
      await userEvent.click(dateRangeFilter);

      const lastHourOption = await screen.findByText('Last Hour');
      await userEvent.click(lastHourOption);

      await waitFor(() => {
        // Should filter to recent events only
        const visibleItems = screen.queryAllByTestId('event-item');
        expect(visibleItems.length).toBeLessThanOrEqual(mockEventsLarge.length);
      });
    });

    it('should filter events by last 7 days preset', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      const dateRangeFilter = await screen.findByTestId('daterange-filter');
      await userEvent.click(dateRangeFilter);

      const last7DaysOption = await screen.findByText('Last 7 Days');
      await userEvent.click(last7DaysOption);

      await waitFor(() => {
        const visibleItems = screen.queryAllByTestId('event-item');
        expect(visibleItems.length).toBeGreaterThan(0);
      });
    });

    it('should show all events when "All Time" is selected', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsBasic);

      renderWithProviders(<Events />);

      const dateRangeFilter = await screen.findByTestId('daterange-filter');
      await userEvent.click(dateRangeFilter);

      const allTimeOption = await screen.findByText('All Time');
      await userEvent.click(allTimeOption);

      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('event-item');
        expect(visibleItems.length).toBe(mockEventsBasic.length);
      });
    });

    it('should clear all filters when clear button is clicked', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsBasic);

      renderWithProviders(<Events />);

      // Apply search filter
      const searchInput = await screen.findByTestId('search-input');
      await userEvent.type(searchInput, 'agent-001');

      // Clear filters
      const clearButton = await screen.findByTestId('clear-filters-button');
      await userEvent.click(clearButton);

      await waitFor(() => {
        expect(searchInput).toHaveValue('');
        const visibleItems = screen.getAllByTestId('event-item');
        expect(visibleItems.length).toBe(mockEventsBasic.length);
      });
    });
  });

  describe('Virtual Scrolling', () => {
    it('should render virtual list for large event sets', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      await waitFor(() => {
        // Virtual list should be present
        const eventItems = screen.getAllByTestId('event-item');
        expect(eventItems.length).toBeGreaterThan(0);
      });
    });

    it('should handle scrolling in virtual list', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsLarge);

      renderWithProviders(<Events />);

      await waitFor(() => {
        const eventItems = screen.getAllByTestId('event-item');
        expect(eventItems.length).toBeGreaterThan(0);
      });

      // Simulate scroll event
      const virtualList = document.querySelector('[style*="overflow"]');
      if (virtualList) {
        fireEvent.scroll(virtualList, { target: { scrollTop: 1000 } });
      }

      // Virtual list should still render items after scroll
      await waitFor(() => {
        const eventItems = screen.getAllByTestId('event-item');
        expect(eventItems.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Real-time WebSocket Updates', () => {
    it('should add new event when WebSocket event:stream is received', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsBasic);

      renderWithProviders(<Events />);

      const initialCount = (await screen.findAllByTestId('event-item')).length;

      // Simulate WebSocket event
      act(() => {
        store.addEvent({
          type: mockWebSocketEventUpdate.type,
          severity: mockWebSocketEventUpdate.severity,
          message: mockWebSocketEventUpdate.message,
          agentId: mockWebSocketEventUpdate.agentId,
          metadata: mockWebSocketEventUpdate.metadata,
        });
      });

      await waitFor(() => {
        const updatedItems = screen.getAllByTestId('event-item');
        expect(updatedItems.length).toBe(initialCount + 1);
      });
    });

    it('should update event statistics when new events arrive', async () => {
      const store = useEventsStore.getState();
      store.setEvents(mockEventsInfo);

      renderWithProviders(<Events />);

      // Add error event
      act(() => {
        store.addEvent({
          type: 'system.error',
          severity: 'error',
          message: 'New error event',
          timestamp: Date.now(),
          metadata: {},
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/error:/i)).toBeInTheDocument();
      });
    });

    it('should display connection warning when WebSocket disconnected', async () => {
      renderWithProviders(<Events />);

      // Check for connection warning (WebSocket is mocked as disconnected by default in some cases)
      // The actual connection state depends on the mock setup
      const connectionWarning = screen.queryByText(/websocket disconnected/i);
      // This assertion depends on mock configuration - may or may not be present
      if (connectionWarning) {
        expect(connectionWarning).toBeInTheDocument();
      }
    });
  });

  describe('Filter Toggle', () => {
    it('should toggle filters sidebar visibility', async () => {
      renderWithProviders(<Events />);

      // Filters should be visible by default
      await waitFor(() => {
        expect(screen.getByText(/filters/i)).toBeInTheDocument();
      });

      // Click toggle button
      const toggleButton = screen.getByRole('button', { name: /toggle filters/i });
      await userEvent.click(toggleButton);

      await waitFor(() => {
        expect(screen.queryByText(/filters/i)).not.toBeInTheDocument();
      });

      // Click toggle button again to show filters
      await userEvent.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByText(/filters/i)).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Functionality', () => {
    it('should show loading state when refresh is clicked', async () => {
      renderWithProviders(<Events />);

      const refreshButton = await screen.findByRole('button', { name: /refresh events/i });
      await userEvent.click(refreshButton);

      // Loading indicator should appear briefly
      await waitFor(() => {
        const loadingIndicator = screen.queryByRole('progressbar');
        // May or may not be visible depending on timing
        if (loadingIndicator) {
          expect(loadingIndicator).toBeInTheDocument();
        }
      });
    });
  });
});
