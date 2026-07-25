/**
 * AlertsPanel Component
 * Comprehensive alert and notification management system with filtering, sorting, and actions
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Snackbar,
  SelectChangeEvent,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  NotificationsOff as NotificationsOffIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircleOutline as SuccessIcon,
} from '@mui/icons-material';

import {
  Alert,
  AlertSeverity,
  AlertCategory,
  AlertStatus,
  AlertFilter,
  AlertSort,
  AlertsPanelProps,
  AlertSummary,
} from './AlertsPanel.types';

import {
  AlertsPanelContainer,
  AlertsPanelHeader,
  AlertsControls,
  AlertsList,
  AlertItem,
  AlertContent,
  AlertHeader,
  AlertTitle,
  AlertMessage,
  AlertMetadata,
  AlertActions,
  SummaryBadge,
  CategoryGroupHeader,
  EmptyState,
  FilterChip,
  getCategoryColor,
} from './AlertsPanel.styles';

/**
 * Default filter state
 */
const DEFAULT_FILTER: AlertFilter = {
  severities: [],
  categories: [],
  statuses: ['active'],
  search: '',
};

/**
 * Default sort state
 */
const DEFAULT_SORT: AlertSort = {
  field: 'timestamp',
  direction: 'desc',
};

/**
 * AlertsPanel Component
 */
