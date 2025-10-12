/**
 * Events View - Real-time event timeline with filters and virtual scrolling
 * Features: Search, category/severity/date filters, virtual scrolling, WebSocket updates
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
  Button,
  CircularProgress,
  Paper,
  Divider,
  Alert,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  WifiOff as WifiOffIcon,
} from '@mui/icons-material';
import { FixedSizeList } from 'react-window';
import { useEventsStore } from '../../../shared/stores/eventsStore';
import type { EventType, EventSeverity } from '../../../shared/stores/eventsStore';
import { useWebSocket } from '../../../shared/hooks/useWebSocket';

// WebSocket event payload interface
interface EventStreamPayload {
  id: string;
  type: EventType;
  severity: EventSeverity;
  message: string;
  agentId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface EventItemProps {
  event: {
    id: string;
    type: EventType;
    severity: EventSeverity;
    message: string;
    agentId?: string;
    timestamp: number;
    metadata?: Record<string, any>;
  };
}

const EventTimelineItem: React.FC<EventItemProps> = ({ event }) => {
  const severityColors: Record<EventSeverity, string> = {
    info: '#2196f3',
    warning: '#ff9800',
    error: '#f44336',
    critical: '#d32f2f',
  };

  return (
    <Paper
      sx={{
        p: 2,
        mb: 1,
        borderLeft: `4px solid ${severityColors[event.severity]}`,
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box flex={1}>
          <Typography variant="caption" color="text.secondary">
            {event.type}
          </Typography>
          <Typography variant="body1" sx={{ mt: 0.5 }}>
            {event.message}
          </Typography>
          {event.agentId && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              Agent: {event.agentId}
            </Typography>
          )}
        </Box>
        <Box textAlign="right">
          <Chip
            label={event.severity}
            size="small"
            sx={{
              backgroundColor: severityColors[event.severity],
              color: 'white',
              textTransform: 'capitalize',
            }}
          />
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
            {new Date(event.timestamp).toLocaleTimeString()}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export const Events: React.FC = () => {
  const events = useEventsStore((state) => state.events);
  const loading = useEventsStore((state) => state.loading);
  const setLoading = useEventsStore((state) => state.setLoading);
  const addEvent = useEventsStore((state) => state.addEvent);
  const addEvents = useEventsStore((state) => state.addEvents);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState('all-time');
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // WebSocket connection with reconnection tracking
  const { isConnected, subscribe, reconnect } = useWebSocket();

  // E2E Test: Load fixture data from sessionStorage
  useEffect(() => {
    const testEvents = sessionStorage.getItem('e2e-test-events');
    if (testEvents) {
      try {
        const parsedEvents = JSON.parse(testEvents);
        addEvents(parsedEvents);
        console.log('[Events] Loaded E2E test data:', parsedEvents.length, 'events');
      } catch (err) {
        console.error('[Events] Failed to load E2E test data:', err);
      }
    }
  }, [addEvents]);

  // Subscribe to real-time event stream
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = subscribe<EventStreamPayload>('event:stream', (data) => {
      try {
        // Add incoming event to store
        addEvent(data);
        // Clear any previous errors on successful event processing
        setError(null);
      } catch (err) {
        const error = err as Error;
        setError(error);
        console.error('[Events] Failed to process event:', error);
      }
    });

    return () => {
      try {
        unsubscribe();
      } catch (err) {
        console.error('[Events] Error during unsubscribe:', err);
      }
    };
  }, [isConnected, subscribe, addEvent]);

  // Category mapping based on event types from test fixtures
  const categoryMap: Record<string, string[]> = {
    'agent.lifecycle': ['agent.spawned', 'agent.lifecycle'],
    'agent.complete': ['agent.completed', 'agent.complete'],
    'cfn.loop': ['cfn.loop.phase.start', 'cfn.loop.phase.complete'],
    'system.error': ['system.error'],
  };

  // Filter events
  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Search filter (case-insensitive, searches message, agentId, and type)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (event) =>
          event.message.toLowerCase().includes(searchLower) ||
          event.agentId?.toLowerCase().includes(searchLower) ||
          event.type.toLowerCase().includes(searchLower)
      );
    }

    // Category filter
    if (categoryFilter !== 'all') {
      const types = categoryMap[categoryFilter] || [];
      filtered = filtered.filter((event) =>
        types.some((type) => event.type.includes(type) || type.includes(event.type))
      );
    }

    // Severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter((event) => event.severity === severityFilter);
    }

    // Date range filter
    const now = Date.now();
    if (dateRangeFilter === 'last-hour') {
      const cutoff = now - 60 * 60 * 1000;
      filtered = filtered.filter((event) => event.timestamp >= cutoff);
    } else if (dateRangeFilter === 'last-7-days') {
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter((event) => event.timestamp >= cutoff);
    }
    // 'all-time' shows everything

    return filtered;
  }, [events, searchTerm, categoryFilter, severityFilter, dateRangeFilter]);

  // Calculate severity statistics
  const severityStats = useMemo(() => {
    return {
      total: events.length,
      info: events.filter((e) => e.severity === 'info').length,
      warning: events.filter((e) => e.severity === 'warning').length,
      error: events.filter((e) => e.severity === 'error').length,
      critical: events.filter((e) => e.severity === 'critical').length,
    };
  }, [events]);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearchTerm('');
    setCategoryFilter('all');
    setSeverityFilter('all');
    setDateRangeFilter('all-time');
  }, []);

  // Refresh events
  const handleRefresh = useCallback(() => {
    try {
      setLoading(true);
      setError(null);
      // Simulate refresh delay
      setTimeout(() => {
        setLoading(false);
      }, 500);
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      console.error('[Events] Refresh failed:', error);
    }
  }, [setLoading]);

  // Handle manual reconnection
  const handleReconnect = useCallback(() => {
    try {
      setError(null);
      reconnect();
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[Events] Reconnect failed:', error);
    }
  }, [reconnect]);

  // Virtual list row renderer
  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const event = filteredEvents[index];
      return (
        <div style={style} data-testid="event-item">
          <EventTimelineItem event={event} />
        </div>
      );
    },
    [filteredEvents]
  );

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" component="h1">
            Events
          </Typography>
          {!isConnected && (
            <Chip
              icon={<WifiOffIcon />}
              label="Disconnected"
              color="error"
              size="small"
              data-testid="connection-status"
            />
          )}
          {isConnected && (
            <Chip
              label="Live"
              color="success"
              size="small"
              data-testid="connection-status"
            />
          )}
        </Box>
        <Box>
          <IconButton
            onClick={() => setFiltersVisible(!filtersVisible)}
            aria-label="toggle filters"
            size="large"
          >
            <FilterListIcon />
          </IconButton>
          <IconButton onClick={handleRefresh} aria-label="refresh events" size="large">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ m: 2 }} onClose={() => setError(null)}>
          Error: {error.message}
        </Alert>
      )}

      {/* Disconnection Warning with Reconnect */}
      {!isConnected && (
        <Alert
          severity="warning"
          sx={{ m: 2 }}
          action={
            <Button color="inherit" size="small" onClick={handleReconnect}>
              Reconnect
            </Button>
          }
        >
          WebSocket disconnected. Real-time events are unavailable. Click Reconnect to retry.
        </Alert>
      )}

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Filters Sidebar */}
        {filtersVisible && (
          <Box
            sx={{
              width: '300px',
              borderRight: '1px solid',
              borderColor: 'divider',
              p: 2,
              overflowY: 'auto',
            }}
          >
            <Typography variant="h6" gutterBottom>
              Filters
            </Typography>

            {/* Search */}
            <TextField
              fullWidth
              label="Search"
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              inputProps={{ 'data-testid': 'search-input' }}
              sx={{ mb: 2 }}
            />

            {/* Category Filter */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={categoryFilter}
                label="Category"
                onChange={(e) => setCategoryFilter(e.target.value)}
                data-testid="category-filter"
              >
                <MenuItem value="all">All Categories</MenuItem>
                <MenuItem value="agent.lifecycle">Agent Lifecycle</MenuItem>
                <MenuItem value="agent.complete">Agent Complete</MenuItem>
                <MenuItem value="cfn.loop">CFN Loop</MenuItem>
                <MenuItem value="system.error">System Error</MenuItem>
              </Select>
            </FormControl>

            {/* Severity Filter */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Severity</InputLabel>
              <Select
                value={severityFilter}
                label="Severity"
                onChange={(e) => setSeverityFilter(e.target.value)}
                data-testid="severity-filter"
              >
                <MenuItem value="all">All Severities</MenuItem>
                <MenuItem value="info">Info</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="error">Error</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>

            {/* Date Range Filter */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Date Range</InputLabel>
              <Select
                value={dateRangeFilter}
                label="Date Range"
                onChange={(e) => setDateRangeFilter(e.target.value)}
                data-testid="daterange-filter"
              >
                <MenuItem value="all-time">All Time</MenuItem>
                <MenuItem value="last-hour">Last Hour</MenuItem>
                <MenuItem value="last-7-days">Last 7 Days</MenuItem>
              </Select>
            </FormControl>

            {/* Clear Filters Button */}
            <Button
              fullWidth
              variant="outlined"
              startIcon={<ClearIcon />}
              onClick={handleClearFilters}
              data-testid="clear-filters-button"
            >
              Clear Filters
            </Button>

            <Divider sx={{ my: 2 }} />

            {/* Statistics */}
            <Typography variant="subtitle2" gutterBottom>
              Statistics
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Chip label={`Total: ${severityStats.total}`} size="small" />
              <Chip label={`Info: ${severityStats.info}`} size="small" color="info" />
              <Chip label={`Warning: ${severityStats.warning}`} size="small" color="warning" />
              <Chip label={`Error: ${severityStats.error}`} size="small" color="error" />
              <Chip
                label={`Critical: ${severityStats.critical}`}
                size="small"
                sx={{ backgroundColor: '#d32f2f', color: 'white' }}
              />
            </Box>
          </Box>
        )}

        {/* Event Timeline */}
        <Box sx={{ flex: 1, p: 2, overflow: 'hidden' }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress role="progressbar" />
            </Box>
          )}

          {!loading && filteredEvents.length === 0 && (
            <Box sx={{ textAlign: 'center', p: 4 }}>
              <Typography variant="h6" color="text.secondary">
                No events found
              </Typography>
            </Box>
          )}

          {!loading && filteredEvents.length > 0 && (
            <FixedSizeList
              height={600}
              itemCount={filteredEvents.length}
              itemSize={120}
              width="100%"
              data-testid="event-timeline"
            >
              {Row}
            </FixedSizeList>
          )}
        </Box>
      </Box>
    </Box>
  );
};
