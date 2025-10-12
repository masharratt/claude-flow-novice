/**
 * AgentHierarchyTree Component
 * Unified implementation consolidating 4 source files:
 * - src/web/dashboard/components/AgentHierarchyTree.tsx
 * - src/web/dashboard/components/V1AgentHierarchyTree.tsx
 * - src/components/visualizations/AgentHierarchyTree.tsx
 * - src/dashboard/components/FleetOverview.tsx
 *
 * Features:
 * - Depth visualization with expand/collapse
 * - Real-time updates
 * - Material-UI v6 styling
 * - TypeScript strict mode
 * - State management and filtering
 * - Search functionality
 * - Metrics display
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Chip,
  IconButton,
  Collapse,
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import {
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  UnfoldMore as ExpandAllIcon,
  UnfoldLess as CollapseAllIcon,
} from '@mui/icons-material';

import type {
  AgentHierarchyNode,
  AgentHierarchyTreeProps,
  TreeNodeProps,
} from './AgentHierarchyTree.types';

import {
  containerStyles,
  headerStyles,
  searchInputStyles,
  treeContentStyles,
  treeNodeStyles,
  expandButtonStyles,
  iconContainerStyles,
  nodeInfoStyles,
  nodeLabelStyles,
  stateBadgeStyles,
  metricsContainerStyles,
  metricItemStyles,
  footerStatsStyles,
  legendStyles,
  legendItemStyles,
  legendDotStyles,
  emptyStateStyles,
  loadingStateStyles,
  stateColors,
  getConfidenceColor,
} from './AgentHierarchyTree.styles';

/**
 * TreeNode Component
 * Renders individual tree nodes with expand/collapse functionality
 */