export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  alerts,
  onAcknowledge,
  onDismiss,
  onResolve,
  onAlertSelect,
  onFilterChange,
  onSortChange,
  filter: initialFilter = DEFAULT_FILTER,
  sort: initialSort = DEFAULT_SORT,
  maxAlerts = 100,
  enableAutoDismiss = true,
  defaultAutoDismissTimeout = 5000,
  soundNotification,
  showSummaryBadge = true,
  showFilters = true,
  showSort = true,
  compact = false,
  groupByCategory = false,
  className,
}) => {
  const [filter, setFilter] = useState<AlertFilter>(initialFilter);
  const [sort, setSort] = useState<AlertSort>(initialSort);
  const [snackbarAlert, setSnackbarAlert] = useState<Alert | null>(null);
  const [autoDismissTimers, setAutoDismissTimers] = useState<Map<string, NodeJS.Timeout>>(new Map());

  /**
   * Calculate alert summary statistics
   */
  const summary = useMemo((): AlertSummary => {
    const active = { error: 0, warning: 0, info: 0, success: 0 };
    const byCategory: Record<AlertCategory, number> = {
      system: 0,
      agent: 0,
      security: 0,
      performance: 0,
      validation: 0,
      user: 0,
    };

    let acknowledged = 0;
    let dismissed = 0;
    let resolved = 0;

    alerts.forEach((alert) => {
      if (alert.status === 'active') {
        active[alert.severity]++;
      } else if (alert.status === 'acknowledged') {
        acknowledged++;
      } else if (alert.status === 'dismissed') {
        dismissed++;
      } else if (alert.status === 'resolved') {
        resolved++;
      }
      byCategory[alert.category]++;
    });

    return {
      total: alerts.length,
      active,
      acknowledged,
      dismissed,
      resolved,
      byCategory,
    };
  }, [alerts]);

  /**
   * Filter alerts based on current filter settings
   */
  const filteredAlerts = useMemo(() => {
    let filtered = [...alerts];

    // Filter by severities
    if (filter.severities && filter.severities.length > 0) {
      filtered = filtered.filter((alert) => filter.severities!.includes(alert.severity));
    }

    // Filter by categories
    if (filter.categories && filter.categories.length > 0) {
      filtered = filtered.filter((alert) => filter.categories!.includes(alert.category));
    }

    // Filter by statuses
    if (filter.statuses && filter.statuses.length > 0) {
      filtered = filtered.filter((alert) => filter.statuses!.includes(alert.status));
    }

    // Filter by time range
    if (filter.timeRange) {
      const { from, to } = filter.timeRange;
      filtered = filtered.filter((alert) => {
        const timestamp = alert.timestamp.getTime();
        if (from && timestamp < from.getTime()) return false;
        if (to && timestamp > to.getTime()) return false;
        return true;
      });
    }

    // Filter by search query
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(
        (alert) =>
          alert.title.toLowerCase().includes(searchLower) ||
          alert.message.toLowerCase().includes(searchLower) ||
          alert.source?.toLowerCase().includes(searchLower)
      );
    }

    // Filter by source
    if (filter.source) {
      filtered = filtered.filter((alert) => alert.source === filter.source);
    }

    return filtered;
  }, [alerts, filter]);

  /**
   * Sort filtered alerts
   */
  const sortedAlerts = useMemo(() => {
    const sorted = [...filteredAlerts];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case 'timestamp':
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;
        case 'severity':
          const severityOrder: Record<AlertSeverity, number> = {
            error: 0,
            warning: 1,
            info: 2,
            success: 3,
          };
          comparison = severityOrder[a.severity] - severityOrder[b.severity];
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }

      return sort.direction === 'asc' ? comparison : -comparison;
    });

    return sorted.slice(0, maxAlerts);
  }, [filteredAlerts, sort, maxAlerts]);

  /**
   * Group alerts by category if enabled
   */
  const groupedAlerts = useMemo(() => {
    if (!groupByCategory) {
      return { ungrouped: sortedAlerts };
    }

    const grouped: Record<string, Alert[]> = {};
    sortedAlerts.forEach((alert) => {
      if (!grouped[alert.category]) {
        grouped[alert.category] = [];
      }
      grouped[alert.category].push(alert);
    });

    return grouped;
  }, [sortedAlerts, groupByCategory]);

  /**
   * Handle auto-dismiss for alerts
   */
  useEffect(() => {
    if (!enableAutoDismiss) return;

    const newTimers = new Map<string, NodeJS.Timeout>();

    alerts.forEach((alert) => {
      if (alert.status === 'active' && (alert.severity === 'success' || alert.severity === 'info')) {
        const timeout = alert.autoDismissTimeout || defaultAutoDismissTimeout;
        if (timeout > 0 && !autoDismissTimers.has(alert.id)) {
          const timer = setTimeout(() => {
            handleDismiss(alert.id);
          }, timeout);
          newTimers.set(alert.id, timer);
        }
      }
    });

    setAutoDismissTimers((prev) => {
      prev.forEach((timer) => clearTimeout(timer));
      return newTimers;
    });

    return () => {
      newTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [alerts, enableAutoDismiss, defaultAutoDismissTimeout]);

  /**
   * Play sound notification for new alerts
   */
  useEffect(() => {
    if (!soundNotification?.enabled) return;

    // Play sound for new alerts (simplified - in production, track previous alerts)
    const newAlerts = alerts.filter((alert) => alert.status === 'active');
    if (newAlerts.length > 0) {
      const mostSevere = newAlerts.reduce((prev, curr) => {
        const severityOrder: Record<AlertSeverity, number> = {
          error: 0,
          warning: 1,
          info: 2,
          success: 3,
        };
        return severityOrder[curr.severity] < severityOrder[prev.severity] ? curr : prev;
      });

      if (
        !soundNotification.severities ||
        soundNotification.severities.includes(mostSevere.severity)
      ) {
        // Play sound (browser Audio API would be used here)
        // For now, just log
        console.log(`🔔 Alert sound for ${mostSevere.severity}`);
      }
    }
  }, [alerts, soundNotification]);

  /**
   * Handle filter change
   */
  const handleFilterChange = useCallback(
    (newFilter: Partial<AlertFilter>) => {
      const updatedFilter = { ...filter, ...newFilter };
      setFilter(updatedFilter);
      onFilterChange?.(updatedFilter);
    },
    [filter, onFilterChange]
  );

  /**
   * Handle sort change
   */
  const handleSortChange = useCallback(
    (newSort: Partial<AlertSort>) => {
      const updatedSort = { ...sort, ...newSort };
      setSort(updatedSort);
      onSortChange?.(updatedSort);
    },
    [sort, onSortChange]
  );

  /**
   * Handle acknowledge alert
   */
  const handleAcknowledge = useCallback(
    (alertId: string) => {
      onAcknowledge?.(alertId);
    },
    [onAcknowledge]
  );

  /**
   * Handle dismiss alert
   */
  const handleDismiss = useCallback(
    (alertId: string) => {
      // Clear auto-dismiss timer if exists
      const timer = autoDismissTimers.get(alertId);
      if (timer) {
        clearTimeout(timer);
        setAutoDismissTimers((prev) => {
          const newMap = new Map(prev);
          newMap.delete(alertId);
          return newMap;
        });
      }
      onDismiss?.(alertId);
    },
    [onDismiss, autoDismissTimers]
  );

  /**
   * Handle resolve alert
   */
  const handleResolve = useCallback(
    (alertId: string) => {
      onResolve?.(alertId);
    },
    [onResolve]
  );

  /**
   * Handle severity filter toggle
   */
  const handleSeverityFilterToggle = (severity: AlertSeverity) => {
    const current = filter.severities || [];
    const updated = current.includes(severity)
      ? current.filter((s) => s !== severity)
      : [...current, severity];
    handleFilterChange({ severities: updated });
  };

  /**
   * Handle status filter change
   */
  const handleStatusFilterChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value as string[] | string;
    const statuses = (typeof value === 'string' ? value.split(',') : value) as AlertStatus[];
    handleFilterChange({ statuses });
  };

  /**
   * Get severity icon
   */
  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case 'error':
        return <ErrorIcon />;
      case 'warning':
        return <WarningIcon />;
      case 'info':
        return <InfoIcon />;
      case 'success':
        return <SuccessIcon />;
    }
  };

  /**
   * Format timestamp
   */
  const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  };

  /**
   * Render alert actions
   */
  const renderAlertActions = (alert: Alert) => {
    const actions = [];

    if (alert.status === 'active' && onAcknowledge) {
      actions.push(
        <Button
          key="acknowledge"
          size="small"
          variant="outlined"
          color="primary"
          startIcon={<CheckCircleIcon />}
          onClick={(e) => {
            e.stopPropagation();
            handleAcknowledge(alert.id);
          }}
        >
          Acknowledge
        </Button>
      );
    }

    if (alert.status !== 'dismissed' && onDismiss) {
      actions.push(
        <Button
          key="dismiss"
          size="small"
          variant="text"
          color="secondary"
          startIcon={<CloseIcon />}
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss(alert.id);
          }}
        >
          Dismiss
        </Button>
      );
    }

    if (alert.status === 'acknowledged' && onResolve) {
      actions.push(
        <Button
          key="resolve"
          size="small"
          variant="contained"
          color="success"
          startIcon={<CheckCircleIcon />}
          onClick={(e) => {
            e.stopPropagation();
            handleResolve(alert.id);
          }}
        >
          Resolve
        </Button>
      );
    }

    // Custom actions
    if (alert.actions) {
      alert.actions.forEach((action) => {
        actions.push(
          <Button
            key={action.id}
            size="small"
            variant={action.variant || 'text'}
            color={action.color || 'primary'}
            onClick={(e) => {
              e.stopPropagation();
              action.handler(alert);
            }}
          >
            {action.label}
          </Button>
        );
      });
    }

    return actions;
  };

  /**
   * Render individual alert
   */
  const renderAlert = (alert: Alert) => (
    <AlertItem
      key={alert.id}
      severity={alert.severity}
      compact={compact}
      onClick={() => onAlertSelect?.(alert.id)}
      icon={getSeverityIcon(alert.severity)}
    >
      <AlertContent>
        <AlertHeader>
          <Box sx={{ flex: 1 }}>
            <AlertTitle compact={compact}>{alert.title}</AlertTitle>
            <AlertMetadata>
              <span>{formatTimestamp(alert.timestamp)}</span>
              {alert.source && <span>• {alert.source}</span>}
              {alert.category && (
                <span style={{ color: getCategoryColor(alert.category) }}>• {alert.category}</span>
              )}
            </AlertMetadata>
          </Box>
        </AlertHeader>
        <AlertMessage compact={compact}>{alert.message}</AlertMessage>
        {!compact && renderAlertActions(alert).length > 0 && (
          <AlertActions>{renderAlertActions(alert)}</AlertActions>
        )}
      </AlertContent>
    </AlertItem>
  );

  /**
   * Render alerts list
   */
  const renderAlertsList = () => {
    if (sortedAlerts.length === 0) {
      return (
        <EmptyState>
          <NotificationsOffIcon />
          <Typography variant="h6">No alerts</Typography>
          <Typography variant="body2">All clear! No alerts match your filters.</Typography>
        </EmptyState>
      );
    }

    if (groupByCategory) {
      return Object.entries(groupedAlerts).map(([category, categoryAlerts]) => (
        <Box key={category}>
          <CategoryGroupHeader>
            <span style={{ color: getCategoryColor(category) }}>{category.toUpperCase()}</span>
            <span>({categoryAlerts.length})</span>
          </CategoryGroupHeader>
          {categoryAlerts.map(renderAlert)}
        </Box>
      ));
    }

    return sortedAlerts.map(renderAlert);
  };

  /**
   * Calculate total active alerts
   */
  const totalActiveAlerts = summary.active.error + summary.active.warning + summary.active.info + summary.active.success;

  return (
    <AlertsPanelContainer className={className}>
      {/* Header */}
      <AlertsPanelHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {showSummaryBadge ? (
            <SummaryBadge badgeContent={totalActiveAlerts} color="error" max={99}>
              <NotificationsIcon />
            </SummaryBadge>
          ) : (
            <NotificationsIcon />
          )}
          <Typography variant="h6" component="h2">
            Alerts
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh alerts">
            <IconButton size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </AlertsPanelHeader>

      {/* Controls */}
      {(showFilters || showSort) && (
        <AlertsControls>
          {showFilters && (
            <>
              <FilterChip
                label={`Error (${summary.active.error})`}
                className={filter.severities?.includes('error') ? 'active' : ''}
                onClick={() => handleSeverityFilterToggle('error')}
                icon={<ErrorIcon />}
              />
              <FilterChip
                label={`Warning (${summary.active.warning})`}
                className={filter.severities?.includes('warning') ? 'active' : ''}
                onClick={() => handleSeverityFilterToggle('warning')}
                icon={<WarningIcon />}
              />
              <FilterChip
                label={`Info (${summary.active.info})`}
                className={filter.severities?.includes('info') ? 'active' : ''}
                onClick={() => handleSeverityFilterToggle('info')}
                icon={<InfoIcon />}
              />
              <FilterChip
                label={`Success (${summary.active.success})`}
                className={filter.severities?.includes('success') ? 'active' : ''}
                onClick={() => handleSeverityFilterToggle('success')}
                icon={<SuccessIcon />}
              />

              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  multiple
                  value={filter.statuses || []}
                  onChange={handleStatusFilterChange}
                  label="Status"
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="acknowledged">Acknowledged</MenuItem>
                  <MenuItem value="dismissed">Dismissed</MenuItem>
                  <MenuItem value="resolved">Resolved</MenuItem>
                </Select>
              </FormControl>
            </>
          )}

          {showSort && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Sort by</InputLabel>
              <Select
                value={sort.field}
                onChange={(e) => handleSortChange({ field: e.target.value as AlertSort['field'] })}
                label="Sort by"
              >
                <MenuItem value="timestamp">Time</MenuItem>
                <MenuItem value="severity">Severity</MenuItem>
                <MenuItem value="category">Category</MenuItem>
                <MenuItem value="status">Status</MenuItem>
              </Select>
            </FormControl>
          )}
        </AlertsControls>
      )}

      {/* Alerts List */}
      <AlertsList>{renderAlertsList()}</AlertsList>

      {/* Snackbar for toast notifications */}
      {snackbarAlert && (
        <Snackbar
          open={Boolean(snackbarAlert)}
          autoHideDuration={snackbarAlert.autoDismissTimeout || defaultAutoDismissTimeout}
          onClose={() => setSnackbarAlert(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <AlertItem severity={snackbarAlert.severity} onClose={() => setSnackbarAlert(null)}>
            {snackbarAlert.title}
          </AlertItem>
        </Snackbar>
      )}
    </AlertsPanelContainer>
  );
};

export default AlertsPanel;
