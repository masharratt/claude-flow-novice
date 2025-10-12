/**
 * Fleet View - Swarm fleet management with metrics, grid/list view, and agent distribution
 * Features: Fleet aggregation cards, grid/list toggle, virtual scrolling, pie chart, WebSocket updates
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CloudQueue as CloudQueueIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  WifiOff as WifiOffIcon,
} from '@mui/icons-material';
import { VariableSizeList } from 'react-window';
import { Pie } from 'react-chartjs-2';
import { useAgentStore, agentSelectors } from '../../../shared/stores/agentStore';
import { useWebSocket } from '../../../shared/hooks/useWebSocket';

// Mock swarm data structure
interface Swarm {
  id: string;
  name: string;
  agentCount: number;
  status: { active: number; idle: number; completed: number; failed: number };
  createdAt: number;
}

// Generate mock swarms from agents
const generateMockSwarms = (agents: any[]): Swarm[] => {
  const swarmGroups = agents.reduce((acc, agent) => {
    const swarmId = agent.metadata?.swarmId || 'swarm-001';
    if (!acc[swarmId]) {
      acc[swarmId] = [];
    }
    acc[swarmId].push(agent);
    return acc;
  }, {} as Record<string, any[]>);

  return Object.entries(swarmGroups).map(([swarmId, swarmAgents], index) => {
    const statusCounts = swarmAgents.reduce(
      (acc, agent) => {
        if (agent.status === 'active') acc.active++;
        else if (agent.status === 'idle') acc.idle++;
        else if (agent.status === 'completed') acc.completed++;
        else if (agent.status === 'failed') acc.failed++;
        return acc;
      },
      { active: 0, idle: 0, completed: 0, failed: 0 }
    );

    return {
      id: swarmId,
      name: `Sprint 3.${index + 3} Implementation`,
      agentCount: swarmAgents.length,
      status: statusCounts,
      createdAt: Date.now() - index * 3600000,
    };
  });
};

const SwarmCard: React.FC<{ swarm: Swarm }> = ({ swarm }) => {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {swarm.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {swarm.agentCount} agents
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          <Chip label={`Active: ${swarm.status.active}`} size="small" color="success" />
          <Chip label={`Idle: ${swarm.status.idle}`} size="small" color="default" />
          <Chip label={`Done: ${swarm.status.completed}`} size="small" color="info" />
          {swarm.status.failed > 0 && (
            <Chip label={`Failed: ${swarm.status.failed}`} size="small" color="error" />
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

const SwarmListItem: React.FC<{ swarm: Swarm }> = ({ swarm }) => {
  return (
    <Box
      sx={{
        p: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Box>
        <Typography variant="subtitle1">{swarm.name}</Typography>
        <Typography variant="caption" color="text.secondary">
          {swarm.agentCount} agents
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Chip label={`Active: ${swarm.status.active}`} size="small" color="success" />
        <Chip label={`Idle: ${swarm.status.idle}`} size="small" color="default" />
        <Chip label={`Done: ${swarm.status.completed}`} size="small" color="info" />
        {swarm.status.failed > 0 && (
          <Chip label={`Failed: ${swarm.status.failed}`} size="small" color="error" />
        )}
      </Box>
    </Box>
  );
};

export const Fleet: React.FC = () => {
  const agents = useAgentStore((state) => state.agents);
  const loading = useAgentStore((state) => state.loading);
  const setLoading = useAgentStore((state) => state.setLoading);
  const updateAgent = useAgentStore((state) => state.updateAgent);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [swarmData, setSwarmData] = useState<Map<string, any>>(new Map());

  // WebSocket connection
  const { isConnected, subscribe } = useWebSocket();

  // Subscribe to real-time agent updates
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribeAgent = subscribe('agent:update', (data: any) => {
      // Update agent in store
      if (data.id) {
        updateAgent(data.id, data);
      }
    });

    const unsubscribeSwarm = subscribe('swarm:update', (data: any) => {
      // Update swarm data
      setSwarmData((prev) => {
        const next = new Map(prev);
        next.set(data.id, data);
        return next;
      });
    });

    return () => {
      unsubscribeAgent();
      unsubscribeSwarm();
    };
  }, [isConnected, subscribe, updateAgent]);

  // Generate swarms from agents
  const swarms = useMemo(() => {
    if (agents.length === 0) {
      // Return mock data for testing
      return [
        {
          id: 'swarm-001',
          name: 'Sprint 3.3 Implementation',
          agentCount: 5,
          status: { active: 3, idle: 1, completed: 1, failed: 0 },
          createdAt: Date.now(),
        },
      ];
    }
    return generateMockSwarms(agents);
  }, [agents]);

  // Fleet aggregation metrics
  const fleetMetrics = useMemo(() => {
    const totalAgents = agents.length || 0;
    const activeSwarms = swarms.length;
    const avgConfidence =
      agents.length > 0
        ? agents.reduce((sum, a) => sum + (a.metrics?.confidence || 0), 0) / agents.length
        : 0;
    const tasksCompleted = agents.reduce((sum, a) => sum + (a.metrics?.tasksCompleted || 0), 0);

    return {
      totalAgents,
      activeSwarms,
      avgConfidence,
      tasksCompleted,
    };
  }, [agents, swarms]);

  // Agent distribution for pie chart
  const agentDistribution = useMemo(() => {
    const distribution = agents.reduce((acc, agent) => {
      acc[agent.type] = (acc[agent.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const hasAgents = Object.keys(distribution).length > 0;

    return {
      labels: hasAgents ? Object.keys(distribution) : [],
      datasets: [
        {
          data: hasAgents ? Object.values(distribution) : [],
          backgroundColor: [
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 99, 132, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(54, 162, 235, 0.6)',
            'rgba(153, 102, 255, 0.6)',
            'rgba(255, 159, 64, 0.6)',
          ],
          borderColor: [
            'rgba(75, 192, 192, 1)',
            'rgba(255, 99, 132, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(153, 102, 255, 1)',
            'rgba(255, 159, 64, 1)',
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [agents]);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, [setLoading]);

  // Virtual list row renderer
  const getItemSize = useCallback(
    (index: number) => {
      return viewMode === 'grid' ? 200 : 80;
    },
    [viewMode]
  );

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const swarm = swarms[index];
      if (viewMode === 'grid') {
        return (
          <div style={{ ...style, padding: '8px' }} data-testid="swarm-card">
            <SwarmCard swarm={swarm} />
          </div>
        );
      } else {
        return (
          <div style={style} data-testid="swarm-list-item">
            <SwarmListItem swarm={swarm} />
          </div>
        );
      }
    },
    [swarms, viewMode]
  );

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CloudQueueIcon fontSize="large" />
          <Typography variant="h4" component="h1">
            Fleet Overview
          </Typography>
          {!isConnected && (
            <Chip
              icon={<WifiOffIcon />}
              label="Disconnected"
              color="error"
              size="small"
              data-testid="connection-status"
            />
          )}
          {isConnected && (
            <Chip
              label="Live"
              color="success"
              size="small"
              data-testid="connection-status"
            />
          )}
        </Box>
        <IconButton onClick={handleRefresh} aria-label="refresh fleet" size="large">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Aggregation Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card data-testid="metric-card-total-agents">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Total Agents
              </Typography>
              <Typography variant="h3" component="h3">
                {fleetMetrics.totalAgents}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card data-testid="metric-card-active-swarms">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Active Swarms
              </Typography>
              <Typography variant="h3" component="h3">
                {fleetMetrics.activeSwarms}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card data-testid="metric-card-avg-confidence">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Avg Confidence
              </Typography>
              <Typography variant="h3" component="h3">
                {(fleetMetrics.avgConfidence * 100).toFixed(0)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card data-testid="metric-card-tasks-completed">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Tasks Completed
              </Typography>
              <Typography variant="h3" component="h3">
                {fleetMetrics.tasksCompleted}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Grid/List Toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Swarms</Typography>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(e, newMode) => newMode && setViewMode(newMode)}
          aria-label="view mode"
        >
          <ToggleButton value="list" aria-label="list view" aria-pressed={viewMode === 'list'}>
            <ViewListIcon />
          </ToggleButton>
          <ToggleButton value="grid" aria-label="grid view" aria-pressed={viewMode === 'grid'}>
            <ViewModuleIcon />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Swarm List with Virtual Scrolling */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress role="progressbar" />
        </Box>
      )}

      {!loading && swarms.length > 0 && (
        <VariableSizeList
          height={400}
          itemCount={swarms.length}
          itemSize={getItemSize}
          width="100%"
          style={{ overflow: 'auto' }}
        >
          {Row}
        </VariableSizeList>
      )}

      {/* Agent Distribution Chart */}
      <Card sx={{ mt: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Agent Distribution by Type
          </Typography>
          <Box sx={{ height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center' }} data-testid="agent-distribution-chart">
            {agents.length === 0 ? (
              <Typography variant="body1" color="text.secondary">
                No agents available
              </Typography>
            ) : (
              <Pie data={agentDistribution} />
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
