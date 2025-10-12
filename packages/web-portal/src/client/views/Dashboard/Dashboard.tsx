/**
 * Dashboard View
 * Main dashboard component with key metrics and real-time updates
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  GetApp as DownloadIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  People as PeopleIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Event as EventIcon,
} from '@mui/icons-material';
import { useDashboardWebSocket } from '../../../shared/hooks/useDashboardWebSocket';
import { MetricCard } from './components/MetricCard';
import {
  AgentHierarchyTreeContainer,
  StatusMonitorContainer,
  PerformanceChartsContainer,
  EventTimelineContainer,
  AlertsPanelContainer,
} from './components/containers';
import type { DashboardProps, DashboardState, ExportFormat } from './Dashboard.types';

/**
 * Dashboard Component
 */
export const Dashboard: React.FC<DashboardProps> = React.memo(
  ({ className, autoRefresh = true, refreshInterval = 5000 }) => {
    // State management
    const [state, setState] = useState<DashboardState>({
      timeRange: '1h',
      isRefreshing: false,
      lastUpdated: null,
      isPaused: false,
    });

    const [selectedAgent, setSelectedAgent] = useState<string | undefined>();

    // WebSocket connection with debounced updates
    const { dashboardState, refreshData, isConnected } = useDashboardWebSocket(
      {},
      {
        autoConnect: true,
        reconnect: true,
        reconnectDelay: 1000,
        maxReconnectAttempts: 5,
      }
    );

    // Calculate key metrics with memoization
    const keyMetrics = useMemo(() => {
      const agents = dashboardState.agents || [];
      const activeAgents = agents.filter((a: any) => a.status === 'active' || a.state === 'active').length;

      const cpuUsage = dashboardState.resourceUsage?.cpuUsage || 0;
      const memoryUsage = dashboardState.resourceUsage?.memoryUsage || 0;
      const eventsPerSec = dashboardState.metrics?.eventsPerSecond || 0;

      // Calculate trends (mock for now - would come from historical data)
      return {
        activeAgents: {
          value: activeAgents,
          trend: 5,
        },
        cpuUsage: {
          value: `${cpuUsage.toFixed(1)}%`,
          trend: -2,
        },
        memoryUsage: {
          value: memoryUsage >= 1024 ? `${(memoryUsage / 1024).toFixed(1)} GB` : `${memoryUsage.toFixed(0)} MB`,
          trend: 8,
        },
        eventsPerSec: {
          value: Math.round(eventsPerSec),
          trend: 0,
        },
      };
    }, [dashboardState.agents, dashboardState.resourceUsage, dashboardState.metrics]);

    // Auto-refresh effect with pause support
    useEffect(() => {
      if (!autoRefresh || state.isPaused) return;

      const interval = setInterval(() => {
        if (isConnected) {
          refreshData();
          setState((prev) => ({ ...prev, lastUpdated: new Date() }));
        }
      }, refreshInterval);

      return () => clearInterval(interval);
    }, [autoRefresh, state.isPaused, refreshInterval, isConnected, refreshData]);

    // Handlers
    const handleRefresh = useCallback(async () => {
      setState((prev) => ({ ...prev, isRefreshing: true }));
      try {
        await refreshData();
        setState((prev) => ({ ...prev, lastUpdated: new Date() }));
      } finally {
        setState((prev) => ({ ...prev, isRefreshing: false }));
      }
    }, [refreshData]);

    const handleTimeRangeChange = useCallback((event: any) => {
      setState((prev) => ({ ...prev, timeRange: event.target.value }));
    }, []);

    const handleTogglePause = useCallback(() => {
      setState((prev) => ({ ...prev, isPaused: !prev.isPaused }));
    }, []);

    const handleExport = useCallback(
      (format: ExportFormat) => {
        const exportData = {
          timestamp: new Date().toISOString(),
          timeRange: state.timeRange,
          metrics: keyMetrics,
          agents: dashboardState.agents,
          events: dashboardState.events,
          alerts: dashboardState.alerts,
          resourceUsage: dashboardState.resourceUsage,
        };

        const filename = `dashboard-export-${Date.now()}.${format}`;

        if (format === 'json') {
          const dataStr = JSON.stringify(exportData, null, 2);
          const dataBlob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(dataBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.click();
          URL.revokeObjectURL(url);
        } else if (format === 'csv') {
          const csvRows = [
            ['Metric', 'Value', 'Trend'],
            ['Active Agents', keyMetrics.activeAgents.value, `${keyMetrics.activeAgents.trend}%`],
            ['CPU Usage', keyMetrics.cpuUsage.value, `${keyMetrics.cpuUsage.trend}%`],
            ['Memory Usage', keyMetrics.memoryUsage.value, `${keyMetrics.memoryUsage.trend}%`],
            ['Events/sec', keyMetrics.eventsPerSec.value, `${keyMetrics.eventsPerSec.trend}%`],
          ];
          const csvContent = csvRows.map((row) => row.join(',')).join('\n');
          const dataBlob = new Blob([csvContent], { type: 'text/csv' });
          const url = URL.createObjectURL(dataBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.click();
          URL.revokeObjectURL(url);
        }
      },
      [state.timeRange, keyMetrics, dashboardState]
    );

    const handleAgentSelect = useCallback((agentId: string) => {
      setSelectedAgent(agentId);
    }, []);

    return (
      <Box className={className} sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h4" component="h1" fontWeight={700}>
            Dashboard
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Time Range Selector */}
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="time-range-label">Time Range</InputLabel>
              <Select
                labelId="time-range-label"
                value={state.timeRange}
                onChange={handleTimeRangeChange}
                label="Time Range"
                aria-label="Select time range for dashboard metrics"
              >
                <MenuItem value="1h">Last Hour</MenuItem>
                <MenuItem value="6h">Last 6 Hours</MenuItem>
                <MenuItem value="24h">Last 24 Hours</MenuItem>
                <MenuItem value="7d">Last 7 Days</MenuItem>
              </Select>
            </FormControl>

            {/* Actions */}
            <Tooltip title={state.isPaused ? 'Resume auto-refresh' : 'Pause auto-refresh'}>
              <IconButton onClick={handleTogglePause} color={state.isPaused ? 'warning' : 'default'} aria-label="Toggle auto-refresh">
                {state.isPaused ? <PlayArrowIcon /> : <PauseIcon />}
              </IconButton>
            </Tooltip>

            <Tooltip title="Refresh dashboard">
              <IconButton onClick={handleRefresh} disabled={state.isRefreshing} aria-label="Refresh dashboard data">
                <RefreshIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Export data">
              <IconButton onClick={() => handleExport('json')} aria-label="Export dashboard data as JSON">
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Connection Status */}
        {!isConnected && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'warning.lighter', borderRadius: 1 }}>
            <Typography variant="body2" color="warning.dark">
              WebSocket disconnected. Attempting to reconnect...
            </Typography>
          </Box>
        )}

        {/* Key Metrics Row */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Active Agents"
              value={keyMetrics.activeAgents.value}
              trend={keyMetrics.activeAgents.trend}
              trendLabel="vs last period"
              icon={<PeopleIcon />}
              color="primary"
              loading={!dashboardState.agents}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="System CPU"
              value={keyMetrics.cpuUsage.value}
              trend={keyMetrics.cpuUsage.trend}
              trendLabel="vs last period"
              icon={<SpeedIcon />}
              color="info"
              loading={!dashboardState.resourceUsage}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Memory Usage"
              value={keyMetrics.memoryUsage.value}
              trend={keyMetrics.memoryUsage.trend}
              trendLabel="vs last period"
              icon={<MemoryIcon />}
              color="warning"
              loading={!dashboardState.resourceUsage}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Events/sec"
              value={keyMetrics.eventsPerSec.value}
              trend={keyMetrics.eventsPerSec.trend}
              trendLabel="vs last period"
              icon={<EventIcon />}
              color="success"
              loading={!dashboardState.metrics}
            />
          </Grid>
        </Grid>

        {/* Agent Hierarchy & Status Row */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={6}>
            <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
              <AgentHierarchyTreeContainer
                dashboardState={dashboardState}
                maxHeight={400}
                onAgentSelect={handleAgentSelect}
              />
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
              <StatusMonitorContainer
                dashboardState={dashboardState}
                onAgentSelect={handleAgentSelect}
                onRefresh={handleRefresh}
              />
            </Paper>
          </Grid>
        </Grid>

        {/* Performance Charts Row */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12}>
            <Paper elevation={2} sx={{ p: 2 }}>
              <PerformanceChartsContainer dashboardState={dashboardState} timeRange={state.timeRange} />
            </Paper>
          </Grid>
        </Grid>

        {/* Recent Events & Alerts Row */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
              <EventTimelineContainer dashboardState={dashboardState} limit={10} />
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
              <AlertsPanelContainer dashboardState={dashboardState} maxAlerts={5} />
            </Paper>
          </Grid>
        </Grid>

        {/* Footer */}
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Last updated: {state.lastUpdated?.toLocaleTimeString() || 'Never'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </Typography>
        </Box>
      </Box>
    );
  }
);

Dashboard.displayName = 'Dashboard';

export default Dashboard;
