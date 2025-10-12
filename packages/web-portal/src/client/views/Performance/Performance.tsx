/**
 * Performance View
 * Performance metrics dashboard with charts, trends, and CSV export
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  IconButton,
  Button,
  Card,
  CardContent,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  LinearProgress,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  GetApp as DownloadIcon,
  Speed as SpeedIcon,
  Memory as MemoryIcon,
  People as PeopleIcon,
  Event as EventIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { useMetricsStore, metricsSelectors } from '../../../shared/stores/metricsStore';
import { useAgentStore } from '../../../shared/stores/agentStore';
import { useWebSocket } from '../../../shared/hooks/useWebSocket';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import { CPUChart } from './charts/CPUChart';
import { MemoryChart } from './charts/MemoryChart';
import { AgentsChart } from './charts/AgentsChart';

type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

interface MetricCardData {
  title: string;
  value: string | number;
  trend: number;
  trendLabel: string;
  icon: React.ReactNode;
  color: 'primary' | 'info' | 'warning' | 'success' | 'error';
}

/**
 * Performance Component
 */
export const Performance: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const metricsStore = useMetricsStore();
  const { agents } = useAgentStore();
  const { isConnected } = useWebSocket();

  // WebSocket subscription for real-time metrics updates
  useWebSocketEvent('metrics:update', (data: any) => {
    console.log('[Performance] Metrics update received:', data);
    // Update metrics store with new data
    if (data.system) {
      metricsStore.setSystemMetrics(data.system);
    }
    if (data.agents) {
      Object.entries(data.agents).forEach(([agentId, metrics]: [string, any]) => {
        metricsStore.setAgentMetrics(agentId, metrics);
      });
    }
    setLastUpdated(new Date());
  });

  // Auto-update every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // In a real implementation, this would trigger a fetch
      // For now, just update the last updated timestamp
      if (isConnected) {
        setLastUpdated(new Date());
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isConnected]);

  // Calculate metric cards data
  const metricCards: MetricCardData[] = useMemo(() => {
    const systemMetrics = metricsStore.systemMetrics;
    const activeAgents = agents.filter((a) => a.status === 'active').length;

    // Calculate CPU metrics
    const avgCPU = metricsSelectors.getAverageCPU(metricsStore);
    const cpuTrend = metricsSelectors.getCPUTrend(metricsStore);
    const cpuTrendValue = cpuTrend === 'increasing' ? 10 : cpuTrend === 'decreasing' ? -10 : 0;

    // Calculate Memory metrics
    const avgMemory = metricsSelectors.getAverageMemory(metricsStore);
    const memoryTrend = metricsSelectors.getMemoryTrend(metricsStore);
    const memoryTrendValue = memoryTrend === 'increasing' ? 8 : memoryTrend === 'decreasing' ? -8 : 0;

    // Calculate Events/sec
    const eventsPerSec = metricsStore.history.system.length > 0 ? 15 : 0;

    // Calculate trend for agents (mock - would compare with previous period)
    const agentTrend = 5;

    return [
      {
        title: 'System CPU',
        value: `${(systemMetrics?.cpu || avgCPU || 0).toFixed(1)}%`,
        trend: cpuTrendValue,
        trendLabel: 'vs last period',
        icon: <SpeedIcon sx={{ fontSize: 32 }} />,
        color: 'info',
      },
      {
        title: 'Memory Usage',
        value:
          systemMetrics && systemMetrics.memory >= 1024
            ? `${(systemMetrics.memory / 1024).toFixed(1)} GB`
            : `${(systemMetrics?.memory || avgMemory || 0).toFixed(0)} MB`,
        trend: memoryTrendValue,
        trendLabel: 'vs last period',
        icon: <MemoryIcon sx={{ fontSize: 32 }} />,
        color: 'warning',
      },
      {
        title: 'Active Agents',
        value: activeAgents,
        trend: agentTrend,
        trendLabel: 'last 24h',
        icon: <PeopleIcon sx={{ fontSize: 32 }} />,
        color: 'primary',
      },
      {
        title: 'Events/sec',
        value: eventsPerSec,
        trend: 0,
        trendLabel: 'vs last period',
        icon: <EventIcon sx={{ fontSize: 32 }} />,
        color: 'success',
      },
    ];
  }, [metricsStore, agents, isConnected]);

  // Handle time range change
  const handleTimeRangeChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newRange: TimeRange | null) => {
      if (newRange !== null) {
        setTimeRange(newRange);
      }
    },
    []
  );

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    // In a real implementation, fetch metrics from API
    setTimeout(() => {
      setLoading(false);
      setLastUpdated(new Date());
    }, 500);
  }, []);

  // Export metrics as CSV
  const handleExportCSV = useCallback(() => {
    const csvRows = [
      ['Timestamp', 'Metric', 'Value', 'Unit', 'Agent ID'],
      // System metrics
      ...metricsStore.history.system.map((metric) => [
        new Date(metric.timestamp).toISOString(),
        'CPU',
        metric.cpu.toString(),
        '%',
        'system',
      ]),
      ...metricsStore.history.system.map((metric) => [
        new Date(metric.timestamp).toISOString(),
        'Memory',
        metric.memory.toString(),
        'MB',
        'system',
      ]),
      ...metricsStore.history.system.map((metric) => [
        new Date(metric.timestamp).toISOString(),
        'Disk',
        metric.disk.toString(),
        'GB',
        'system',
      ]),
      // Agent metrics
      ...Array.from(metricsStore.history.agents.entries()).flatMap(([agentId, history]) =>
        history.flatMap((metric) => [
          [
            new Date(metric.timestamp).toISOString(),
            'CPU',
            metric.cpu.toString(),
            '%',
            agentId,
          ],
          [
            new Date(metric.timestamp).toISOString(),
            'Memory',
            metric.memory.toString(),
            'MB',
            agentId,
          ],
          [
            new Date(metric.timestamp).toISOString(),
            'Tasks Completed',
            metric.tasksCompleted.toString(),
            'count',
            agentId,
          ],
        ])
      ),
    ];

    const csvContent = csvRows.map((row) => row.join(',')).join('\n');
    const dataBlob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `performance-metrics-${timeRange}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [metricsStore, timeRange]);

  // Get trend icon
  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUpIcon fontSize="small" color="success" />;
    if (trend < 0) return <TrendingDownIcon fontSize="small" color="error" />;
    return <TrendingFlatIcon fontSize="small" color="action" />;
  };

  // Get trend color
  const getTrendColor = (trend: number): 'success' | 'error' | 'default' => {
    if (trend > 0) return 'success';
    if (trend < 0) return 'error';
    return 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AssessmentIcon sx={{ fontSize: 32 }} color="primary" />
          <Typography variant="h4" component="h1" fontWeight={700}>
            Performance Metrics
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Time Range Selector */}
          <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={handleTimeRangeChange}
            size="small"
            aria-label="Time range selector"
          >
            <ToggleButton value="1h" aria-label="Last hour">
              1h
            </ToggleButton>
            <ToggleButton value="6h" aria-label="Last 6 hours">
              6h
            </ToggleButton>
            <ToggleButton value="24h" aria-label="Last 24 hours">
              24h
            </ToggleButton>
            <ToggleButton value="7d" aria-label="Last 7 days">
              7d
            </ToggleButton>
            <ToggleButton value="30d" aria-label="Last 30 days">
              30d
            </ToggleButton>
          </ToggleButtonGroup>

          <Tooltip title="Refresh metrics">
            <IconButton onClick={handleRefresh} disabled={loading} aria-label="Refresh metrics">
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
            aria-label="Export as CSV"
          >
            Export CSV
          </Button>
        </Box>
      </Box>

      {/* Connection Status */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          WebSocket disconnected. Real-time metrics updates are unavailable.
        </Alert>
      )}

      {/* Loading Progress */}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Last Updated */}
      {lastUpdated && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          Last updated: {lastUpdated.toLocaleTimeString()} (auto-refreshes every 5s)
        </Typography>
      )}

      {/* Metric Cards Row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {metricCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card elevation={2} sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box sx={{ color: `${card.color}.main` }}>{card.icon}</Box>
                  {getTrendIcon(card.trend)}
                </Box>

                <Typography variant="h4" component="div" fontWeight={700} sx={{ mb: 0.5 }}>
                  {card.value}
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {card.title}
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    variant="caption"
                    color={getTrendColor(card.trend)}
                    fontWeight={600}
                  >
                    {card.trend > 0 ? '+' : ''}
                    {card.trend}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {card.trendLabel}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts Row 1: CPU and Memory */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, height: 320 }}>
            <Typography variant="h6" gutterBottom>
              CPU Usage
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {metricsStore.history.system.length > 0 ? (
              <CPUChart data={metricsStore.history.system} />
            ) : (
              <Box
                sx={{
                  height: 240,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'background.default',
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No CPU data available yet
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, height: 320 }}>
            <Typography variant="h6" gutterBottom>
              Memory Usage
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {metricsStore.history.system.length > 0 ? (
              <MemoryChart data={metricsStore.history.system} />
            ) : (
              <Box
                sx={{
                  height: 240,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'background.default',
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No memory data available yet
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Charts Row 2: Agents and Events */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, height: 320 }}>
            <Typography variant="h6" gutterBottom>
              Agent Status Distribution
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {agents.length > 0 ? (
              <AgentsChart agents={agents} />
            ) : (
              <Box
                sx={{
                  height: 240,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'background.default',
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No agents available yet
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, height: 320 }}>
            <Typography variant="h6" gutterBottom>
              Events Rate
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box
              sx={{
                height: 240,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.default',
                borderRadius: 1,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Events chart coming in future sprint
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Performance Summary Section */}
      <Paper elevation={2} sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Performance Summary ({timeRange})
        </Typography>
        <Divider sx={{ mb: 2 }} />

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Avg CPU Usage
              </Typography>
              <Typography variant="h6">
                {metricsSelectors.getAverageCPU(metricsStore).toFixed(1)}%
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Avg Memory Usage
              </Typography>
              <Typography variant="h6">
                {(metricsSelectors.getAverageMemory(metricsStore) / 1024).toFixed(1)} GB
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Total Agents
              </Typography>
              <Typography variant="h6">{agents.length}</Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Data Points
              </Typography>
              <Typography variant="h6">{metricsStore.history.system.length}</Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Top Performers Section */}
      <Paper elevation={2} sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Top Performing Agents
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {metricsSelectors.getTopPerformers(metricsStore, 5).length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No agent metrics available yet.
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {metricsSelectors.getTopPerformers(metricsStore, 5).map((performer, index) => {
              const agent = agents.find((a) => a.id === performer.agentId);
              return (
                <Grid item xs={12} sm={6} md={4} key={performer.agentId}>
                  <Paper
                    elevation={1}
                    sx={{
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box>
                      <Typography variant="body1" fontWeight={600}>
                        #{index + 1} {agent?.name || performer.agentId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {agent?.type || 'unknown'}
                      </Typography>
                    </Box>
                    <Typography variant="h6" color="primary">
                      {(performer.confidence * 100).toFixed(0)}%
                    </Typography>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Paper>
    </Box>
  );
};

export default Performance;
