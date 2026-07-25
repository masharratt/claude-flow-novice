/**
 * EventTimeline Component
 * Consolidated event timeline with search, filters, virtual scrolling, and export
 * Features:
 * - Search events by text
 * - Category filters (agent, system, error, warning)
 * - Virtual scrolling for 1000+ events (react-window)
 * - Real-time event stream support
 * - Export to JSON/CSV
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import {
  Box,
  TextField,
  Button,
  IconButton,
  Collapse,
  Chip,
  InputAdornment,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Stop,
  Error as ErrorIcon,
  CheckCircle,
  Schedule,
  FilterList,
  ExpandMore,
  ExpandLess,
  Refresh,
  Download,
  Visibility,
  VisibilityOff,
  Search,
} from '@mui/icons-material';
import {
  TimelineContainer,
  TimelineHeader,
  TimelineTitle,
  TimelineActions,
  StatsContainer,
  StatCard,
  StatValue,
  StatLabel,
  SearchContainer,
  FiltersContainer,
  FilterSection,
  FilterLabel,
  FilterChipContainer,
  FilterChip,
  TimelineContent,
  EventItemContainer,
  TimelineLine,
  TimelineNode,
  EventContent,
  EventHeader,
  EventTitleContainer,
  EventTitle,
  EventDescription,
  EventMetadata,
  EventTimestamp,
  EventTime,
  EventDuration,
  EmptyStateContainer,
  EmptyStateIcon,
  EmptyStateTitle,
  EmptyStateDescription,
  LastUpdatedText,
} from './EventTimeline.styles';
import {
  EventTimelineProps,
  EventItemProps,
  EventStats,
  EventCategory,
  EventSeverity,
} from './EventTimeline.types';

// Event Item Component (rendered in virtual list)
const EventItem: React.FC<EventItemProps> = ({
  event,
  isSelected,
  onClick,
  showDetails = true,
  style,
}) => {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'spawned':
        return <PlayArrow sx={{ fontSize: 16, color: 'success.main' }} />;
      case 'paused':
        return <Pause sx={{ fontSize: 16, color: 'warning.main' }} />;
      case 'resumed':
        return <PlayArrow sx={{ fontSize: 16, color: 'info.main' }} />;
      case 'terminated':
        return <Stop sx={{ fontSize: 16, color: 'action.disabled' }} />;
      case 'error_occurred':
        return <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} />;
      case 'task_completed':
        return <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />;
      default:
        return <Schedule sx={{ fontSize: 16, color: 'primary.main' }} />;
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return timestamp.toLocaleDateString();
  };

  return (
    <div style={style}>
      <EventItemContainer selected={isSelected} onClick={() => onClick?.(event.id)}>
        <TimelineLine />
        <TimelineNode>{getEventIcon(event.type)}</TimelineNode>

        <EventContent severity={event.severity}>
          <EventHeader>
            <EventTitleContainer>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <EventTitle>{event.title}</EventTitle>
                {event.agentId && (
                  <Chip label={event.agentId} size="small" color="primary" />
                )}
              </Box>

              {event.description && (
                <EventDescription>{event.description}</EventDescription>
              )}

              {showDetails && event.metadata && Object.keys(event.metadata).length > 0 && (
                <EventMetadata>
                  {Object.entries(event.metadata).slice(0, 5).map(([key, value]) => (
                    <div key={key}>
                      <strong>{key}:</strong> {String(value)}
                    </div>
                  ))}
                </EventMetadata>
              )}
            </EventTitleContainer>

            <EventTimestamp>
              <EventTime>{formatTimestamp(event.timestamp)}</EventTime>
              {event.metadata?.duration && (
                <EventDuration>{event.metadata.duration}ms</EventDuration>
              )}
            </EventTimestamp>
          </EventHeader>
        </EventContent>
      </EventItemContainer>
    </div>
  );
};

// Main EventTimeline Component
export const EventTimeline: React.FC<EventTimelineProps> = ({
  events,
  onEventSelect,
  maxEvents = 1000,
  autoRefresh = true,
  refreshInterval = 5000,
  showFilters = true,
  enableSearch = true,
  enableVirtualScrolling = true,
  enableExport = true,
  virtualScrollHeight = 600,
  itemHeight = 120,
  filter,
  className,
  style,
}) => {
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState(filter?.searchQuery || '');
  const [selectedCategories, setSelectedCategories] = useState<EventCategory[]>(
    filter?.categories || []
  );
  const [selectedSeverities, setSelectedSeverities] = useState<EventSeverity[]>(
    filter?.severities || []
  );
  const [selectedAgents, setSelectedAgents] = useState<string[]>(filter?.agentIds || []);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const listRef = useRef<List>(null);

  // Filter and sort events
  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        // Apply time range filter
        if (filter?.timeRange) {
          if (
            event.timestamp < filter.timeRange.start ||
            event.timestamp > filter.timeRange.end
          ) {
            return false;
          }
        }

        // Apply category filter
        if (selectedCategories.length > 0 && !selectedCategories.includes(event.category)) {
          return false;
        }

        // Apply severity filter
        if (
          selectedSeverities.length > 0 &&
          event.severity &&
          !selectedSeverities.includes(event.severity)
        ) {
          return false;
        }

        // Apply agent filter
        if (selectedAgents.length > 0 && event.agentId && !selectedAgents.includes(event.agentId)) {
          return false;
        }

        // Apply search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const searchData = [
            event.title,
            event.description,
            event.agentId,
            event.type,
            ...(event.metadata ? Object.values(event.metadata).map(String) : []),
          ]
            .join(' ')
            .toLowerCase();

          if (!searchData.includes(query)) {
            return false;
          }
        }

        return true;
      })
      .slice(-maxEvents)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [events, maxEvents, selectedCategories, selectedSeverities, selectedAgents, searchQuery, filter]);

  // Calculate statistics
  const eventStats = useMemo((): EventStats => {
    const stats: EventStats = {
      total: filteredEvents.length,
      byCategory: {
        agent: 0,
        system: 0,
        error: 0,
        warning: 0,
        success: 0,
        info: 0,
      },
      byAgent: {},
      bySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        success: 0,
      },
    };

    filteredEvents.forEach((event) => {
      stats.byCategory[event.category]++;
      if (event.agentId) {
        stats.byAgent[event.agentId] = (stats.byAgent[event.agentId] || 0) + 1;
      }
      if (event.severity) {
        stats.bySeverity[event.severity]++;
      }
    });

    return stats;
  }, [filteredEvents]);

  // Available filter options
  const availableCategories: EventCategory[] = ['agent', 'system', 'error', 'warning', 'success', 'info'];
  const availableSeverities: EventSeverity[] = ['info', 'warning', 'error', 'success'];
  const availableAgents = useMemo(() => {
    const agents = new Set<string>();
    events.forEach((event) => {
      if (event.agentId) agents.add(event.agentId);
    });
    return Array.from(agents).sort();
  }, [events]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // Event handlers
  const handleEventSelect = useCallback(
    (eventId: string) => {
      setSelectedEventId(eventId);
      onEventSelect?.(eventId);
    },
    [onEventSelect]
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastUpdated(new Date());
      setIsRefreshing(false);
    }, 1000);
  }, []);

  const handleExport = useCallback(
    (format: 'json' | 'csv') => {
      if (format === 'json') {
        const dataStr = JSON.stringify(filteredEvents, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', `events-${new Date().toISOString().split('T')[0]}.json`);
        linkElement.click();
      } else if (format === 'csv') {
        const headers = ['ID', 'Timestamp', 'Type', 'Category', 'Title', 'Description', 'Agent ID', 'Severity'];
        const rows = filteredEvents.map((event) => [
          event.id,
          event.timestamp.toISOString(),
          event.type,
          event.category,
          event.title,
          event.description || '',
          event.agentId || '',
          event.severity || '',
        ]);
        const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
        const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', `events-${new Date().toISOString().split('T')[0]}.csv`);
        linkElement.click();
      }
    },
    [filteredEvents]
  );

  const toggleCategory = useCallback((category: EventCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }, []);

  const toggleSeverity = useCallback((severity: EventSeverity) => {
    setSelectedSeverities((prev) =>
      prev.includes(severity) ? prev.filter((s) => s !== severity) : [...prev, severity]
    );
  }, []);

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((a) => a !== agentId) : [...prev, agentId]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedCategories([]);
    setSelectedSeverities([]);
    setSelectedAgents([]);
    setSearchQuery('');
  }, []);

  // Row renderer for virtual scrolling
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const event = filteredEvents[index];
    return (
      <EventItem
        event={event}
        isSelected={selectedEventId === event.id}
        onClick={handleEventSelect}
        showDetails={showDetails}
        style={style}
      />
    );
  };

  return (
    <TimelineContainer className={className} style={style}>
      <TimelineHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <TimelineTitle>Event Timeline</TimelineTitle>
          <TimelineActions>
            <IconButton onClick={() => setShowDetails(!showDetails)} size="small">
              {showDetails ? <Visibility /> : <VisibilityOff />}
            </IconButton>
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              startIcon={<Refresh className={isRefreshing ? 'animate-spin' : ''} />}
              size="small"
              variant="outlined"
            >
              Refresh
            </Button>
            {enableExport && (
              <>
                <Button
                  onClick={() => handleExport('json')}
                  startIcon={<Download />}
                  size="small"
                  variant="outlined"
                >
                  JSON
                </Button>
                <Button
                  onClick={() => handleExport('csv')}
                  startIcon={<Download />}
                  size="small"
                  variant="outlined"
                >
                  CSV
                </Button>
              </>
            )}
          </TimelineActions>
        </Box>

        {/* Statistics */}
        <StatsContainer>
          <StatCard>
            <StatValue>{eventStats.total}</StatValue>
            <StatLabel>Total Events</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue sx={{ color: 'error.main' }}>{eventStats.bySeverity.error}</StatValue>
            <StatLabel>Errors</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue sx={{ color: 'success.main' }}>{eventStats.bySeverity.success}</StatValue>
            <StatLabel>Success</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue sx={{ color: 'primary.main' }}>{Object.keys(eventStats.byAgent).length}</StatValue>
            <StatLabel>Active Agents</StatLabel>
          </StatCard>
        </StatsContainer>

        {/* Search */}
        {enableSearch && (
          <SearchContainer>
            <TextField
              fullWidth
              size="small"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
            />
          </SearchContainer>
        )}

        {/* Filters */}
        {showFilters && (
          <Box sx={{ mt: 2 }}>
            <Button
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
              startIcon={<FilterList />}
              endIcon={showFiltersPanel ? <ExpandLess /> : <ExpandMore />}
              size="small"
            >
              Filters
            </Button>

            <Collapse in={showFiltersPanel}>
              <FiltersContainer>
                {/* Category Filters */}
                <FilterSection>
                  <FilterLabel>Categories</FilterLabel>
                  <FilterChipContainer>
                    {availableCategories.map((category) => (
                      <FilterChip
                        key={category}
                        label={category}
                        onClick={() => toggleCategory(category)}
                        selected={selectedCategories.includes(category)}
                        size="small"
                      />
                    ))}
                  </FilterChipContainer>
                </FilterSection>

                {/* Severity Filters */}
                <FilterSection>
                  <FilterLabel>Severity</FilterLabel>
                  <FilterChipContainer>
                    {availableSeverities.map((severity) => (
                      <FilterChip
                        key={severity}
                        label={severity}
                        onClick={() => toggleSeverity(severity)}
                        selected={selectedSeverities.includes(severity)}
                        size="small"
                      />
                    ))}
                  </FilterChipContainer>
                </FilterSection>

                {/* Agent Filters */}
                {availableAgents.length > 0 && (
                  <FilterSection>
                    <FilterLabel>Agents</FilterLabel>
                    <FilterChipContainer>
                      {availableAgents.slice(0, 10).map((agentId) => (
                        <FilterChip
                          key={agentId}
                          label={agentId}
                          onClick={() => toggleAgent(agentId)}
                          selected={selectedAgents.includes(agentId)}
                          size="small"
                        />
                      ))}
                      {availableAgents.length > 10 && (
                        <Chip label={`+${availableAgents.length - 10} more`} size="small" disabled />
                      )}
                    </FilterChipContainer>
                  </FilterSection>
                )}

                {/* Clear Filters */}
                {(selectedCategories.length > 0 || selectedSeverities.length > 0 || selectedAgents.length > 0 || searchQuery) && (
                  <Button onClick={clearFilters} size="small" color="error">
                    Clear all filters
                  </Button>
                )}
              </FiltersContainer>
            </Collapse>
          </Box>
        )}

        {/* Last Updated */}
        <LastUpdatedText>
          Last updated: {lastUpdated.toLocaleTimeString()}
          {filteredEvents.length !== events.length && (
            <> • Showing {filteredEvents.length} of {events.length} events</>
          )}
        </LastUpdatedText>
      </TimelineHeader>

      {/* Timeline Content with Virtual Scrolling */}
      <TimelineContent>
        {filteredEvents.length > 0 ? (
          enableVirtualScrolling ? (
            <List
              ref={listRef}
              height={virtualScrollHeight}
              itemCount={filteredEvents.length}
              itemSize={itemHeight}
              width="100%"
            >
              {Row}
            </List>
          ) : (
            <Box sx={{ p: 2 }}>
              {filteredEvents.map((event) => (
                <EventItem
                  key={event.id}
                  event={event}
                  isSelected={selectedEventId === event.id}
                  onClick={handleEventSelect}
                  showDetails={showDetails}
                />
              ))}
            </Box>
          )
        ) : (
          <EmptyStateContainer>
            <EmptyStateIcon>
              <Schedule sx={{ fontSize: 48 }} />
            </EmptyStateIcon>
            <EmptyStateTitle>No events found</EmptyStateTitle>
            <EmptyStateDescription>
              {searchQuery || selectedCategories.length > 0 || selectedSeverities.length > 0 || selectedAgents.length > 0
                ? 'Try adjusting your search or filters'
                : 'Events will appear here when agents are active'}
            </EmptyStateDescription>
          </EmptyStateContainer>
        )}
      </TimelineContent>
    </TimelineContainer>
  );
};

export default EventTimeline;
