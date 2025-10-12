/**
 * Hierarchy View
 * Interactive agent hierarchy tree view with node details and export functionality
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  IconButton,
  Button,
  Drawer,
  Tooltip,
  Divider,
  Chip,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  GetApp as DownloadIcon,
  Close as CloseIcon,
  AccountTree as AccountTreeIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { AgentHierarchyTreeContainer } from '../../components/containers/AgentHierarchyTreeContainer';
import { useAgentStore } from '../../../shared/stores/agentStore';
import { useWebSocket } from '../../../shared/hooks/useWebSocket';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import type { Agent } from '../../../shared/stores/agentStore';

const DRAWER_WIDTH = '30%';
const MIN_DRAWER_WIDTH = 400;

/**
 * Hierarchy Component
 */
export const Hierarchy: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<Agent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { agents, hierarchy, selectAgent, setLoading: setStoreLoading } = useAgentStore();
  const { isConnected } = useWebSocket();

  // WebSocket subscriptions for real-time updates
  useWebSocketEvent('hierarchy:change', (data: any) => {
    console.log('[Hierarchy] Hierarchy change event:', data);
    // The hierarchy will be automatically rebuilt by the store
  });

  useWebSocketEvent('agent:spawned', (data: any) => {
    console.log('[Hierarchy] Agent spawned:', data);
  });

  useWebSocketEvent('agent:terminated', (data: any) => {
    console.log('[Hierarchy] Agent terminated:', data);
    // Close drawer if terminated agent was selected
    if (selectedNode && data.agentId === selectedNode.id) {
      setDrawerOpen(false);
      setSelectedNode(null);
    }
  });

  // Get children for selected node
  const getChildren = useCallback(
    (parentId: string): Agent[] => {
      return agents.filter((agent) => agent.parentId === parentId);
    },
    [agents]
  );

  // Get parent for selected node
  const getParent = useCallback(
    (parentId: string | undefined): Agent | null => {
      if (!parentId) return null;
      return agents.find((agent) => agent.id === parentId) || null;
    },
    [agents]
  );

  // Handle node click (show details)
  const handleNodeClick = useCallback((agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (agent) {
      setSelectedNode(agent);
      setDrawerOpen(true);
      selectAgent(agentId);
    }
  }, [agents, selectAgent]);

  // Handle drawer close
  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setSelectedNode(null);
    selectAgent(null);
  }, [selectAgent]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    // In a real implementation, fetch hierarchy from API
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, []);

  // Export hierarchy as JSON
  const handleExportJSON = useCallback(() => {
    const exportData = {
      timestamp: new Date().toISOString(),
      totalAgents: agents.length,
      hierarchy: hierarchy,
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        parentId: agent.parentId,
        createdAt: agent.createdAt,
        metrics: agent.metrics,
      })),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-hierarchy-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [agents, hierarchy]);

  // Export hierarchy as CSV
  const handleExportCSV = useCallback(() => {
    const csvRows = [
      ['ID', 'Name', 'Type', 'Status', 'Parent ID', 'Tasks Completed', 'Confidence', 'Created At'],
    ];

    agents.forEach((agent) => {
      csvRows.push([
        agent.id,
        agent.name,
        agent.type,
        agent.status,
        agent.parentId || '',
        agent.metrics?.tasksCompleted?.toString() || '0',
        agent.metrics?.confidence?.toString() || '0',
        new Date(agent.createdAt).toISOString(),
      ]);
    });

    const csvContent = csvRows.map((row) => row.join(',')).join('\n');
    const dataBlob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-hierarchy-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [agents]);

  // Get status color
  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'idle':
        return 'default';
      case 'completed':
        return 'primary';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ p: 3, height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
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
          <AccountTreeIcon sx={{ fontSize: 32 }} color="primary" />
          <Typography variant="h4" component="h1" fontWeight={700}>
            Agent Hierarchy
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tooltip title="Refresh hierarchy">
            <IconButton onClick={handleRefresh} disabled={loading} aria-label="Refresh hierarchy">
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportJSON}
            aria-label="Export as JSON"
          >
            Export JSON
          </Button>

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
          WebSocket disconnected. Real-time hierarchy updates are unavailable.
        </Alert>
      )}

      {/* Loading Progress */}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Stats */}
      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Chip label={`Total Agents: ${agents.length}`} color="primary" />
        <Chip label={`Active: ${agents.filter((a) => a.status === 'active').length}`} color="success" />
        <Chip label={`Tree Depth: ${hierarchy?.depth || 0}`} color="info" />
      </Box>

      {/* Tree Container */}
      <Paper elevation={2} sx={{ flexGrow: 1, p: 2, overflow: 'auto' }}>
        {agents.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <Typography variant="body1" color="text.secondary">
              No agents to display. Spawn agents to see the hierarchy tree.
            </Typography>
          </Box>
        ) : (
          <AgentHierarchyTreeContainer
            maxHeight={undefined}
            showMetrics={true}
            realTimeUpdates={true}
          />
        )}
      </Paper>

      {/* Node Details Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={handleDrawerClose}
        sx={{
          '& .MuiDrawer-paper': {
            width: { xs: '90%', sm: '60%', md: DRAWER_WIDTH },
            minWidth: { xs: 'auto', md: MIN_DRAWER_WIDTH },
            p: 3,
          },
        }}
      >
        {selectedNode && (
          <Box>
            {/* Drawer Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h5" component="h2" fontWeight={600}>
                Agent Details
              </Typography>
              <IconButton onClick={handleDrawerClose} aria-label="Close details">
                <CloseIcon />
              </IconButton>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Agent Info */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                {selectedNode.name}
              </Typography>
              <Chip
                label={selectedNode.status}
                color={getStatusColor(selectedNode.status) as any}
                size="small"
                sx={{ mb: 2 }}
              />

              <Typography variant="body2" color="text.secondary" paragraph>
                <strong>ID:</strong> {selectedNode.id}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                <strong>Type:</strong> {selectedNode.type}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                <strong>Created:</strong> {new Date(selectedNode.createdAt).toLocaleString()}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                <strong>Last Updated:</strong> {new Date(selectedNode.updatedAt).toLocaleString()}
              </Typography>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Metrics */}
            {selectedNode.metrics && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Metrics
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  <strong>Tasks Completed:</strong> {selectedNode.metrics.tasksCompleted}
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  <strong>Confidence:</strong> {(selectedNode.metrics.confidence * 100).toFixed(1)}%
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  <strong>Error Rate:</strong> {(selectedNode.metrics.errorRate * 100).toFixed(1)}%
                </Typography>
              </Box>
            )}

            {selectedNode.metrics && <Divider sx={{ mb: 3 }} />}

            {/* Parent */}
            {selectedNode.parentId && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Parent Agent
                </Typography>
                {(() => {
                  const parent = getParent(selectedNode.parentId);
                  return parent ? (
                    <Paper
                      elevation={1}
                      sx={{ p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                      onClick={() => handleNodeClick(parent.id)}
                    >
                      <Typography variant="body1" fontWeight={600}>
                        {parent.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {parent.type}
                      </Typography>
                    </Paper>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Parent not found
                    </Typography>
                  );
                })()}
              </Box>
            )}

            {selectedNode.parentId && <Divider sx={{ mb: 3 }} />}

            {/* Children */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Child Agents ({getChildren(selectedNode.id).length})
              </Typography>
              {getChildren(selectedNode.id).length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No child agents
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {getChildren(selectedNode.id).map((child) => (
                    <Paper
                      key={child.id}
                      elevation={1}
                      sx={{ p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                      onClick={() => handleNodeClick(child.id)}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body1" fontWeight={600}>
                            {child.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {child.type}
                          </Typography>
                        </Box>
                        <Chip label={child.status} color={getStatusColor(child.status) as any} size="small" />
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Actions */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" fullWidth>
                View Full Details
              </Button>
              <Button variant="outlined" color="error" fullWidth>
                Terminate Agent
              </Button>
            </Box>
          </Box>
        )}
      </Drawer>
    </Box>
  );
};

export default Hierarchy;
