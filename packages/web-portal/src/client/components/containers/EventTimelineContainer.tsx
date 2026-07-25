/**
 * EventTimelineContainer
 * Wrapper for EventTimeline from web-components with Zustand store integration
 */

import React, { useCallback } from 'react';
import { EventTimeline } from '@components';
import { useEventsStore } from '../../../shared/stores/eventsStore';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface EventTimelineContainerProps {
  maxEvents?: number;
  showDetails?: boolean;
  showFilters?: boolean;
  showStats?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  enableVirtualization?: boolean;
  virtualScrollHeight?: number;
  filterByEventType?: string[];
  filterByAgent?: string[];
  className?: string;
}

export const EventTimelineContainer: React.FC<EventTimelineContainerProps> = ({
  maxEvents = 100,
  showDetails = true,
  showFilters = true,
  showStats = true,
  autoRefresh = true,
  refreshInterval = 5000,
  enableVirtualization = true,
  virtualScrollHeight = 600,
  filterByEventType,
  filterByAgent,
  className,
}) => {
  const { events, addEvent, loading } = useEventsStore();

  // Subscribe to lifecycle events
  useWebSocketEvent('agent:lifecycle', (data: any) => {
    console.log('[EventTimeline] Lifecycle event:', data);
    if (data.event) {
      addEvent(data.event);
    }
  });

  useWebSocketEvent('system:event', (data: any) => {
    console.log('[EventTimeline] System event:', data);
    if (data.event) {
      addEvent(data.event);
    }
  });

  // Transform events to timeline format
  const lifecycleEvents = events.map((event) => ({
    id: event.id,
    agentId: event.agentId || 'system',
    eventType: event.type,
    timestamp: event.timestamp,
    severity: event.severity || 'info',
    reason: event.message,
    metadata: event.metadata,
  }));

  const handleEventSelect = useCallback((eventId: string) => {
    console.log('[EventTimeline] Event selected:', eventId);
  }, []);

  const handleExport = useCallback((events: any[], format: 'json' | 'csv') => {
    console.log('[EventTimeline] Export:', format, events.length);
  }, []);

  if (loading && events.length === 0) {
    return <LoadingSpinner message="Loading event timeline..." />;
  }

  return (
    <ErrorBoundary>
      <EventTimeline
        events={lifecycleEvents}
        onEventSelect={handleEventSelect}
        onExport={handleExport}
        maxEvents={maxEvents}
        showDetails={showDetails}
        showFilters={showFilters}
        showStats={showStats}
        autoRefresh={autoRefresh}
        refreshInterval={refreshInterval}
        enableVirtualization={enableVirtualization}
        virtualScrollHeight={virtualScrollHeight}
        filterByEventType={filterByEventType}
        filterByAgent={filterByAgent}
        className={className}
      />
    </ErrorBoundary>
  );
};

export default EventTimelineContainer;
