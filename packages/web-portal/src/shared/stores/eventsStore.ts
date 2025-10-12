/**
 * Events Store - Real-time event stream with buffering and auto-pruning
 * Features: No persistence (real-time only), Immer middleware, DevTools, event buffering
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type EventType =
  | 'agent.spawned'
  | 'agent.completed'
  | 'agent.failed'
  | 'task.started'
  | 'task.completed'
  | 'system.error'
  | 'system.warning'
  | 'system.info'
  | 'metric.update'
  | 'swarm.created'
  | 'swarm.completed';

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface Event {
  id: string;
  type: EventType;
  severity: EventSeverity;
  timestamp: number;
  agentId?: string;
  message: string;
  metadata?: Record<string, any>;
  read?: boolean;
}

export interface EventFilters {
  types?: EventType[];
  severities?: EventSeverity[];
  agentIds?: string[];
  startTime?: number;
  endTime?: number;
  read?: boolean;
}

export interface EventPagination {
  page: number;
  pageSize: number;
  total: number;
}

interface EventsState {
  events: Event[];
  filters: EventFilters;
  pagination: EventPagination;
  maxEvents: number;
  loading: boolean;
  error: string | null;
}

interface EventsActions {
  // Event management
  addEvent: (event: Omit<Event, 'id' | 'timestamp'>) => void;
  addEvents: (events: Omit<Event, 'id' | 'timestamp'>[]) => void;
  markEventAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearEvents: () => void;

  // Filtering
  setFilters: (filters: Partial<EventFilters>) => void;
  clearFilters: () => void;

  // Pagination
  setPagination: (pagination: Partial<EventPagination>) => void;
  nextPage: () => void;
  prevPage: () => void;

  // Pruning
  pruneEvents: () => void;
  pruneByAge: (maxAgeMs: number) => void;

  // State management
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type EventsStore = EventsState & EventsActions;

// Computed selectors
export const eventsSelectors = {
  getFilteredEvents: (state: EventsStore): Event[] => {
    let filtered = state.events;

    if (state.filters.types && state.filters.types.length > 0) {
      filtered = filtered.filter(e => state.filters.types!.includes(e.type));
    }

    if (state.filters.severities && state.filters.severities.length > 0) {
      filtered = filtered.filter(e => state.filters.severities!.includes(e.severity));
    }

    if (state.filters.agentIds && state.filters.agentIds.length > 0) {
      filtered = filtered.filter(e => e.agentId && state.filters.agentIds!.includes(e.agentId));
    }

    if (state.filters.startTime) {
      filtered = filtered.filter(e => e.timestamp >= state.filters.startTime!);
    }

    if (state.filters.endTime) {
      filtered = filtered.filter(e => e.timestamp <= state.filters.endTime!);
    }

    if (state.filters.read !== undefined) {
      filtered = filtered.filter(e => e.read === state.filters.read);
    }

    return filtered;
  },

  getPaginatedEvents: (state: EventsStore): Event[] => {
    const filtered = eventsSelectors.getFilteredEvents(state);
    const start = (state.pagination.page - 1) * state.pagination.pageSize;
    const end = start + state.pagination.pageSize;
    return filtered.slice(start, end);
  },

  getUnreadCount: (state: EventsStore): number => {
    return state.events.filter(e => !e.read).length;
  },

  getEventsBySeverity: (state: EventsStore, severity: EventSeverity): Event[] => {
    return state.events.filter(e => e.severity === severity);
  },

  getEventsByType: (state: EventsStore, type: EventType): Event[] => {
    return state.events.filter(e => e.type === type);
  },

  getRecentEvents: (state: EventsStore, limit: number = 10): Event[] => {
    return state.events.slice(-limit).reverse();
  },

  getEventsForAgent: (state: EventsStore, agentId: string): Event[] => {
    return state.events.filter(e => e.agentId === agentId);
  },

  hasActiveFilters: (state: EventsStore): boolean => {
    return !!(
      state.filters.types?.length ||
      state.filters.severities?.length ||
      state.filters.agentIds?.length ||
      state.filters.startTime ||
      state.filters.endTime ||
      state.filters.read !== undefined
    );
  }
};

const MAX_EVENTS = 1000;
const DEFAULT_PAGE_SIZE = 50;

const initialState: EventsState = {
  events: [],
  filters: {},
  pagination: {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0
  },
  maxEvents: MAX_EVENTS,
  loading: false,
  error: null
};

// Helper to generate event ID
const generateEventId = (): string => {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const useEventsStore = create<EventsStore>()(
  devtools(
    immer((set) => ({
      ...initialState,

      addEvent: (event) => set((state) => {
        const newEvent: Event = {
          ...event,
          id: generateEventId(),
          timestamp: Date.now(),
          read: false
        };

        state.events.push(newEvent);

        // Auto-prune if exceeding max
        if (state.events.length > state.maxEvents) {
          const toRemove = state.events.length - state.maxEvents;
          state.events.splice(0, toRemove);
        }

        // Update pagination total
        state.pagination.total = eventsSelectors.getFilteredEvents(state as EventsStore).length;
      }),

      addEvents: (events) => set((state) => {
        const newEvents: Event[] = events.map(e => ({
          ...e,
          id: e.id || generateEventId(),
          timestamp: e.timestamp || Date.now(),
          read: e.read || false
        }));

        state.events.push(...newEvents);

        // Auto-prune if exceeding max
        if (state.events.length > state.maxEvents) {
          const toRemove = state.events.length - state.maxEvents;
          state.events.splice(0, toRemove);
        }

        // Update pagination total
        state.pagination.total = eventsSelectors.getFilteredEvents(state as EventsStore).length;
      }),

      markEventAsRead: (id) => set((state) => {
        const event = state.events.find(e => e.id === id);
        if (event) {
          event.read = true;
        }
      }),

      markAllAsRead: () => set((state) => {
        state.events.forEach(e => {
          e.read = true;
        });
      }),

      clearEvents: () => set((state) => {
        state.events = [];
        state.pagination.total = 0;
        state.pagination.page = 1;
      }),

      setFilters: (filters) => set((state) => {
        state.filters = { ...state.filters, ...filters };
        state.pagination.total = eventsSelectors.getFilteredEvents(state as EventsStore).length;
        state.pagination.page = 1; // Reset to first page when filters change
      }),

      clearFilters: () => set((state) => {
        state.filters = {};
        state.pagination.total = state.events.length;
        state.pagination.page = 1;
      }),

      setPagination: (pagination) => set((state) => {
        state.pagination = { ...state.pagination, ...pagination };
      }),

      nextPage: () => set((state) => {
        const maxPage = Math.ceil(state.pagination.total / state.pagination.pageSize);
        if (state.pagination.page < maxPage) {
          state.pagination.page += 1;
        }
      }),

      prevPage: () => set((state) => {
        if (state.pagination.page > 1) {
          state.pagination.page -= 1;
        }
      }),

      pruneEvents: () => set((state) => {
        if (state.events.length > state.maxEvents) {
          const toRemove = state.events.length - state.maxEvents;
          state.events.splice(0, toRemove);
          state.pagination.total = eventsSelectors.getFilteredEvents(state as EventsStore).length;
        }
      }),

      pruneByAge: (maxAgeMs) => set((state) => {
        const cutoff = Date.now() - maxAgeMs;
        state.events = state.events.filter(e => e.timestamp >= cutoff);
        state.pagination.total = eventsSelectors.getFilteredEvents(state as EventsStore).length;
      }),

      setLoading: (loading) => set((state) => {
        state.loading = loading;
      }),

      setError: (error) => set((state) => {
        state.error = error;
      }),

      reset: () => set(() => initialState)
    })),
    { name: 'EventsStore', enabled: process.env.NODE_ENV === 'development' }
  )
);

// Expose store for E2E tests
if (typeof window !== 'undefined' && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')) {
  (window as any).__eventsStore = useEventsStore;
}