const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  onNodeClick,
  selectedNodeId,
  expandedNodes,
  onToggleExpand,
  showMetrics = true,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = expandedNodes.has(node.agentId);
  const hasChildren = (node.childAgentIds?.length ?? 0) > 0 || (node.children?.length ?? 0) > 0;
  const isSelected = selectedNodeId === node.agentId;

  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasChildren) {
        onToggleExpand(node.agentId);
      }
    },
    [hasChildren, node.agentId, onToggleExpand]
  );

  const handleNodeClick = useCallback(() => {
    onNodeClick?.(node);
  }, [node, onNodeClick]);

  const displayName = node.name || node.agentId;
  const confidence = node.confidence ?? (node.health !== undefined ? node.health / 100 : undefined);

  return (
    <Box>
      <Box
        sx={treeNodeStyles(level, isSelected, isHovered)}
        onClick={handleNodeClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Expand/Collapse Button */}
        <Box sx={{ width: 24, display: 'flex', alignItems: 'center' }}>
          {hasChildren && (
            <IconButton size="small" sx={expandButtonStyles} onClick={handleToggleExpand}>
              {isExpanded ? (
                <ExpandMoreIcon sx={{ fontSize: 16 }} />
              ) : (
                <ChevronRightIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          )}
        </Box>

        {/* State Indicator */}
        <Box
          sx={{
            ...iconContainerStyles,
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: stateColors[node.state] || stateColors.idle,
          }}
        />

        {/* Node Info */}
        <Box sx={nodeInfoStyles}>
          <Box sx={nodeLabelStyles}>
            <Typography variant="body2" component="span" noWrap>
              {displayName}
            </Typography>
            <Chip
              label={node.state}
              size="small"
              sx={stateBadgeStyles(node.state)}
            />
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              mt: 0.5,
              fontSize: '0.75rem',
              color: 'text.secondary',
            }}
          >
            <span>{node.type}</span>
            <span>Level {node.level}</span>
            {node.priority !== undefined && <span>Priority {node.priority}</span>}
            {node.currentTask && (
              <Typography
                variant="caption"
                component="span"
                noWrap
                sx={{ maxWidth: 200 }}
              >
                {node.currentTask}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Metrics */}
        {showMetrics && (
          <Box sx={metricsContainerStyles}>
            {node.tokensUsed !== undefined && (
              <Box sx={metricItemStyles}>
                <Typography variant="caption" fontWeight="medium">
                  {node.tokensUsed.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  tokens
                </Typography>
              </Box>
            )}
            {node.metrics?.totalExecutionTimeMs && node.metrics.totalExecutionTimeMs > 0 && (
              <Box sx={metricItemStyles}>
                <Typography variant="caption" fontWeight="medium">
                  {(node.metrics.totalExecutionTimeMs / 1000).toFixed(1)}s
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  runtime
                </Typography>
              </Box>
            )}
            {confidence !== undefined && (
              <Box sx={metricItemStyles}>
                <Typography
                  variant="caption"
                  fontWeight="medium"
                  sx={{ color: getConfidenceColor(confidence) }}
                >
                  {(confidence * 100).toFixed(0)}%
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  confidence
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Children */}
      {hasChildren && (
        <Collapse in={isExpanded} timeout="auto">
          <Box sx={{ ml: 0.5, borderLeft: 1, borderColor: 'divider' }}>
            {(node.children || []).map((child) => (
              <TreeNode
                key={child.agentId}
                node={child}
                level={level + 1}
                onNodeClick={onNodeClick}
                selectedNodeId={selectedNodeId}
                expandedNodes={expandedNodes}
                onToggleExpand={onToggleExpand}
                showMetrics={showMetrics}
              />
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
};

/**
 * AgentHierarchyTree Component
 * Main component for displaying agent hierarchy
 */
export const AgentHierarchyTree: React.FC<AgentHierarchyTreeProps> = ({
  agents = [],
  data,
  onAgentSelect,
  onNodeClick,
  maxHeight = 600,
  showMetrics = true,
  filterByLevel,
  filterByState,
  searchQuery = '',
  realTimeUpdates = false,
  updateInterval = 5000,
  className,
  style,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const [loading, setLoading] = useState(false);

  // Build hierarchy tree from flat agent list or hierarchical data
  const hierarchyTree = useMemo(() => {
    setLoading(true);
    try {
      // If data prop is provided (single root), use it
      if (data) {
        return [data];
      }

      // Otherwise, build tree from flat agents array
      if (!agents || agents.length === 0) {
        return [];
      }

      const agentMap = new Map(agents.map((agent) => [agent.agentId, agent]));

      // Filter agents based on criteria
      const filteredAgents = agents.filter((agent) => {
        if (filterByLevel && !filterByLevel.includes(agent.level)) return false;
        if (filterByState && !filterByState.includes(agent.state)) return false;
        if (
          searchTerm &&
          !agent.agentId.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !agent.name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !agent.type.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !agent.currentTask?.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          return false;
        }
        return true;
      });

      // Find root nodes (agents without parents or with non-existent parents)
      const rootNodes: AgentHierarchyNode[] = [];
      const processedNodes = new Set<string>();

      filteredAgents.forEach((agent) => {
        if (!agent.parentAgentId || !agentMap.has(agent.parentAgentId)) {
          if (!processedNodes.has(agent.agentId)) {
            rootNodes.push(agent);
            processedNodes.add(agent.agentId);
          }
        }
      });

      // Build tree structure recursively
      const buildTree = (node: AgentHierarchyNode): AgentHierarchyNode => {
        const children = filteredAgents
          .filter((agent) => agent.parentAgentId === node.agentId)
          .filter((agent) => !processedNodes.has(agent.agentId))
          .map((child) => {
            processedNodes.add(child.agentId);
            return buildTree(child);
          });

        return {
          ...node,
          childAgentIds: children.map((child) => child.agentId),
          children,
        };
      };

      return rootNodes.map(buildTree);
    } finally {
      setLoading(false);
    }
  }, [agents, data, filterByLevel, filterByState, searchTerm]);

  // Auto-expand first two levels
  useEffect(() => {
    const autoExpand = new Set<string>();
    const expandLevels = (nodes: AgentHierarchyNode[], maxLevel: number) => {
      nodes.forEach((node) => {
        if (node.level < maxLevel) {
          autoExpand.add(node.agentId);
          if (node.children) {
            expandLevels(node.children, maxLevel);
          }
        }
      });
    };

    expandLevels(hierarchyTree, 2);
    setExpandedNodes(autoExpand);
  }, [hierarchyTree]);

  // Handle real-time updates
  useEffect(() => {
    if (!realTimeUpdates) return;

    const interval = setInterval(() => {
      // Trigger re-render for real-time data
      setExpandedNodes((prev) => new Set(prev));
    }, updateInterval);

    return () => clearInterval(interval);
  }, [realTimeUpdates, updateInterval]);

  const handleNodeClick = useCallback(
    (node: AgentHierarchyNode) => {
      setSelectedNodeId(node.agentId);
      onAgentSelect?.(node.agentId);
      onNodeClick?.(node);
    },
    [onAgentSelect, onNodeClick]
  );

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allNodeIds = new Set<string>();
    const collectIds = (nodes: AgentHierarchyNode[]) => {
      nodes.forEach((node) => {
        allNodeIds.add(node.agentId);
        if (node.children) {
          collectIds(node.children);
        }
      });
    };
    collectIds(hierarchyTree);
    setExpandedNodes(allNodeIds);
  }, [hierarchyTree]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    // Trigger re-render
    setTimeout(() => setLoading(false), 500);
  }, []);

  const totalAgents = agents.length || (data ? 1 : 0);
  const activeAgents = agents.filter((a) => a.state === 'active').length;
  const maxDepth = Math.max(...agents.map((a) => a.level), 0);

  if (loading && hierarchyTree.length === 0) {
    return (
      <Box sx={[containerStyles, loadingStateStyles] as any} className={className} style={style}>
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary">
          Loading agent hierarchy...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={containerStyles} className={className} style={style}>
      {/* Header */}
      <Box sx={headerStyles}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" component="h3">
            Agent Hierarchy
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button size="small" startIcon={<ExpandAllIcon />} onClick={expandAll}>
              Expand All
            </Button>
            <Button size="small" startIcon={<CollapseAllIcon />} onClick={collapseAll}>
              Collapse All
            </Button>
          </Box>
        </Box>

        {/* Search */}
        <TextField
          size="small"
          placeholder="Search agents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={searchInputStyles}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        {/* Legend */}
        <Box sx={legendStyles}>
          <Box sx={legendItemStyles}>
            <Box sx={legendDotStyles(stateColors.active)} />
            <Typography variant="caption">Active</Typography>
          </Box>
          <Box sx={legendItemStyles}>
            <Box sx={legendDotStyles(stateColors.paused)} />
            <Typography variant="caption">Paused</Typography>
          </Box>
          <Box sx={legendItemStyles}>
            <Box sx={legendDotStyles(stateColors.error)} />
            <Typography variant="caption">Error</Typography>
          </Box>
          <Box sx={legendItemStyles}>
            <Box sx={legendDotStyles(stateColors.terminated)} />
            <Typography variant="caption">Terminated</Typography>
          </Box>
        </Box>
      </Box>

      {/* Tree Content */}
      <Box sx={treeContentStyles(maxHeight)}>
        {hierarchyTree.length > 0 ? (
          hierarchyTree.map((node) => (
            <TreeNode
              key={node.agentId}
              node={node}
              level={0}
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNodeId}
              expandedNodes={expandedNodes}
              onToggleExpand={handleToggleExpand}
              showMetrics={showMetrics}
            />
          ))
        ) : (
          <Box sx={emptyStateStyles}>
            <Typography variant="body2" color="text.secondary">
              No agents found
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {searchTerm ? 'Try adjusting your search filters' : 'Agents will appear here when spawned'}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Footer Stats */}
      <Box sx={footerStatsStyles}>
        <span>Total Agents: {totalAgents}</span>
        <span>Active: {activeAgents}</span>
        <span>Max Depth: {maxDepth}</span>
      </Box>
    </Box>
  );
};

export default AgentHierarchyTree;
