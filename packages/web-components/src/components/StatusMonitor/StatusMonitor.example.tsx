/**
 * StatusMonitor Component - Usage Examples
 * Demonstrates various use cases for the unified StatusMonitor component
 */

import React, { useState, useCallback } from 'react';
import { StatusMonitor } from './StatusMonitor';
import type { StatusItem } from './StatusMonitor.types';

/**
 * Example 1: Basic Agent Monitoring
 */
export const BasicAgentMonitoring: React.FC = () => {
  const [agents] = useState<StatusItem[]>([
    {
      id: 'agent-1',
      name: 'Coder Agent',
      status: 'active',
      health: 95,
      progress: 75,
      activity: 'Implementing feature X',
      lastActivity: new Date(),
      resources: { cpu: 45, memory: 60 },
      metrics: { tokensUsed: 1500, efficiency: 0.85 },
    },
    {
      id: 'agent-2',
      name: 'Reviewer Agent',
      status: 'busy',
      health: 88,
      progress: 50,
      activity: 'Reviewing pull request',
      lastActivity: new Date(Date.now() - 120000),
      resources: { cpu: 30, memory: 45 },
      metrics: { tokensUsed: 800, efficiency: 0.92 },
    },
    {
      id: 'agent-3',
      name: 'Tester Agent',
      status: 'error',
      health: 40,
      progress: 20,
      activity: 'Test suite failed',
      lastActivity: new Date(Date.now() - 300000),
      resources: { cpu: 80, memory: 90 },
      errors: [
        {
          message: 'Test timeout after 30s',
          severity: 'error',
          timestamp: new Date(Date.now() - 60000),
        },
      ],
    },
  ]);

  const handleRefresh = useCallback(() => {
    console.log('Refreshing agent statuses...');
    // Implement refresh logic
  }, []);

  const handleAgentSelect = useCallback((id: string) => {
    console.log('Selected agent:', id);
    // Implement selection logic
  }, []);

  return (
    <StatusMonitor
      items={agents}
      onRefresh={handleRefresh}
      onItemSelect={handleAgentSelect}
      showSummary
      showFilters
      maxCardsPerRow={3}
    />
  );
};

/**
 * Example 2: Fleet Dashboard with Real-time Updates
 */
export const FleetDashboardRealtime: React.FC = () => {
  const [fleetItems] = useState<StatusItem[]>([
    {
      id: 'fleet-1',
      name: 'Development Swarm',
      status: 'active',
      health: 92,
      progress: 65,
      activity: 'Building features',
      lastActivity: new Date(),
      connectionStatus: 'connected',
      resources: { cpu: 55, memory: 70 },
      metrics: { tokensUsed: 5000, efficiency: 0.78 },
    },
    {
      id: 'fleet-2',
      name: 'Testing Swarm',
      status: 'paused',
      health: 100,
      progress: 0,
      activity: 'Awaiting tests',
      lastActivity: new Date(Date.now() - 600000),
      connectionStatus: 'connected',
      resources: { cpu: 10, memory: 20 },
    },
  ]);

  return (
    <StatusMonitor
      items={fleetItems}
      enableRealTime
      websocketUrl="ws://localhost:3000/fleet-status"
      autoRefresh
      refreshInterval={5000}
      maxCardsPerRow={2}
      showSummary
    />
  );
};

/**
 * Example 3: Error Monitoring View
 */
export const ErrorMonitoringView: React.FC = () => {
  const [items] = useState<StatusItem[]>([
    {
      id: 'task-1',
      name: 'Database Migration',
      status: 'error',
      health: 30,
      progress: 75,
      activity: 'Migration failed',
      lastActivity: new Date(Date.now() - 180000),
      errors: [
        {
          message: 'Foreign key constraint violation',
          severity: 'critical',
          timestamp: new Date(Date.now() - 120000),
        },
        {
          message: 'Connection pool exhausted',
          severity: 'error',
          timestamp: new Date(Date.now() - 60000),
        },
      ],
    },
  ]);

  return (
    <StatusMonitor
      items={items}
      filter={{ errorsOnly: true }}
      maxCardsPerRow={1}
      showSummary={false}
      compact
    />
  );
};

/**
 * Example 4: Compact Grid View
 */
export const CompactGridView: React.FC = () => {
  const [items] = useState<StatusItem[]>(
    Array.from({ length: 12 }, (_, i) => ({
      id: `agent-${i + 1}`,
      name: `Agent ${i + 1}`,
      status: ['idle', 'active', 'busy', 'paused'][i % 4] as StatusItem['status'],
      health: 70 + Math.random() * 30,
      progress: Math.random() * 100,
      activity: `Task ${i + 1}`,
      lastActivity: new Date(Date.now() - Math.random() * 3600000),
      resources: {
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
      },
    }))
  );

  return (
    <StatusMonitor
      items={items}
      compact
      maxCardsPerRow={4}
      showSummary
      showFilters
      showSort
    />
  );
};

/**
 * Example 5: Custom Filtered View
 */
export const CustomFilteredView: React.FC = () => {
  const [items] = useState<StatusItem[]>([
    {
      id: '1',
      name: 'High Priority Task',
      status: 'active',
      health: 95,
      progress: 80,
      activity: 'Critical feature',
      lastActivity: new Date(),
      resources: { cpu: 60, memory: 70 },
    },
    {
      id: '2',
      name: 'Low Priority Task',
      status: 'idle',
      health: 100,
      progress: 10,
      activity: 'Background job',
      lastActivity: new Date(Date.now() - 7200000),
      resources: { cpu: 5, memory: 10 },
    },
  ]);

  return (
    <StatusMonitor
      items={items}
      filter={{
        statuses: ['active', 'busy'],
        minHealth: 80,
      }}
      sort={{
        field: 'progress',
        direction: 'desc',
      }}
      maxCardsPerRow={2}
    />
  );
};

/**
 * Example 6: Migration from AgentStatusMonitor
 */
export const MigratedFromAgentStatusMonitor: React.FC = () => {
  // Old AgentStatusMonitor used Record<string, AgentStatus>
  const legacyStatuses = {
    'agent-1': {
      state: 'active',
      progress: 75,
      memoryUsage: 1024 * 1024 * 512, // 512MB
      cpuUsage: 45,
      tokensUsed: 1500,
      tokenUsageRate: 2.5,
      activity: 'Processing',
      lastHeartbeat: new Date(),
      recentErrors: [],
      currentMessage: null,
      estimatedCompletion: null,
    },
  };

  // Convert to StatusItem format
  const items: StatusItem[] = Object.entries(legacyStatuses).map(([id, status]) => ({
    id,
    name: id,
    status: status.state as StatusItem['status'],
    health: 100 - status.cpuUsage,
    progress: status.progress,
    activity: status.activity,
    lastActivity: status.lastHeartbeat,
    lastHeartbeat: status.lastHeartbeat,
    estimatedCompletion: status.estimatedCompletion || undefined,
    resources: {
      cpu: status.cpuUsage,
      memory: 0,
      memoryUsage: status.memoryUsage,
    },
    metrics: {
      tokensUsed: status.tokensUsed,
      tokenUsageRate: status.tokenUsageRate,
    },
    errors: status.recentErrors.map((err: any) => ({
      message: err.error,
      severity: err.severity,
      timestamp: err.timestamp,
    })),
  }));

  return <StatusMonitor items={items} showSummary maxCardsPerRow={3} />;
};

export default {
  BasicAgentMonitoring,
  FleetDashboardRealtime,
  ErrorMonitoringView,
  CompactGridView,
  CustomFilteredView,
  MigratedFromAgentStatusMonitor,
};
