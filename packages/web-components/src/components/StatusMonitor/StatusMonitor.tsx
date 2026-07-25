/**
 * StatusMonitor Component
 * Unified status monitoring component for agents, tasks, and processes
 * Consolidates features from 3 duplicate implementations
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';

import {
  StatusItem,
  StatusFilter,
  StatusSort,
  StatusSummary,
  StatusMonitorProps,
  StatusType,
} from './StatusMonitor.types';

import {
  StatusMonitorContainer,
  StatusHeader,
  HeaderControls,
  FilterControls,
  SummaryGrid,
  SummaryStat,
  StatusGrid,
  StatusCard,
  StatusChip,
  ProgressBar,
  ProgressFill,
  MetricsGrid,
  MetricItem,
  ErrorBadge,
  EmptyState,
} from './StatusMonitor.styles';

/**
 * Format duration in human-readable format
 */
const formatDuration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

/**
 * Format bytes in human-readable format
 */
const formatBytes = (bytes: number): string => {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

/**
 * Format time since timestamp
 */
const formatTimeSince = (timestamp: Date): string => {
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/**
 * Get progress severity based on percentage
 */
const getProgressSeverity = (progress: number): 'success' | 'warning' | 'error' => {
  if (progress >= 80) return 'success';
  if (progress >= 50) return 'warning';
  return 'error';
};

/**
 * Get status icon
 */
const getStatusIcon = (status: StatusType) => {
  switch (status) {
    case 'active':
    case 'busy':
      return <PlayArrowIcon fontSize="small" />;
    case 'paused':
      return <PauseIcon fontSize="small" />;
    case 'error':
      return <ErrorIcon fontSize="small" />;
    case 'terminated':
      return <StopIcon fontSize="small" />;
    case 'idle':
      return <CheckCircleIcon fontSize="small" />;
    default:
      return <TimerIcon fontSize="small" />;
  }
};

/**
 * Calculate summary statistics
 */
const calculateSummary = (items: StatusItem[]): StatusSummary => {
  const summary: StatusSummary = {
    total: items.length,
    active: 0,
    idle: 0,
    paused: 0,
    error: 0,
    terminated: 0,
    offline: 0,
    withErrors: 0,
    avgProgress: 0,
    avgHealth: 0,
    totalTokens: 0,
    avgCpuUsage: 0,
    avgMemoryUsage: 0,
  };

  if (items.length === 0) return summary;

  items.forEach((item) => {
    // Count statuses
    if (item.status === 'active' || item.status === 'busy') summary.active++;
    else if (item.status === 'idle') summary.idle++;
    else if (item.status === 'paused') summary.paused++;
    else if (item.status === 'error') summary.error++;
    else if (item.status === 'terminated') summary.terminated++;
    else if (item.status === 'offline') summary.offline++;

    // Count errors
    if (item.errors && item.errors.length > 0) summary.withErrors++;

    // Accumulate metrics
    summary.avgProgress += item.progress;
    summary.avgHealth += item.health;

    if (item.metrics?.tokensUsed) {
      summary.totalTokens = (summary.totalTokens || 0) + item.metrics.tokensUsed;
    }

    if (item.resources?.cpu) {
      summary.avgCpuUsage = (summary.avgCpuUsage || 0) + item.resources.cpu;
    }

    if (item.resources?.memory) {
      summary.avgMemoryUsage = (summary.avgMemoryUsage || 0) + item.resources.memory;
    }
  });

  // Calculate averages
  summary.avgProgress = summary.avgProgress / items.length;
  summary.avgHealth = summary.avgHealth / items.length;
  if (summary.avgCpuUsage) summary.avgCpuUsage = summary.avgCpuUsage / items.length;
  if (summary.avgMemoryUsage) summary.avgMemoryUsage = summary.avgMemoryUsage / items.length;

  return summary;
};

/**
 * StatusMonitor Component
 */
export const StatusMonitor: React.FC<StatusMonitorProps> = ({
  items,
  selectedId,
  onItemSelect,
  onRefresh,
  autoRefresh = true,
  refreshInterval = 5000,
  filter: initialFilter,
  sort: initialSort = { field: 'name', direction: 'asc' },
  maxCardsPerRow = 3,
  showSummary = true,
  showFilters = true,
  showSort = true,
  compact = false,
  className = '',
  websocketUrl,
  enableRealTime = false,
}) => {
  // State
  const [filter, setFilter] = useState<StatusFilter>(initialFilter || {});
  const [sort, setSort] = useState<StatusSort>(initialSort);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [realTimeData, setRealTimeData] = useState<Map<string, Partial<StatusItem>>>(new Map());

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!enableRealTime || !websocketUrl) return;

    const ws = new WebSocket(websocketUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status-update' && data.id) {
          setRealTimeData((prev) => {
            const newData = new Map(prev);
            newData.set(data.id, data.status);
            return newData;
          });
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, [websocketUrl, enableRealTime]);

  // Merge items with real-time data
  const enhancedItems = useMemo(() => {
    return items.map((item) => {
      const realTimeUpdate = realTimeData.get(item.id);
      return realTimeUpdate ? { ...item, ...realTimeUpdate } : item;
    });
  }, [items, realTimeData]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let filtered = [...enhancedItems];

    // Apply status filter
    if (filter.statuses && filter.statuses.length > 0) {
      filtered = filtered.filter((item) => filter.statuses!.includes(item.status));
    }

    // Apply health filter
    if (filter.minHealth !== undefined) {
      filtered = filtered.filter((item) => item.health >= filter.minHealth!);
    }

    // Apply connection status filter
    if (filter.connectionStatus && filter.connectionStatus.length > 0) {
      filtered = filtered.filter(
        (item) => item.connectionStatus && filter.connectionStatus!.includes(item.connectionStatus)
      );
    }

    // Apply errors only filter
    if (filter.errorsOnly) {
      filtered = filtered.filter((item) => item.errors && item.errors.length > 0);
    }

    // Apply search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(searchLower) ||
          (item.activity && item.activity.toLowerCase().includes(searchLower))
      );
    }

    // Sort items
    filtered.sort((a, b) => {
      const direction = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return direction * a.name.localeCompare(b.name);
        case 'status':
          return direction * a.status.localeCompare(b.status);
        case 'health':
          return direction * (b.health - a.health);
        case 'progress':
          return direction * (b.progress - a.progress);
        case 'lastActivity':
          return direction * (b.lastActivity.getTime() - a.lastActivity.getTime());
        default:
          return 0;
      }
    });

    return filtered;
  }, [enhancedItems, filter, sort]);

  // Calculate summary
  const summary = useMemo(() => calculateSummary(enhancedItems), [enhancedItems]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !onRefresh) return;

    const interval = setInterval(() => {
      setLastUpdated(new Date());
      onRefresh();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, onRefresh]);

  // Handlers
  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;

    setIsRefreshing(true);
    try {
      await onRefresh();
      setLastUpdated(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  const handleItemClick = useCallback(
    (id: string) => {
      if (onItemSelect) {
        onItemSelect(id);
      }
    },
    [onItemSelect]
  );

  return (
    <StatusMonitorContainer className={className}>
      {/* Header */}
      <StatusHeader>
        <HeaderControls>
          <Typography variant="h6" component="h3">
            Status Monitor
          </Typography>

          <FilterControls>
            {showFilters && (
              <>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filter.statuses?.[0] || 'all'}
                    onChange={(e) =>
                      setFilter({
                        ...filter,
                        statuses: e.target.value === 'all' ? undefined : [e.target.value as StatusType],
                      })
                    }
                    label="Status"
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="idle">Idle</MenuItem>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="busy">Busy</MenuItem>
                    <MenuItem value="paused">Paused</MenuItem>
                    <MenuItem value="error">Error</MenuItem>
                    <MenuItem value="offline">Offline</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  size="small"
                  placeholder="Search..."
                  value={filter.search || ''}
                  onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                  sx={{ minWidth: 200 }}
                />
              </>
            )}

            {showSort && (
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Sort by</InputLabel>
                <Select
                  value={sort.field}
                  onChange={(e) => setSort({ ...sort, field: e.target.value as StatusSort['field'] })}
                  label="Sort by"
                >
                  <MenuItem value="name">Name</MenuItem>
                  <MenuItem value="status">Status</MenuItem>
                  <MenuItem value="health">Health</MenuItem>
                  <MenuItem value="progress">Progress</MenuItem>
                  <MenuItem value="lastActivity">Activity</MenuItem>
                </Select>
              </FormControl>
            )}

            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              Refresh
            </Button>
          </FilterControls>
        </HeaderControls>

        {/* Summary Statistics */}
        {showSummary && (
          <>
            <Divider />
            <SummaryGrid>
              <SummaryStat>
                <Typography className="stat-value">{summary.total}</Typography>
                <Typography className="stat-label">Total</Typography>
              </SummaryStat>
              <SummaryStat>
                <Typography className="stat-value" sx={{ color: 'success.main' }}>
                  {summary.active}
                </Typography>
                <Typography className="stat-label">Active</Typography>
              </SummaryStat>
              <SummaryStat>
                <Typography className="stat-value" sx={{ color: 'info.main' }}>
                  {summary.idle}
                </Typography>
                <Typography className="stat-label">Idle</Typography>
              </SummaryStat>
              <SummaryStat>
                <Typography className="stat-value" sx={{ color: 'warning.main' }}>
                  {summary.paused}
                </Typography>
                <Typography className="stat-label">Paused</Typography>
              </SummaryStat>
              <SummaryStat>
                <Typography className="stat-value" sx={{ color: 'error.main' }}>
                  {summary.error}
                </Typography>
                <Typography className="stat-label">Errors</Typography>
              </SummaryStat>
              <SummaryStat>
                <Typography className="stat-value">{summary.avgHealth.toFixed(0)}%</Typography>
                <Typography className="stat-label">Avg Health</Typography>
              </SummaryStat>
            </SummaryGrid>

            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
              Last updated: {lastUpdated.toLocaleTimeString()} • Showing {filteredItems.length} of {summary.total}
            </Typography>
          </>
        )}
      </StatusHeader>

      {/* Status Cards */}
      {filteredItems.length > 0 ? (
        <StatusGrid maxCardsPerRow={maxCardsPerRow}>
          {filteredItems.map((item) => (
            <StatusCard
              key={item.id}
              status={item.status}
              selected={selectedId === item.id}
              compact={compact}
              onClick={() => handleItemClick(item.id)}
            >
              {/* Header */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="600">
                    {item.name}
                  </Typography>
                  {item.activity && (
                    <Typography variant="caption" color="text.secondary">
                      {item.activity}
                    </Typography>
                  )}
                </Box>
                <StatusChip status={item.status} label={item.status.toUpperCase()} size="small" icon={getStatusIcon(item.status)} />
              </Box>

              {/* Progress */}
              {item.progress > 0 && (
                <Box sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Progress
                    </Typography>
                    <Typography variant="caption" fontWeight="600">
                      {item.progress.toFixed(1)}%
                    </Typography>
                  </Box>
                  <ProgressBar>
                    <ProgressFill progress={item.progress} severity={getProgressSeverity(item.progress)} />
                  </ProgressBar>
                </Box>
              )}

              {/* Health */}
              <Box sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Health
                  </Typography>
                  <Typography variant="caption" fontWeight="600">
                    {item.health.toFixed(0)}%
                  </Typography>
                </Box>
                <ProgressBar>
                  <ProgressFill progress={item.health} severity={getProgressSeverity(item.health)} />
                </ProgressBar>
              </Box>

              {/* Metrics */}
              {(item.resources || item.metrics) && (
                <MetricsGrid sx={{ mb: 1.5 }}>
                  {item.resources?.cpu !== undefined && (
                    <MetricItem>
                      <SpeedIcon className="metric-icon" fontSize="small" />
                      <Box>
                        <Typography className="metric-label">CPU</Typography>
                        <Typography className="metric-value">{item.resources.cpu.toFixed(1)}%</Typography>
                      </Box>
                    </MetricItem>
                  )}
                  {(item.resources?.memory !== undefined || item.resources?.memoryUsage !== undefined) && (
                    <MetricItem>
                      <MemoryIcon className="metric-icon" fontSize="small" />
                      <Box>
                        <Typography className="metric-label">Memory</Typography>
                        <Typography className="metric-value">
                          {item.resources?.memoryUsage
                            ? formatBytes(item.resources.memoryUsage)
                            : `${item.resources?.memory.toFixed(1)}%`}
                        </Typography>
                      </Box>
                    </MetricItem>
                  )}
                  {item.metrics?.tokensUsed !== undefined && (
                    <MetricItem>
                      <Box>
                        <Typography className="metric-label">Tokens</Typography>
                        <Typography className="metric-value">{item.metrics.tokensUsed.toLocaleString()}</Typography>
                      </Box>
                    </MetricItem>
                  )}
                  {item.metrics?.efficiency !== undefined && (
                    <MetricItem>
                      <Box>
                        <Typography className="metric-label">Efficiency</Typography>
                        <Typography className="metric-value">{(item.metrics.efficiency * 100).toFixed(1)}%</Typography>
                      </Box>
                    </MetricItem>
                  )}
                </MetricsGrid>
              )}

              {/* Errors */}
              {item.errors && item.errors.length > 0 && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    Recent Errors
                  </Typography>
                  {item.errors.slice(0, 2).map((error, index) => (
                    <ErrorBadge key={index} severity={error.severity} sx={{ mb: 0.5 }}>
                      <WarningIcon fontSize="small" />
                      <Typography variant="caption" sx={{ flex: 1 }} noWrap>
                        {error.message}
                      </Typography>
                    </ErrorBadge>
                  ))}
                </Box>
              )}

              {/* Footer */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                  {formatTimeSince(item.lastActivity)}
                </Typography>
                {item.estimatedCompletion && (
                  <Typography variant="caption" color="primary">
                    ETA: {formatDuration(item.estimatedCompletion.getTime() - Date.now())}
                  </Typography>
                )}
              </Box>
            </StatusCard>
          ))}
        </StatusGrid>
      ) : (
        <EmptyState>
          <Box className="empty-icon">📊</Box>
          <Typography className="empty-title">No items found</Typography>
          <Typography className="empty-description">
            {filter.errorsOnly
              ? 'No items with errors'
              : filter.statuses && filter.statuses.length > 0
              ? 'No items match the current filters'
              : 'Status items will appear here when available'}
          </Typography>
        </EmptyState>
      )}
    </StatusMonitorContainer>
  );
};

export default StatusMonitor;
