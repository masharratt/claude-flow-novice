/**
 * V1 Agent Hierarchy Tree Component
 *
 * React component for visualizing V1 agent hierarchy relationships
 * between QueenAgent and worker agents, or mesh coordinator topology.
 *
 * @module web/dashboard/components/V1AgentHierarchyTree
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  IV1TransparencySystem,
  V1AgentInfo,
  V1CoordinatorInfo
} from '../../../coordination/v1-transparency/interfaces/v1-transparency-system.js';

interface V1AgentHierarchyTreeProps {
  transparencySystem: IV1TransparencySystem;
  className?: string;
}

interface TreeNode {
  id: string;
  name: string;
  type: 'coordinator' | 'agent';
  status: string;
  health: number;
  children: TreeNode[];
  expanded: boolean;
  level: number;
}

/**
 * V1 Agent Hierarchy Tree Component
 */
export const V1AgentHierarchyTree: React.FC<V1AgentHierarchyTreeProps> = ({
  transparencySystem,
  className = '',
}) => {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build tree data from V1 system
  const buildTreeData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [coordinators, agents] = await Promise.all([
        transparencySystem.getAllCoordinators(),
        transparencySystem.getAllAgents(),
      ]);

      const tree: TreeNode[] = [];

      // Group agents by coordinator
      const agentsByCoordinator = new Map<string, V1AgentInfo[]>();
      agents.forEach(agent => {
        if (!agentsByCoordinator.has(agent.coordinatorId)) {
          agentsByCoordinator.set(agent.coordinatorId, []);
        }
        agentsByCoordinator.get(agent.coordinatorId)!.push(agent);
      });

      // Build tree nodes for each coordinator
      coordinators.forEach(coordinator => {
        const coordinatorNode: TreeNode = {
          id: coordinator.coordinatorId,
          name: `${coordinator.coordinatorType} (${coordinator.coordinatorId})`,
          type: 'coordinator',
          status: coordinator.status,
          health: 100, // Coordinators are always healthy unless offline
          children: [],
          expanded: expandedNodes.has(coordinator.coordinatorId),
          level: 0,
        };

        // Add agents as children
        const coordinatorAgents = agentsByCoordinator.get(coordinator.coordinatorId) || [];
        coordinatorAgents.forEach(agent => {
          const agentNode: TreeNode = {
            id: agent.agentId,
            name: `${agent.agentType} (${agent.agentId})`,
            type: 'agent',
            status: agent.status,
            health: agent.health.successRate,
            children: [], // V1 agents don't have children
            expanded: expandedNodes.has(agent.agentId),
            level: 1,
          };

          coordinatorNode.children.push(agentNode);
        });

        // Sort children by status and health
        coordinatorNode.children.sort((a, b) => {
          // Active agents first
          const statusOrder = { 'active': 0, 'busy': 1, 'ready': 2, 'working': 3, 'idle': 4, 'completed': 5, 'failed': 6, 'degraded': 7, 'offline': 8 };
          const aStatusOrder = statusOrder[a.status as keyof typeof statusOrder] || 9;
          const bStatusOrder = statusOrder[b.status as keyof typeof statusOrder] || 9;

          if (aStatusOrder !== bStatusOrder) {
            return aStatusOrder - bStatusOrder;
          }

          // Then by health (higher first)
          return b.health - a.health;
        });

        tree.push(coordinatorNode);
      });

      setTreeData(tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [transparencySystem, expandedNodes]);

  // Initialize tree data
  useEffect(() => {
    buildTreeData();

    // Set up refresh interval
    const interval = setInterval(buildTreeData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [buildTreeData]);

  // Toggle node expansion
  const toggleNodeExpansion = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  // Handle node selection
  const handleNodeClick = useCallback((node: TreeNode) => {
    setSelectedNode(node);
  }, []);

  // Get status color
  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      active: 'text-green-600',
      busy: 'text-blue-600',
      ready: 'text-green-500',
      working: 'text-blue-500',
      idle: 'text-gray-500',
      completed: 'text-green-600',
      failed: 'text-red-600',
      degraded: 'text-yellow-600',
      offline: 'text-red-500',
      initializing: 'text-yellow-500',
    };
    return colors[status] || 'text-gray-500';
  };

  // Get health color
  const getHealthColor = (health: number): string => {
    if (health >= 90) return 'text-green-600';
    if (health >= 75) return 'text-green-500';
    if (health >= 60) return 'text-yellow-600';
    if (health >= 40) return 'text-orange-500';
    return 'text-red-600';
  };

  // Get status icon
  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      active: '🟢',
      busy: '🔵',
      ready: '✅',
      working: '⚙️',
      idle: '⏸️',
      completed: '✅',
      failed: '❌',
      degraded: '⚠️',
      offline: '🔴',
      initializing: '🔄',
    };
    return icons[status] || '❓';
  };

  // Render tree node recursively
  const renderTreeNode = (node: TreeNode, depth: number = 0): JSX.Element => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode?.id === node.id;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center py-2 px-3 rounded-lg cursor-pointer transition-colors ${
            isSelected
              ? 'bg-blue-100 border border-blue-300'
              : 'hover:bg-gray-100'
          }`}
          style={{ marginLeft: `${depth * 24}px` }}
          onClick={() => handleNodeClick(node)}
        >
          {/* Expand/Collapse Icon */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleNodeExpansion(node.id);
              }}
              className="mr-2 p-1 hover:bg-gray-200 rounded"
            >
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Status Icon */}
          <span className="mr-2 text-lg">{getStatusIcon(node.status)}</span>

          {/* Node Info */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {node.name}
            </div>
            <div className="text-xs text-gray-500">
              {node.type === 'coordinator' ? 'Coordinator' : 'Agent'} • {node.status}
            </div>
          </div>

          {/* Health Indicator */}
          <div className="ml-4 text-right">
            <div className={`text-sm font-medium ${getHealthColor(node.health)}`}>
              {node.health.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">Health</div>
          </div>
        </div>

        {/* Render children */}
        {hasChildren && isExpanded && (
          <div className="ml-4 mt-1 border-l-2 border-gray-200">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">Loading hierarchy...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error Loading Hierarchy</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`v1-agent-hierarchy-tree ${className}`}>
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">V1 Agent Hierarchy</h3>
            <p className="text-sm text-gray-500">
              Visualization of QueenAgent and MeshCoordinator relationships
            </p>
          </div>
          <button
            onClick={buildTreeData}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-6 text-sm">
          <div className="flex items-center">
            <span className="mr-2">Status:</span>
            <span className="mr-3">🟢 Active</span>
            <span className="mr-3">⚙️ Working</span>
            <span className="mr-3">⏸️ Idle</span>
            <span className="mr-3">❌ Failed</span>
            <span className="mr-3">⚠️ Degraded</span>
          </div>
          <div className="flex items-center">
            <span className="mr-2">Health:</span>
            <span className="text-green-600 mr-3">Excellent (90%+)</span>
            <span className="text-green-500 mr-3">Good (75-89%)</span>
            <span className="text-yellow-600 mr-3">Fair (60-74%)</span>
            <span className="text-red-600">Poor (&lt;60%)</span>
          </div>
        </div>
      </div>

      {/* Tree */}
      <div className="space-y-1">
        {treeData.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No coordinators or agents found
          </div>
        ) : (
          treeData.map(node => renderTreeNode(node))
        )}
      </div>

      {/* Selected Node Details */}
      {selectedNode && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="font-medium text-gray-900 mb-2">Selected: {selectedNode.name}</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Type:</span>
              <span className="ml-2 font-medium">
                {selectedNode.type === 'coordinator' ? 'Coordinator' : 'Agent'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <span className={`ml-2 font-medium ${getStatusColor(selectedNode.status)}`}>
                {selectedNode.status}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Health:</span>
              <span className={`ml-2 font-medium ${getHealthColor(selectedNode.health)}`}>
                {selectedNode.health.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-gray-500">Level:</span>
              <span className="ml-2 font-medium">
                {selectedNode.level === 0 ? 'Coordinator' : `Level ${selectedNode.level}`}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Children:</span>
              <span className="ml-2 font-medium">
                {selectedNode.children.length}
              </span>
            </div>
            <div>
              <span className="text-gray-500">ID:</span>
              <span className="ml-2 font-medium text-gray-600">
                {selectedNode.id}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-medium text-gray-900 mb-2">Hierarchy Statistics</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Total Coordinators:</span>
            <span className="ml-2 font-medium">
              {treeData.length}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Total Agents:</span>
            <span className="ml-2 font-medium">
              {treeData.reduce((sum, node) => sum + node.children.length, 0)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Active Nodes:</span>
            <span className="ml-2 font-medium text-green-600">
              {
                treeData.filter(node => node.status === 'active').length +
                treeData.reduce((sum, node) =>
                  sum + node.children.filter(child =>
                    child.status === 'active' || child.status === 'busy' || child.status === 'working'
                  ).length, 0)
              }
            </span>
          </div>
          <div>
            <span className="text-gray-500">Average Health:</span>
            <span className="ml-2 font-medium">
              {
                treeData.length > 0
                  ? (
                    (treeData.reduce((sum, node) =>
                      sum + node.health + node.children.reduce((childSum, child) => childSum + child.health, 0)
                    , 0) /
                    (treeData.reduce((sum, node) => sum + 1 + node.children.length, 0))
                    ).toFixed(1)
                  ) + '%'
                  ) : 'N/A'
              }
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};