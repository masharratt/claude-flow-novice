/**
 * AgentHierarchyTreeContainer
 * Wrapper for AgentHierarchyTree from web-components with Zustand store integration
 */

import React, { useCallback } from 'react';
import { AgentHierarchyTree, type AgentHierarchyNode } from '@components';
import { useAgentStore } from '../../../shared/stores/agentStore';
import { useWebSocket } from '../../../shared/hooks/useWebSocket';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface AgentHierarchyTreeContainerProps {
  maxHeight?: number;
  showMetrics?: boolean;
  filterByLevel?: number[];
  filterByState?: ('idle' | 'active' | 'paused' | 'completed' | 'failed')[];
  realTimeUpdates?: boolean;
  className?: string;
}

export const AgentHierarchyTreeContainer: React.FC<AgentHierarchyTreeContainerProps> = ({
  maxHeight = 600,
  showMetrics = true,
  filterByLevel,
  filterByState,
  realTimeUpdates = true,
  className,
}) => {
  const { agents, selectAgent, loading, error, setAgents } = useAgentStore();
  const { isConnected } = useWebSocket();

  // Subscribe to agent lifecycle events
  useWebSocketEvent('agent:spawned', (data: any) => {
    console.log('[AgentHierarchyTree] Agent spawned:', data);
    // Handle agent spawned event
  });

  useWebSocketEvent('agent:updated', (data: any) => {
    console.log('[AgentHierarchyTree] Agent updated:', data);
    // Handle agent updated event
  });

  useWebSocketEvent('agent:terminated', (data: any) => {
    console.log('[AgentHierarchyTree] Agent terminated:', data);
    // Handle agent terminated event
  });

  // Transform Zustand agents to AgentHierarchyNode format
  const transformedAgents: AgentHierarchyNode[] = agents.map((agent) => ({
    agentId: agent.id,
    name: agent.name,
    type: agent.type,
    state: agent.status,
    level: 0, // Will be calculated by hierarchy builder
    parentAgentId: agent.parentId,
    currentTask: undefined,
    confidence: agent.metrics?.confidence,
    tokensUsed: 0,
    metrics: {
      totalExecutionTimeMs: 0,
      tokensConsumed: 0,
      successRate: 0,
      tasksCompleted: agent.metrics?.tasksCompleted || 0,
    },
  }));

  const handleAgentSelect = useCallback(
    (agentId: string) => {
      selectAgent(agentId);
    },
    [selectAgent]
  );

  const handleNodeClick = useCallback((node: AgentHierarchyNode) => {
    console.log('[AgentHierarchyTree] Node clicked:', node);
  }, []);

  if (error) {
    return (
      <ErrorBoundary>
        <div style={{ padding: 16, color: 'red' }}>
          Error loading agents: {error}
        </div>
      </ErrorBoundary>
    );
  }

  if (loading && agents.length === 0) {
    return <LoadingSpinner message="Loading agent hierarchy..." />;
  }

  return (
    <ErrorBoundary>
      <AgentHierarchyTree
        agents={transformedAgents}
        onAgentSelect={handleAgentSelect}
        onNodeClick={handleNodeClick}
        maxHeight={maxHeight}
        showMetrics={showMetrics}
        filterByLevel={filterByLevel}
        filterByState={filterByState}
        realTimeUpdates={realTimeUpdates && isConnected}
        className={className}
      />
    </ErrorBoundary>
  );
};

export default AgentHierarchyTreeContainer;
