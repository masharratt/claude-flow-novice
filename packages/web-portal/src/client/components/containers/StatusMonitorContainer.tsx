/**
 * StatusMonitorContainer
 * Wrapper for StatusMonitor from web-components with Zustand store integration
 */

import React, { useCallback } from 'react';
import { StatusMonitor } from '@components';
import { useAgentStore } from '../../../shared/stores/agentStore';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface StatusMonitorContainerProps {
  maxCardsPerRow?: 1 | 2 | 3 | 4;
  showMetrics?: boolean;
  showInterventionControls?: boolean;
  showErrorsOnly?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  filterByState?: Array<'idle' | 'active' | 'paused' | 'completed' | 'failed'>;
  className?: string;
}

export const StatusMonitorContainer: React.FC<StatusMonitorContainerProps> = ({
  maxCardsPerRow = 3,
  showMetrics = true,
  showInterventionControls = true,
  showErrorsOnly = false,
  autoRefresh = true,
  refreshInterval = 5000,
  filterByState,
  className,
}) => {
  const { agents, updateAgentStatus, loading } = useAgentStore();

  // Subscribe to agent status events
  useWebSocketEvent('agent:status:changed', (data: any) => {
    console.log('[StatusMonitor] Agent status changed:', data);
    if (data.agentId && data.status) {
      updateAgentStatus(data.agentId, data.status);
    }
  });

  // Transform agents to status record format
  const statuses = agents.reduce((acc, agent) => {
    acc[agent.id] = {
      agentId: agent.id,
      name: agent.name,
      type: agent.type,
      state: agent.status,
      health: agent.metrics?.confidence ? agent.metrics.confidence * 100 : 0,
      cpuUsage: 0,
      memoryUsage: 0,
      tokensUsed: 0,
      currentTask: undefined,
      lastHeartbeat: agent.updatedAt,
      errors: [],
    };
    return acc;
  }, {} as Record<string, any>);

  const handleAgentSelect = useCallback((agentId: string) => {
    console.log('[StatusMonitor] Agent selected:', agentId);
  }, []);

  const handleRefresh = useCallback(async (agentId?: string) => {
    console.log('[StatusMonitor] Refresh requested:', agentId);
    // Implement refresh logic
  }, []);

  const handleIntervention = useCallback(async (action: any) => {
    console.log('[StatusMonitor] Intervention:', action);
    // Implement intervention logic
  }, []);

  if (loading && agents.length === 0) {
    return <LoadingSpinner message="Loading agent statuses..." />;
  }

  return (
    <ErrorBoundary>
      <StatusMonitor
        statuses={statuses}
        onAgentSelect={handleAgentSelect}
        onRefresh={handleRefresh}
        onIntervention={handleIntervention}
        maxCardsPerRow={maxCardsPerRow}
        showMetrics={showMetrics}
        showInterventionControls={showInterventionControls}
        showErrorsOnly={showErrorsOnly}
        autoRefresh={autoRefresh}
        refreshInterval={refreshInterval}
        filterByState={filterByState}
        className={className}
      />
    </ErrorBoundary>
  );
};

export default StatusMonitorContainer;
