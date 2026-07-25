/**
 * AlertsPanel Component Types
 * Comprehensive alert and notification management system
 */

/**
 * Alert severity levels
 */
export type AlertSeverity = 'error' | 'warning' | 'info' | 'success';

/**
 * Alert category for filtering and grouping
 */
export type AlertCategory = 'system' | 'agent' | 'security' | 'performance' | 'validation' | 'user';

/**
 * Alert status tracking
 */
export type AlertStatus = 'active' | 'acknowledged' | 'dismissed' | 'resolved';

/**
 * Core alert item
 */
export interface Alert {
  /** Unique identifier */
  id: string;
  /** Alert severity */
  severity: AlertSeverity;
  /** Alert category */
  category: AlertCategory;
  /** Alert title */
  title: string;
  /** Detailed message */
  message: string;
  /** Alert status */
  status: AlertStatus;
  /** Timestamp when alert was created */
  timestamp: Date;
  /** Source of the alert (agent ID, system component, etc.) */
  source?: string;
  /** Auto-dismiss timeout in milliseconds (0 = no auto-dismiss) */
  autoDismissTimeout?: number;
  /** Alert actions */
  actions?: AlertAction[];
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Stack trace for errors */
  stackTrace?: string;
  /** Related entity ID (e.g., task ID, agent ID) */
  relatedEntityId?: string;
  /** Acknowledged timestamp */
  acknowledgedAt?: Date;
  /** Dismissed timestamp */
  dismissedAt?: Date;
  /** Resolved timestamp */
  resolvedAt?: Date;
  /** User who acknowledged/dismissed */
  actionedBy?: string;
}

/**
 * Alert action button
 */
export interface AlertAction {
  /** Action ID */
  id: string;
  /** Action label */
  label: string;
  /** Action icon (Material-UI icon name) */
  icon?: string;
  /** Action handler */
  handler: (alert: Alert) => void;
  /** Button variant */
  variant?: 'text' | 'outlined' | 'contained';
  /** Button color */
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
}

/**
 * Alert filter configuration
 */
export interface AlertFilter {
  /** Filter by severity levels */
  severities?: AlertSeverity[];
  /** Filter by categories */
  categories?: AlertCategory[];
  /** Filter by status */
  statuses?: AlertStatus[];
  /** Filter by time range */
  timeRange?: {
    from?: Date;
    to?: Date;
  };
  /** Search query for title/message */
  search?: string;
  /** Show only alerts from specific source */
  source?: string;
}

/**
 * Alert sort configuration
 */
export interface AlertSort {
  /** Field to sort by */
  field: 'timestamp' | 'severity' | 'category' | 'status';
  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Alert summary statistics
 */
export interface AlertSummary {
  /** Total alerts */
  total: number;
  /** Active alerts by severity */
  active: {
    error: number;
    warning: number;
    info: number;
    success: number;
  };
  /** Acknowledged alerts */
  acknowledged: number;
  /** Dismissed alerts */
  dismissed: number;
  /** Resolved alerts */
  resolved: number;
  /** Alerts by category */
  byCategory: Record<AlertCategory, number>;
}

/**
 * Sound notification options
 */
export interface SoundNotification {
  /** Enable sound notifications */
  enabled: boolean;
  /** Play sound only for specific severities */
  severities?: AlertSeverity[];
  /** Volume (0-1) */
  volume?: number;
  /** Custom sound URLs by severity */
  customSounds?: Partial<Record<AlertSeverity, string>>;
}

/**
 * AlertsPanel component props
 */
export interface AlertsPanelProps {
  /** Alerts to display */
  alerts: Alert[];
  /** Callback when alert is acknowledged */
  onAcknowledge?: (alertId: string) => void;
  /** Callback when alert is dismissed */
  onDismiss?: (alertId: string) => void;
  /** Callback when alert is resolved */
  onResolve?: (alertId: string) => void;
  /** Callback when alert is selected for details */
  onAlertSelect?: (alertId: string) => void;
  /** Callback when filter changes */
  onFilterChange?: (filter: AlertFilter) => void;
  /** Callback when sort changes */
  onSortChange?: (sort: AlertSort) => void;
  /** Initial filter configuration */
  filter?: AlertFilter;
  /** Initial sort configuration */
  sort?: AlertSort;
  /** Maximum number of alerts to display */
  maxAlerts?: number;
  /** Enable auto-dismiss for success/info alerts */
  enableAutoDismiss?: boolean;
  /** Default auto-dismiss timeout in milliseconds */
  defaultAutoDismissTimeout?: number;
  /** Sound notification options */
  soundNotification?: SoundNotification;
  /** Show alert summary badge */
  showSummaryBadge?: boolean;
  /** Show filter controls */
  showFilters?: boolean;
  /** Show sort controls */
  showSort?: boolean;
  /** Compact mode (smaller alerts) */
  compact?: boolean;
  /** Group alerts by category */
  groupByCategory?: boolean;
  /** Custom CSS class */
  className?: string;
  /** Enable real-time updates via WebSocket */
  enableRealTime?: boolean;
  /** WebSocket URL for real-time alerts */
  websocketUrl?: string;
}

/**
 * Alert notification position
 */
export type NotificationPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Toast notification props (for Snackbar)
 */
export interface ToastNotificationProps {
  /** Alert to display */
  alert: Alert;
  /** Position on screen */
  position?: NotificationPosition;
  /** Callback when dismissed */
  onDismiss: (alertId: string) => void;
  /** Auto-hide duration in milliseconds */
  autoHideDuration?: number;
}
