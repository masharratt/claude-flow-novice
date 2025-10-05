/**
 * Event Timeline Component
 * Real-time streaming timeline of agent lifecycle events
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Activity,
  Play,
  Pause,
  Square,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  Zap,
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Download,
  Eye
} from 'lucide-react';
import { AgentLifecycleEvent, LifecycleEventType, TimelineEvent, ComponentProps } from '../types';

interface EventItemProps {
  event: TimelineEvent;
  isSelected?: boolean;
  onClick?: (eventId: string) => void;
  showDetails?: boolean;
}

const EventItem: React.FC<EventItemProps> = ({
  event,
  isSelected,
  onClick,
  showDetails = true
}) => {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'spawned':
        return <Play className="w-4 h-4 text-green-500" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-yellow-500" />;
      case 'resumed':
        return <Play className="w-4 h-4 text-blue-500" />;
      case 'terminated':
        return <Square className="w-4 h-4 text-gray-500" />;
      case 'error_occurred':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'task_completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <Activity className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'error':
        return 'border-red-200 bg-red-50';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50';
      case 'success':
        return 'border-green-200 bg-green-50';
      default:
        return 'border-gray-200 bg-gray-50';
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
    <div
      className={`relative pl-8 pb-4 cursor-pointer transition-all duration-200 hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
      onClick={() => onClick?.(event.id)}
    >
      {/* Timeline Line */}
      <div className="absolute left-4 top-8 bottom-0 w-px bg-gray-300"></div>

      {/* Event Node */}
      <div className="absolute left-2 top-2 w-4 h-4 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center">
        {getEventIcon(event.type)}
      </div>

      {/* Event Content */}
      <div className={`ml-6 p-3 rounded-lg border ${getSeverityColor(event.severity)}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h4 className="font-semibold text-gray-900 text-sm">{event.title}</h4>
              {event.agentId && (
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                  {event.agentId}
                </span>
              )}
            </div>

            {event.description && (
              <p className="text-sm text-gray-600 mb-2">{event.description}</p>
            )}

            {showDetails && event.metadata && Object.keys(event.metadata).length > 0 && (
              <div className="text-xs text-gray-500 space-y-1">
                {Object.entries(event.metadata).map(([key, value]) => (
                  <div key={key}>
                    <span className="font-medium">{key}:</span> {String(value)}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-right ml-4">
            <div className="text-xs text-gray-500">{formatTimestamp(event.timestamp)}</div>
            {event.metadata?.duration && (
              <div className="text-xs text-gray-400 mt-1">
                {event.metadata.duration}ms
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface EventTimelineProps extends Partial<ComponentProps> {
  events: AgentLifecycleEvent[];
  onEventSelect?: (eventId: string) => void;
  maxEvents?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  showFilters?: boolean;
  filterByEventType?: LifecycleEventType[];
  filterByAgent?: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
  events,
  onEventSelect,
  maxEvents = 100,
  autoRefresh = true,
  refreshInterval = 5000,
  showFilters = true,
  filterByEventType,
  filterByAgent,
  timeRange,
  ...props
}) => {
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventTypes, setSelectedEventTypes] = useState<LifecycleEventType[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Convert agent lifecycle events to timeline events
  const timelineEvents = useMemo(() => {
    return events
      .filter(event => {
        // Apply time range filter
        if (timeRange) {
          const eventTime = new Date(event.timestamp);
          if (eventTime < timeRange.start || eventTime > timeRange.end) {
            return false;
          }
        }

        // Apply event type filter
        if (selectedEventTypes.length > 0 && !selectedEventTypes.includes(event.eventType)) {
          return false;
        }

        // Apply agent filter
        if (selectedAgents.length > 0 && !selectedAgents.includes(event.agentId)) {
          return false;
        }

        // Apply search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const searchData = [
            event.agentId,
            event.eventType,
            event.eventData.reason,
            event.eventData.taskDescription,
            event.eventData.errorMessage
          ].join(' ').toLowerCase();

          if (!searchData.includes(query)) {
            return false;
          }
        }

        return true;
      })
      .slice(-maxEvents)
      .map(event => ({
        id: event.eventId,
        timestamp: new Date(event.timestamp),
        type: event.eventType,
        title: getEventTitle(event.eventType, event.agentId),
        description: getEventDescription(event),
        agentId: event.agentId,
        severity: getEventSeverity(event.eventType),
        metadata: {
          level: event.level,
          sessionId: event.sessionId,
          tokensUsed: event.tokensUsed,
          duration: event.performanceImpact.duration,
          memoryDelta: event.performanceImpact.memoryDelta,
          tokenCost: event.performanceImpact.tokenCost,
          ...event.eventData.metadata
        }
      }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Most recent first
  }, [events, maxEvents, selectedEventTypes, selectedAgents, searchQuery, timeRange]);

  // Event statistics
  const eventStats = useMemo(() => {
    const stats = {
      total: timelineEvents.length,
      byType: {} as Record<string, number>,
      byAgent: {} as Record<string, number>,
      bySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        success: 0
      }
    };

    timelineEvents.forEach(event => {
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
      stats.byAgent[event.agentId || 'unknown'] = (stats.byAgent[event.agentId || 'unknown'] || 0) + 1;
      stats.bySeverity[event.severity as keyof typeof stats.bySeverity]++;
    });

    return stats;
  }, [timelineEvents]);

  // Available event types and agents for filters
  const availableEventTypes = useMemo(() => {
    const types = new Set<LifecycleEventType>();
    events.forEach(event => types.add(event.eventType));
    return Array.from(types);
  }, [events]);

  const availableAgents = useMemo(() => {
    const agents = new Set<string>();
    events.forEach(event => agents.add(event.agentId));
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

  const handleEventSelect = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    onEventSelect?.(eventId);
  }, [onEventSelect]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastUpdated(new Date());
      setIsRefreshing(false);
    }, 1000);
  }, []);

  const handleExportEvents = useCallback(() => {
    const dataStr = JSON.stringify(timelineEvents, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `events-${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [timelineEvents]);

  const toggleEventType = useCallback((eventType: LifecycleEventType) => {
    setSelectedEventTypes(prev =>
      prev.includes(eventType)
        ? prev.filter(t => t !== eventType)
        : [...prev, eventType]
    );
  }, []);

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents(prev =>
      prev.includes(agentId)
        ? prev.filter(a => a !== agentId)
        : [...prev, agentId]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedEventTypes([]);
    setSelectedAgents([]);
    setSearchQuery('');
  }, []);

  // Auto-scroll to top on new events
  useEffect(() => {
    if (timelineRef.current && timelineEvents.length > 0) {
      timelineRef.current.scrollTop = 0;
    }
  }, [timelineEvents.length]);

  function getEventTitle(eventType: LifecycleEventType, agentId: string): string {
    switch (eventType) {
      case 'spawned': return `Agent ${agentId} spawned`;
      case 'paused': return `Agent ${agentId} paused`;
      case 'resumed': return `Agent ${agentId} resumed`;
      case 'terminated': return `Agent ${agentId} terminated`;
      case 'checkpoint_created': return `Checkpoint created for ${agentId}`;
      case 'checkpoint_restored': return `Checkpoint restored for ${agentId}`;
      case 'state_changed': return `Agent ${agentId} state changed`;
      case 'task_assigned': return `Task assigned to ${agentId}`;
      case 'task_completed': return `Task completed by ${agentId}`;
      case 'error_occurred': return `Error in ${agentId}`;
      default: return `Event for ${agentId}`;
    }
  }

  function getEventDescription(event: AgentLifecycleEvent): string {
    switch (event.eventType) {
      case 'spawned':
        return `Agent spawned at level ${event.level} with priority ${event.priority || 'unknown'}`;
      case 'paused':
        return event.eventData.reason || 'Agent paused';
      case 'resumed':
        return event.eventData.reason || 'Agent resumed';
      case 'terminated':
        return event.eventData.reason || 'Agent terminated';
      case 'task_assigned':
        return event.eventData.taskDescription || 'Task assigned';
      case 'task_completed':
        return event.eventData.taskDescription || 'Task completed';
      case 'error_occurred':
        return event.eventData.errorMessage || 'An error occurred';
      default:
        return '';
    }
  }

  function getEventSeverity(eventType: LifecycleEventType): 'info' | 'warning' | 'error' | 'success' {
    switch (eventType) {
      case 'error_occurred': return 'error';
      case 'task_completed': return 'success';
      case 'terminated': return 'warning';
      default: return 'info';
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Event Timeline</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-3 py-2 text-sm bg-gray-50 text-gray-600 rounded hover:bg-gray-100 transition-colors flex items-center space-x-2"
            >
              <Eye className="w-4 h-4" />
              <span>{showDetails ? 'Hide' : 'Show'} Details</span>
            </button>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleExportEvents}
              className="px-3 py-2 text-sm bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{eventStats.total}</p>
            <p className="text-xs text-gray-500">Total Events</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{eventStats.bySeverity.error}</p>
            <p className="text-xs text-gray-500">Errors</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{eventStats.bySeverity.success}</p>
            <p className="text-xs text-gray-500">Success</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{Object.keys(eventStats.byAgent).length}</p>
            <p className="text-xs text-gray-500">Active Agents</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {showFilters && (
            <div>
              <button
                onClick={() => setShowFiltersPanel(!showFiltersPanel)}
                className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
                {showFiltersPanel ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showFiltersPanel && (
                <div className="mt-3 space-y-3">
                  {/* Event Type Filters */}
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Event Types</p>
                    <div className="flex flex-wrap gap-2">
                      {availableEventTypes.map(eventType => (
                        <button
                          key={eventType}
                          onClick={() => toggleEventType(eventType)}
                          className={`px-3 py-1 text-xs rounded-full transition-colors ${
                            selectedEventTypes.includes(eventType)
                              ? 'bg-blue-100 text-blue-700 border border-blue-200'
                              : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          {eventType.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Agent Filters */}
                  {availableAgents.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Agents</p>
                      <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
                        {availableAgents.slice(0, 10).map(agentId => (
                          <button
                            key={agentId}
                            onClick={() => toggleAgent(agentId)}
                            className={`px-3 py-1 text-xs rounded-full transition-colors ${
                              selectedAgents.includes(agentId)
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                            }`}
                          >
                            {agentId}
                          </button>
                        ))}
                        {availableAgents.length > 10 && (
                          <span className="text-xs text-gray-500 px-2">
                            +{availableAgents.length - 10} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Clear Filters */}
                  {(selectedEventTypes.length > 0 || selectedAgents.length > 0 || searchQuery) && (
                    <button
                      onClick={clearFilters}
                      className="text-sm text-red-600 hover:text-red-700 transition-colors"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Last Updated */}
        <div className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200">
          Last updated: {lastUpdated.toLocaleTimeString()}
          {timelineEvents.length !== events.length && (
            <span className="ml-2">
              Showing {timelineEvents.length} of {events.length} events
            </span>
          )}
        </div>
      </div>

      {/* Timeline Content */}
      <div
        ref={timelineRef}
        className="overflow-auto"
        style={{ maxHeight: '600px' }}
      >
        {timelineEvents.length > 0 ? (
          <div className="p-4">
            {timelineEvents.map(event => (
              <EventItem
                key={event.id}
                event={event}
                isSelected={selectedEventId === event.id}
                onClick={handleEventSelect}
                showDetails={showDetails}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium text-gray-900 mb-1">No events found</p>
            <p className="text-sm text-gray-500">
              {searchQuery || selectedEventTypes.length > 0 || selectedAgents.length > 0
                ? 'Try adjusting your search or filters'
                : 'Events will appear here when agents are active'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventTimeline;