/**
 * FleetOverviewContainer
 * Wrapper for FleetOverview from web-components with Zustand store integration
 */

import React from 'react';
import { FleetOverview } from '@components';
import { useAgentStore } from '../../../shared/stores/agentStore';
import { useMetricsStore } from '../../../shared/stores/metricsStore';
import { useWebSocket } from '../../../shared/hooks/useWebSocket';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface FleetOverviewContainerProps {
  detailed?: boolean;
  showAgentList?: boolean;
  className?: string;
}

export const FleetOverviewContainer: React.FC<FleetOverviewContainerProps> = ({
  detailed = true,
  showAgentList = true,
  className,
}) => {
  const { agents, loading: agentsLoading } = useAgentStore();
  const { metrics, loading: metricsLoading } = useMetricsStore();
  const { isConnected, status } = useWebSocket();

  // Subscribe to fleet events
  useWebSocketEvent('fleet:updated', (data: any) => {
    console.log('[FleetOverview] Fleet updated:', data);
  });

  // Calculate fleet statistics
  const fleetData = {
    totalAgents: agents.length,
    activeAgents: agents.filter((a) => a.status === 'active').length,
    idleAgents: agents.filter((a) => a.status === 'idle').length,
    failedAgents: agents.filter((a) => a.status === 'failed').length,
    averageConfidence: agents.reduce((sum, a) => sum + (a.metrics?.confidence || 0), 0) / agents.length || 0,
    totalTasksCompleted: agents.reduce((sum, a) => sum + (a.metrics?.tasksCompleted || 0), 0),
    systemMetrics: {
      cpuUsage: metrics.cpuUsage || 0,
      memoryUsage: metrics.memoryUsage || 0,
      networkUsage: metrics.networkUsage || 0,
    },
    connectionStatus: isConnected ? 'connected' : 'disconnected',
    agents: showAgentList ? agents.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      status: a.status,
    })) : [],
  };

  const loading = agentsLoading || metricsLoading;

  if (loading && agents.length === 0) {
    return <LoadingSpinner message="Loading fleet overview..." />;
  }

  return (
    <ErrorBoundary>
      <FleetOverview
        fleetData={fleetData}
        detailed={detailed}
        className={className}
      />
    </ErrorBoundary>
  );
};

export default FleetOverviewContainer;
