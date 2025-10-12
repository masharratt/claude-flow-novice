/**
 * Dashboard Container Components
 * Wrapper components that connect shared components with WebSocket data
 */

import React, { useMemo } from 'react';
import {
  AgentHierarchyTree,
  StatusMonitor,
  PerformanceCharts,
  EventTimeline,
  AlertsPanel,
} from '@claude-flow-novice/web-components';
import type { AgentHierarchyNode } from '@claude-flow-novice/web-components';
import type { DashboardWebSocketState } from '../../../shared/types/websocket';

interface ContainerProps {
  dashboardState: DashboardWebSocketState;
  onAgentSelect?: (agentId: string) => void;
  onRefresh?: () => void;
}

interface AgentHierarchyTreeContainerProps extends ContainerProps {
  maxHeight?: number;
}

export const AgentHierarchyTreeContainer: React.FC<AgentHierarchyTreeContainerProps> = React.memo(
  ({ dashboardState, onAgentSelect, maxHeight = 400 }) => {
    const agents = useMemo<AgentHierarchyNode[]>(
      () =>
        (dashboardState.agents || []).map((agent: any) => ({
          agentId: agent.id || agent.agentId,
          name: agent.name,
          type: agent.type || 'unknown',
          state: agent.status || agent.state || 'idle',
          level: agent.level || 0,
          parentAgentId: agent.parentId || agent.parentAgentId,
          childAgentIds: agent.childIds || agent.childAgentIds || [],
          currentTask: agent.currentTask || agent.activity,
          tokensUsed: agent.metrics?.tokensUsed || 0,
          confidence: agent.confidence || agent.health / 100,
          priority: agent.priority,
          metrics: agent.metrics,
        })),
      [dashboardState.agents]
    );

    return (
      <AgentHierarchyTree
        agents={agents}
        maxHeight={maxHeight}
        showMetrics={true}
        realTimeUpdates={true}
        onAgentSelect={onAgentSelect}
        searchQuery=""
      />
    );
  }
);

AgentHierarchyTreeContainer.displayName = 'AgentHierarchyTreeContainer';

export const StatusMonitorContainer: React.FC<ContainerProps> = React.memo(
  ({ dashboardState, onAgentSelect, onRefresh }) => {
    const statusItems = useMemo(
      () =>
        (dashboardState.agents || []).map((agent: any) => ({
          id: agent.id || agent.agentId,
          name: agent.name,
          status: agent.status || agent.state || 'idle',
          health: agent.health || (agent.confidence || 0) * 100,
          progress: agent.progress || 0,
          activity: agent.currentTask || agent.activity,
          lastActivity: new Date(agent.lastActivity || Date.now()),
          metrics: agent.metrics,
          resources: agent.resources,
          errors: agent.errors || [],
          connectionStatus: agent.connectionStatus || 'connected',
        })),
      [dashboardState.agents]
    );

    return (
      <StatusMonitor
        items={statusItems}
        onItemSelect={onAgentSelect}
        onRefresh={onRefresh}
        autoRefresh={false}
        showSummary={true}
        showFilters={true}
        maxCardsPerRow={2}
        compact={true}
      />
    );
  }
);

StatusMonitorContainer.displayName = 'StatusMonitorContainer';

interface PerformanceChartsContainerProps extends ContainerProps {
  timeRange?: '1h' | '6h' | '24h' | '7d';
}

export const PerformanceChartsContainer: React.FC<PerformanceChartsContainerProps> = React.memo(
  ({ dashboardState, timeRange = '1h' }) => {
    const systemMetrics = useMemo(() => {
      if (!dashboardState.metrics) return [];

      return [
        {
          timestamp: Date.now(),
          cpu: dashboardState.resourceUsage?.cpuUsage || 0,
          memory: dashboardState.resourceUsage?.memoryUsage || 0,
          network: dashboardState.resourceUsage?.networkLatency || 0,
          activeAgents: (dashboardState.agents || []).filter((a: any) => a.status === 'active').length,
        },
      ];
    }, [dashboardState.metrics, dashboardState.resourceUsage, dashboardState.agents]);

    const agentData = useMemo(
      () =>
        (dashboardState.agents || []).map((agent: any) => ({
          name: agent.name,
          successRate: agent.metrics?.successRate || 0,
          confidence: (agent.confidence || agent.health / 100 || 0) * 100,
        })),
      [dashboardState.agents]
    );

    return (
      <PerformanceCharts
        systemMetrics={systemMetrics}
        agentData={agentData}
        timeRange={timeRange}
        theme="light"
        realTimeUpdates={true}
        updateInterval={5000}
        showControls={true}
        height={300}
      />
    );
  }
);

PerformanceChartsContainer.displayName = 'PerformanceChartsContainer';

interface EventTimelineContainerProps extends ContainerProps {
  limit?: number;
}

export const EventTimelineContainer: React.FC<EventTimelineContainerProps> = React.memo(
  ({ dashboardState, limit = 10 }) => {
    const events = useMemo(
      () =>
        (dashboardState.events || []).slice(0, limit).map((event: any, index: number) => ({
          id: event.id || `event-${index}`,
          timestamp: new Date(event.timestamp || Date.now()),
          type: event.type || 'info',
          title: event.title || event.name || 'Event',
          description: event.description || event.message,
          agentId: event.agentId,
          agentName: event.agentName,
          severity: event.severity || 'info',
          metadata: event.metadata,
        })),
      [dashboardState.events, limit]
    );

    return (
      <EventTimeline
        events={events}
        maxHeight={400}
        showFilters={false}
        groupByAgent={false}
        realTimeUpdates={true}
      />
    );
  }
);

EventTimelineContainer.displayName = 'EventTimelineContainer';

interface AlertsPanelContainerProps extends ContainerProps {
  maxAlerts?: number;
}

export const AlertsPanelContainer: React.FC<AlertsPanelContainerProps> = React.memo(
  ({ dashboardState, maxAlerts = 5 }) => {
    const alerts = useMemo(
      () =>
        (dashboardState.alerts || []).slice(0, maxAlerts).map((alert: any, index: number) => ({
          id: alert.id || `alert-${index}`,
          timestamp: new Date(alert.timestamp || Date.now()),
          severity: alert.severity || 'info',
          title: alert.title || alert.message || 'Alert',
          message: alert.description || alert.message,
          source: alert.source || alert.agentId,
          resolved: alert.resolved || false,
          metadata: alert.metadata,
        })),
      [dashboardState.alerts, maxAlerts]
    );

    return <AlertsPanel alerts={alerts} maxAlerts={maxAlerts} showResolved={false} compact={true} />;
  }
);

AlertsPanelContainer.displayName = 'AlertsPanelContainer';
