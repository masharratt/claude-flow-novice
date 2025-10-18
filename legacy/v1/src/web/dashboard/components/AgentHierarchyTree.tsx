/**
 * Agent Hierarchy Tree Component
 * Real-time visualization of agent relationships and hierarchy
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, User, Users, Activity, Pause, AlertCircle, CheckCircle } from 'lucide-react';
import { AgentHierarchyNode, AgentState, ComponentProps } from '../types';

interface TreeNodeProps {
  node: AgentHierarchyNode;
  level: number;
  onNodeClick?: (node: AgentHierarchyNode) => void;
  selectedNodeId?: string;
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  onNodeClick,
  selectedNodeId,
  expandedNodes,
  onToggleExpand
}) => {
  const isExpanded = expandedNodes.has(node.agentId);
  const hasChildren = node.childAgentIds.length > 0;
  const isSelected = selectedNodeId === node.agentId;
  const paddingLeft = level * 24;

  const getStateIcon = (state: AgentState) => {
    switch (state) {
      case 'active':
        return <Activity className="w-4 h-4 text-green-500" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'terminated':
        return <CheckCircle className="w-4 h-4 text-gray-400" />;
      default:
        return <User className="w-4 h-4 text-blue-500" />;
    }
  };

  const getTypeIcon = (type: string) => {
    if (type.includes('coordinator') || type.includes('orchestrator')) {
      return <Users className="w-4 h-4 text-purple-500" />;
    }
    return <User className="w-4 h-4 text-blue-500" />;
  };

  const getStateColor = (state: AgentState) => {
    switch (state) {
      case 'active':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'paused':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'terminated':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggleExpand(node.agentId);
    }
  }, [hasChildren, node.agentId, onToggleExpand]);

  const handleNodeClick = useCallback(() => {
    onNodeClick?.(node);
  }, [node, onNodeClick]);

  return (
    <div className="select-none">
      <div
        className={`flex items-center py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 hover:bg-gray-50 ${isSelected ? 'bg-blue-50 border border-blue-200' : ''}`}
        style={{ paddingLeft: `${paddingLeft + 12}px` }}
        onClick={handleNodeClick}
      >
        {/* Expand/Collapse Icon */}
        <div
          className={`flex items-center justify-center w-5 h-5 mr-1 ${hasChildren ? 'cursor-pointer' : ''}`}
          onClick={handleToggleExpand}
        >
          {hasChildren && (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )
          )}
        </div>

        {/* State Icon */}
        <div className="mr-2">
          {getStateIcon(node.state)}
        </div>

        {/* Type Icon */}
        <div className="mr-2">
          {getTypeIcon(node.type)}
        </div>

        {/* Agent Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-sm text-gray-900 truncate">
              {node.agentId}
            </span>
            <span className={`px-2 py-1 text-xs rounded-full border ${getStateColor(node.state)}`}>
              {node.state}
            </span>
          </div>
          <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
            <span>{node.type}</span>
            <span>Level {node.level}</span>
            <span>Priority {node.priority}</span>
            {node.currentTask && (
              <span className="truncate max-w-xs">{node.currentTask}</span>
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <div className="text-right">
            <div>{node.tokensUsed.toLocaleString()}</div>
            <div className="text-gray-400">tokens</div>
          </div>
          {node.metrics.totalExecutionTimeMs > 0 && (
            <div className="text-right">
              <div>{(node.metrics.totalExecutionTimeMs / 1000).toFixed(1)}s</div>
              <div className="text-gray-400">runtime</div>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="ml-2 border-l border-gray-200">
          {node.childAgentIds.map(childId => (
            <TreeNode
              key={childId}
              node={
                {
                  agentId: childId,
                  type: 'unknown',
                  level: level + 1,
                  childAgentIds: [],
                  priority: 5,
                  state: 'idle',
                  sessionId: '',
                  createdAt: new Date(),
                  lastStateChange: new Date(),
                  tokensUsed: 0,
                  tokenBudget: 1000,
                  isPaused: false,
                  metrics: {
                    spawnTimeMs: 0,
                    totalExecutionTimeMs: 0,
                    pauseCount: 0,
                    resumeCount: 0,
                    checkpointCount: 0
                  },
                  waitingFor: [],
                  completedDependencies: []
                } // This would be replaced with actual child data
              }
              level={level + 1}
              onNodeClick={onNodeClick}
              selectedNodeId={selectedNodeId}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface AgentHierarchyTreeProps extends Partial<ComponentProps> {
  agents: AgentHierarchyNode[];
  onAgentSelect?: (agentId: string) => void;
  maxHeight?: number;
  showMetrics?: boolean;
  filterByLevel?: number[];
  filterByState?: AgentState[];
  searchQuery?: string;
}

export const AgentHierarchyTree: React.FC<AgentHierarchyTreeProps> = ({
  agents,
  onAgentSelect,
  maxHeight = 600,
  showMetrics = true,
  filterByLevel,
  filterByState,
  searchQuery,
  ...props
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState(searchQuery || '');

  // Build hierarchy tree from flat agent list
  const hierarchyTree = useMemo(() => {
    const agentMap = new Map(agents.map(agent => [agent.agentId, agent]));
    const rootNodes: AgentHierarchyNode[] = [];

    // Filter agents based on criteria
    const filteredAgents = agents.filter(agent => {
      if (filterByLevel && !filterByLevel.includes(agent.level)) return false;
      if (filterByState && !filterByState.includes(agent.state)) return false;
      if (searchTerm && !agent.agentId.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !agent.type.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !agent.currentTask?.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      return true;
    });

    // Find root nodes (agents without parents or with non-existent parents)
    filteredAgents.forEach(agent => {
      if (!agent.parentAgentId || !agentMap.has(agent.parentAgentId)) {
        rootNodes.push(agent);
      }
    });

    // Build tree structure
    const buildTree = (node: AgentHierarchyNode): AgentHierarchyNode => {
      const children = filteredAgents.filter(agent => agent.parentAgentId === node.agentId);
      return {
        ...node,
        childAgentIds: children.map(child => child.agentId)
      };
    };

    return rootNodes.map(buildTree);
  }, [agents, filterByLevel, filterByState, searchTerm]);

  // Auto-expand first few levels
  useEffect(() => {
    const autoExpand = new Set<string>();
    const expandLevels = (nodes: AgentHierarchyNode[], currentLevel: number, maxLevel: number) => {
      if (currentLevel >= maxLevel) return;

      nodes.forEach(node => {
        autoExpand.add(node.agentId);
        if (node.childAgentIds.length > 0) {
          // For demo purposes, we'll need to pass the full agent data to expand children
          // This would need the actual child data in a real implementation
        }
      });
    };

    expandLevels(hierarchyTree, 0, 2);
    setExpandedNodes(autoExpand);
  }, [hierarchyTree]);

  const handleNodeClick = useCallback((node: AgentHierarchyNode) => {
    setSelectedNodeId(node.agentId);
    onAgentSelect?.(node.agentId);
  }, [onAgentSelect]);

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
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
    const allNodeIds = new Set(agents.map(agent => agent.agentId));
    setExpandedNodes(allNodeIds);
  }, [agents]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Agent Hierarchy</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={expandAll}
              className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100 transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search agents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span>Active</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span>Paused</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span>Error</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
            <span>Terminated</span>
          </div>
        </div>
      </div>

      {/* Tree Content */}
      <div
        className="overflow-auto"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        {hierarchyTree.length > 0 ? (
          <div className="p-2">
            {hierarchyTree.map(node => (
              <TreeNode
                key={node.agentId}
                node={node}
                level={0}
                onNodeClick={handleNodeClick}
                selectedNodeId={selectedNodeId}
                expandedNodes={expandedNodes}
                onToggleExpand={handleToggleExpand}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No agents found</p>
            <p className="text-xs text-gray-400 mt-1">
              {searchTerm ? 'Try adjusting your search filters' : 'Agents will appear here when spawned'}
            </p>
          </div>
        )}
      </div>

      {/* Footer with Stats */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Total Agents: {agents.length}</span>
          <span>Active: {agents.filter(a => a.state === 'active').length}</span>
          <span>Max Depth: {Math.max(...agents.map(a => a.level), 0)}</span>
        </div>
      </div>
    </div>
  );
};

export default AgentHierarchyTree;