/**
 * FleetOverview Component
 * Comprehensive fleet management dashboard with grid/list views, pagination, and real-time updates
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Pagination,
  CircularProgress,
  Alert,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  Box,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  GridView as GridViewIcon,
  ViewList as ViewListIcon,
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
  Agent,
  AgentStatus,
  FleetStatistics,
  FleetFilter,
  FleetSort,
  FleetPagination,
  FleetOverviewProps,
  AgentCardProps,
  ViewMode,
} from './FleetOverview.types';

import {
  FleetContainer,
  FleetHeader,
  HeaderControls,
  FilterControls,
  StatisticsGrid,
  StatCard,
  FleetContent,
  GridView,
  ListView,
  AgentCard,
  AgentCardHeader,
  AgentInfo,
  AgentAvatar,
  StatusChip,
  ConnectionIndicator,
  ProgressBar,
  ProgressFill,
  MetricsGrid,
  MetricItem,
  ErrorBadge,
  AgentCardFooter,
  EmptyState,
  PaginationContainer,
  LoadingOverlay,
} from './FleetOverview.styles';

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
const getStatusIcon = (status: AgentStatus) => {
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
 * Calculate fleet statistics
 */
const calculateStatistics = (agents: Agent[]): FleetStatistics => {
  const stats: FleetStatistics = {
    total: agents.length,
    active: 0,
    idle: 0,
    paused: 0,
    error: 0,
    terminated: 0,
    offline: 0,
    avgHealth: 0,
    avgEfficiency: 0,
    totalTokens: 0,
    totalTasks: 0,
  };

  if (agents.length === 0) return stats;

  agents.forEach((agent) => {
    // Count statuses
    if (agent.status === 'active' || agent.status === 'busy') stats.active++;
    else if (agent.status === 'idle') stats.idle++;
    else if (agent.status === 'paused') stats.paused++;
    else if (agent.status === 'error') stats.error++;
    else if (agent.status === 'terminated') stats.terminated++;
    else if (agent.status === 'offline') stats.offline++;

    // Accumulate metrics
    stats.avgHealth += agent.health;

    if (agent.metrics) {
      stats.avgEfficiency += agent.metrics.efficiency;
      stats.totalTokens += agent.metrics.tokensUsed;
      stats.totalTasks += agent.metrics.tasksCompleted;
    }
  });

  // Calculate averages
  stats.avgHealth = stats.avgHealth / agents.length;
  stats.avgEfficiency = stats.avgEfficiency / agents.length;

  return stats;
};

/**
 * Agent Card Component
 */
