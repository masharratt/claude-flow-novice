/**
 * CFNLoopDashboardContainer
 * Wrapper for CFNLoopDashboard from web-components with Zustand store integration
 */

import React, { useCallback } from 'react';
import { CFNLoopDashboard } from '@components';
import { useAgentStore } from '../../../shared/stores/agentStore';
import { useMetricsStore } from '../../../shared/stores/metricsStore';
import { useEventsStore } from '../../../shared/stores/eventsStore';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface CFNLoopDashboardContainerProps {
  phaseId?: string;
  showMetrics?: boolean;
  showTimeline?: boolean;
  showValidation?: boolean;
  realTimeUpdates?: boolean;
  className?: string;
}

export const CFNLoopDashboardContainer: React.FC<CFNLoopDashboardContainerProps> = ({
  phaseId,
  showMetrics = true,
  showTimeline = true,
  showValidation = true,
  realTimeUpdates = true,
  className,
}) => {
  const { agents, loading: agentsLoading } = useAgentStore();
  const { metrics, loading: metricsLoading } = useMetricsStore();
  const { events } = useEventsStore();

  // Subscribe to CFN Loop events
  useWebSocketEvent('cfn:loop:updated', (data: any) => {
    console.log('[CFNLoopDashboard] CFN Loop updated:', data);
  });

  useWebSocketEvent('cfn:phase:changed', (data: any) => {
    console.log('[CFNLoopDashboard] Phase changed:', data);
  });

  useWebSocketEvent('cfn:validation:completed', (data: any) => {
    console.log('[CFNLoopDashboard] Validation completed:', data);
  });

  // Build CFN Loop data structure
  const cfnLoopData = {
    phaseId: phaseId || 'phase-1',
    currentLoop: 3,
    loops: {
      loop3: {
        status: 'in_progress',
        agents: agents.map((a) => ({
          agentId: a.id,
          name: a.name,
          confidence: a.metrics?.confidence || 0,
          status: a.status,
        })),
        averageConfidence: agents.reduce((sum, a) => sum + (a.metrics?.confidence || 0), 0) / agents.length || 0,
      },
      loop2: {
        status: 'pending',
        validators: [],
        consensus: 0,
      },
      loop4: {
        status: 'pending',
        decision: null,
      },
    },
    metrics: {
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.status === 'active').length,
      completedTasks: agents.reduce((sum, a) => sum + (a.metrics?.tasksCompleted || 0), 0),
    },
    timeline: events.slice(0, 20),
  };

  const handleLoopAction = useCallback((action: string, data: any) => {
    console.log('[CFNLoopDashboard] Loop action:', action, data);
    // Implement loop actions (retry, proceed, etc.)
  }, []);

  const loading = agentsLoading || metricsLoading;

  if (loading && agents.length === 0) {
    return <LoadingSpinner message="Loading CFN Loop dashboard..." />;
  }

  return (
    <ErrorBoundary>
      <CFNLoopDashboard
        data={cfnLoopData}
        onLoopAction={handleLoopAction}
        showMetrics={showMetrics}
        showTimeline={showTimeline}
        showValidation={showValidation}
        realTimeUpdates={realTimeUpdates}
        className={className}
      />
    </ErrorBoundary>
  );
};

export default CFNLoopDashboardContainer;
