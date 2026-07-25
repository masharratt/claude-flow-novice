/**
 * EventTimeline Component Barrel Export
 */

export { EventTimeline, default } from './EventTimeline';
export type {
  TimelineEvent,
  EventTimelineProps,
  EventItemProps,
  EventStats,
  EventFilter,
  EventCategory,
  EventSeverity,
  EventExportOptions,
} from './EventTimeline.types';
// Styles not exported to avoid naming conflicts with CFNLoopDashboard
// Import directly from './EventTimeline.styles' if needed