const AgentCardComponent: React.FC<AgentCardProps> = ({ agent, selected, compact, onClick }) => {
  return (
    <AgentCard status={agent.status} selected={selected} className={compact ? 'compact' : ''} onClick={onClick}>
      <AgentCardHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
          <AgentAvatar>
            {agent.avatar || agent.name.substring(0, 2).toUpperCase()}
          </AgentAvatar>
          <AgentInfo>
            <div className="agent-name">{agent.name}</div>
            <div className="agent-type">{agent.type}</div>
            {agent.activity && <div className="agent-activity">{agent.activity}</div>}
          </AgentInfo>
        </Box>
        <StatusChip status={agent.status} label={agent.status.toUpperCase()} size="small" icon={getStatusIcon(agent.status)} />
      </AgentCardHeader>

      {/* Connection Status */}
      <ConnectionIndicator status={agent.connectionStatus}>
        <span className="connection-dot"></span>
        <span>{agent.connectionStatus}</span>
      </ConnectionIndicator>

      {/* Progress */}
      {agent.progress > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Progress
            </Typography>
            <Typography variant="caption" fontWeight="600">
              {agent.progress.toFixed(1)}%
            </Typography>
          </Box>
          <ProgressBar>
            <ProgressFill progress={agent.progress} severity={getProgressSeverity(agent.progress)} />
          </ProgressBar>
        </Box>
      )}

      {/* Health */}
      <Box sx={{ mt: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Health
          </Typography>
          <Typography variant="caption" fontWeight="600">
            {agent.health.toFixed(0)}%
          </Typography>
        </Box>
        <ProgressBar>
          <ProgressFill progress={agent.health} severity={getProgressSeverity(agent.health)} />
        </ProgressBar>
      </Box>

      {/* Metrics */}
      {(agent.resources || agent.metrics) && (
        <MetricsGrid>
          {agent.resources?.cpu !== undefined && (
            <MetricItem>
              <SpeedIcon className="metric-icon" fontSize="small" />
              <Box>
                <Typography className="metric-label">CPU</Typography>
                <Typography className="metric-value">{agent.resources.cpu.toFixed(1)}%</Typography>
              </Box>
            </MetricItem>
          )}
          {agent.resources?.memory !== undefined && (
            <MetricItem>
              <MemoryIcon className="metric-icon" fontSize="small" />
              <Box>
                <Typography className="metric-label">Memory</Typography>
                <Typography className="metric-value">
                  {agent.resources.memoryUsage ? formatBytes(agent.resources.memoryUsage) : `${agent.resources.memory.toFixed(1)}%`}
                </Typography>
              </Box>
            </MetricItem>
          )}
          {agent.metrics?.tokensUsed !== undefined && (
            <MetricItem>
              <Box>
                <Typography className="metric-label">Tokens</Typography>
                <Typography className="metric-value">{agent.metrics.tokensUsed.toLocaleString()}</Typography>
              </Box>
            </MetricItem>
          )}
          {agent.metrics?.efficiency !== undefined && (
            <MetricItem>
              <Box>
                <Typography className="metric-label">Efficiency</Typography>
                <Typography className="metric-value">{(agent.metrics.efficiency * 100).toFixed(1)}%</Typography>
              </Box>
            </MetricItem>
          )}
        </MetricsGrid>
      )}

      {/* Errors */}
      {agent.errors && agent.errors.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Recent Errors
          </Typography>
          {agent.errors.slice(0, 2).map((error, index) => (
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
      <AgentCardFooter>
        <Typography variant="caption" color="text.secondary">
          {formatTimeSince(agent.lastActivity)}
        </Typography>
        {agent.estimatedCompletion && (
          <Typography variant="caption" color="primary">
            ETA: {formatDuration(agent.estimatedCompletion.getTime() - Date.now())}
          </Typography>
        )}
      </AgentCardFooter>
    </AgentCard>
  );
};

/**
 * FleetOverview Component
 */
export const FleetOverview: React.FC<FleetOverviewProps> = ({
  agents,
  selectedAgentId,
  onAgentSelect,
  onRefresh,
  autoRefresh = false,
  refreshInterval = 5000,
  filter: initialFilter,
  sort: initialSort = { field: 'name', direction: 'asc' },
  viewMode: initialViewMode = 'grid',
  enablePagination = true,
  pageSize: initialPageSize = 12,
  enableVirtualScrolling = false,
  showStatistics = true,
  showFilters = true,
  showSort = true,
  showViewToggle = true,
  compact = false,
  className = '',
  websocketUrl,
  enableRealTime = false,
  loading = false,
  error,
  onAgentAction,
}) => {
  // State
  const [filter, setFilter] = useState<FleetFilter>(initialFilter || {});
  const [sort, setSort] = useState<FleetSort>(initialSort);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [realTimeData, setRealTimeData] = useState<Map<string, Partial<Agent>>>(new Map());
  const [pagination, setPagination] = useState<FleetPagination>({
    page: 1,
    pageSize: initialPageSize,
    totalPages: 1,
    totalItems: 0,
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!enableRealTime || !websocketUrl) return;

    const ws = new WebSocket(websocketUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'agent-update' && data.id) {
          setRealTimeData((prev) => {
            const newData = new Map(prev);
            newData.set(data.id, data.agent);
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

  // Merge agents with real-time data
  const enhancedAgents = useMemo(() => {
    return agents.map((agent) => {
      const realTimeUpdate = realTimeData.get(agent.id);
      return realTimeUpdate ? { ...agent, ...realTimeUpdate } : agent;
    });
  }, [agents, realTimeData]);

  // Filter and sort agents
  const filteredAgents = useMemo(() => {
    let filtered = [...enhancedAgents];

    // Apply status filter
    if (filter.status && filter.status.length > 0) {
      filtered = filtered.filter((agent) => filter.status!.includes(agent.status));
    }

    // Apply connection status filter
    if (filter.connectionStatus && filter.connectionStatus.length > 0) {
      filtered = filtered.filter((agent) => filter.connectionStatus!.includes(agent.connectionStatus));
    }

    // Apply swarm filter
    if (filter.swarmId) {
      filtered = filtered.filter((agent) => agent.swarmId === filter.swarmId);
    }

    // Apply health filter
    if (filter.minHealth !== undefined) {
      filtered = filtered.filter((agent) => agent.health >= filter.minHealth!);
    }

    // Apply errors only filter
    if (filter.errorsOnly) {
      filtered = filtered.filter((agent) => agent.errors && agent.errors.length > 0);
    }

    // Apply search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(
        (agent) =>
          agent.name.toLowerCase().includes(searchLower) ||
          agent.type.toLowerCase().includes(searchLower) ||
          (agent.activity && agent.activity.toLowerCase().includes(searchLower))
      );
    }

    // Sort agents
    filtered.sort((a, b) => {
      const direction = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return direction * a.name.localeCompare(b.name);
        case 'status':
          return direction * a.status.localeCompare(b.status);
        case 'created':
          return direction * (b.created.getTime() - a.created.getTime());
        case 'lastActivity':
          return direction * (b.lastActivity.getTime() - a.lastActivity.getTime());
        case 'efficiency':
          return direction * ((b.metrics?.efficiency || 0) - (a.metrics?.efficiency || 0));
        default:
          return 0;
      }
    });

    return filtered;
  }, [enhancedAgents, filter, sort]);

  // Calculate pagination
  useEffect(() => {
    const totalPages = Math.ceil(filteredAgents.length / pagination.pageSize);
    setPagination((prev) => ({
      ...prev,
      totalPages,
      totalItems: filteredAgents.length,
      page: Math.min(prev.page, totalPages || 1),
    }));
  }, [filteredAgents.length, pagination.pageSize]);

  // Get paginated agents
  const paginatedAgents = useMemo(() => {
    if (!enablePagination || enableVirtualScrolling) {
      return filteredAgents;
    }

    const startIndex = (pagination.page - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    return filteredAgents.slice(startIndex, endIndex);
  }, [filteredAgents, pagination.page, pagination.pageSize, enablePagination, enableVirtualScrolling]);

  // Calculate statistics
  const statistics = useMemo(() => calculateStatistics(enhancedAgents), [enhancedAgents]);

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

  const handleAgentClick = useCallback(
    (agentId: string) => {
      if (onAgentSelect) {
        onAgentSelect(agentId);
      }
    },
    [onAgentSelect]
  );

  const handlePageChange = useCallback((_event: React.ChangeEvent<unknown>, page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  return (
    <FleetContainer className={className}>
      {/* Header */}
      <FleetHeader>
        <HeaderControls>
          <Typography variant="h5" component="h2" fontWeight="600">
            Fleet Overview
          </Typography>

          <FilterControls>
            {showFilters && (
              <>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filter.status?.[0] || 'all'}
                    onChange={(e) =>
                      setFilter({
                        ...filter,
                        status: e.target.value === 'all' ? undefined : [e.target.value as AgentStatus],
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
                  placeholder="Search agents..."
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
                  onChange={(e) => setSort({ ...sort, field: e.target.value as FleetSort['field'] })}
                  label="Sort by"
                >
                  <MenuItem value="name">Name</MenuItem>
                  <MenuItem value="status">Status</MenuItem>
                  <MenuItem value="created">Created</MenuItem>
                  <MenuItem value="lastActivity">Activity</MenuItem>
                  <MenuItem value="efficiency">Efficiency</MenuItem>
                </Select>
              </FormControl>
            )}

            {showViewToggle && (
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(_e, newMode) => newMode && setViewMode(newMode)}
                size="small"
              >
                <ToggleButton value="grid">
                  <GridViewIcon />
                </ToggleButton>
                <ToggleButton value="list">
                  <ViewListIcon />
                </ToggleButton>
              </ToggleButtonGroup>
            )}

            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
            >
              Refresh
            </Button>
          </FilterControls>
        </HeaderControls>

        {/* Statistics */}
        {showStatistics && (
          <>
            <Divider />
            <StatisticsGrid>
              <StatCard>
                <Typography className="stat-value">{statistics.total}</Typography>
                <Typography className="stat-label">Total Agents</Typography>
              </StatCard>
              <StatCard>
                <Typography className="stat-value" sx={{ color: 'success.main' }}>
                  {statistics.active}
                </Typography>
                <Typography className="stat-label">Active</Typography>
              </StatCard>
              <StatCard>
                <Typography className="stat-value" sx={{ color: 'info.main' }}>
                  {statistics.idle}
                </Typography>
                <Typography className="stat-label">Idle</Typography>
              </StatCard>
              <StatCard>
                <Typography className="stat-value" sx={{ color: 'warning.main' }}>
                  {statistics.paused}
                </Typography>
                <Typography className="stat-label">Paused</Typography>
              </StatCard>
              <StatCard>
                <Typography className="stat-value" sx={{ color: 'error.main' }}>
                  {statistics.error}
                </Typography>
                <Typography className="stat-label">Errors</Typography>
              </StatCard>
              <StatCard>
                <Typography className="stat-value">{statistics.avgHealth.toFixed(0)}%</Typography>
                <Typography className="stat-label">Avg Health</Typography>
              </StatCard>
              <StatCard>
                <Typography className="stat-value">{(statistics.avgEfficiency * 100).toFixed(0)}%</Typography>
                <Typography className="stat-label">Avg Efficiency</Typography>
              </StatCard>
              <StatCard>
                <Typography className="stat-value">{statistics.totalTokens.toLocaleString()}</Typography>
                <Typography className="stat-label">Total Tokens</Typography>
              </StatCard>
            </StatisticsGrid>

            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
              Last updated: {lastUpdated.toLocaleTimeString()} • Showing {paginatedAgents.length} of {filteredAgents.length}
            </Typography>
          </>
        )}
      </FleetHeader>

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mx: 2 }}>
          {error}
        </Alert>
      )}

      {/* Content */}
      <FleetContent sx={{ position: 'relative' }}>
        {loading && (
          <LoadingOverlay>
            <CircularProgress />
          </LoadingOverlay>
        )}

        {paginatedAgents.length > 0 ? (
          viewMode === 'grid' ? (
            <GridView className={compact ? 'compact' : ''}>
              {paginatedAgents.map((agent) => (
                <AgentCardComponent
                  key={agent.id}
                  agent={agent}
                  selected={selectedAgentId === agent.id}
                  compact={compact}
                  onClick={() => handleAgentClick(agent.id)}
                  onAction={onAgentAction ? (action) => onAgentAction(agent.id, action) : undefined}
                />
              ))}
            </GridView>
          ) : (
            <ListView>
              {paginatedAgents.map((agent) => (
                <AgentCardComponent
                  key={agent.id}
                  agent={agent}
                  selected={selectedAgentId === agent.id}
                  compact={compact}
                  onClick={() => handleAgentClick(agent.id)}
                  onAction={onAgentAction ? (action) => onAgentAction(agent.id, action) : undefined}
                />
              ))}
            </ListView>
          )
        ) : (
          <EmptyState>
            <Box className="empty-icon">🤖</Box>
            <Typography className="empty-title">No agents found</Typography>
            <Typography className="empty-description">
              {filter.errorsOnly
                ? 'No agents with errors'
                : filter.status && filter.status.length > 0
                ? 'No agents match the current filters'
                : 'Agents will appear here when available'}
            </Typography>
          </EmptyState>
        )}
      </FleetContent>

      {/* Pagination */}
      {enablePagination && !enableVirtualScrolling && pagination.totalPages > 1 && (
        <PaginationContainer>
          <Pagination
            count={pagination.totalPages}
            page={pagination.page}
            onChange={handlePageChange}
            color="primary"
            showFirstButton
            showLastButton
          />
        </PaginationContainer>
      )}
    </FleetContainer>
  );
};

export default FleetOverview;
