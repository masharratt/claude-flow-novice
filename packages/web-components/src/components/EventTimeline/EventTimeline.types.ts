/**
 * EventTimeline Component Types
 * Type definitions for the consolidated EventTimeline component
 */

export type EventCategory = 'agent' | 'system' | 'error' | 'warning' | 'success' | 'info';
export type EventSeverity = 'info' | 'warning' | 'error' | 'success';

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: string;
  category: EventCategory;
  title: string;
  description?: string;
  agentId?: string;
  severity?: EventSeverity;
  metadata?: Record<string, any>;
}

export interface EventFilter {
  categories?: EventCategory[];
  severities?: EventSeverity[];
  agentIds?: string[];
  searchQuery?: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

export interface EventStats {
  total: number;
  byCategory: Record<EventCategory, number>;
  byAgent: Record<string, number>;
  bySeverity: Record<EventSeverity, number>;
}

export interface EventTimelineProps {
  events: TimelineEvent[];
  onEventSelect?: (eventId: string) => void;
  maxEvents?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  showFilters?: boolean;
  enableSearch?: boolean;
  enableVirtualScrolling?: boolean;
  enableExport?: boolean;
  virtualScrollHeight?: number;
  itemHeight?: number;
  filter?: EventFilter;
  className?: string;
  style?: React.CSSProperties;
}

export interface EventItemProps {
  event: TimelineEvent;
  isSelected?: boolean;
  onClick?: (eventId: string) => void;
  showDetails?: boolean;
  style?: React.CSSProperties;
}

export interface EventExportOptions {
  format: 'json' | 'csv';
  includeMetadata?: boolean;
  timeRange?: {
    start: Date;
    end: Date;
  };
}
