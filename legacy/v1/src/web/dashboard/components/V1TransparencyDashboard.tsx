/**
 * V1 Transparency Dashboard Component
 *
 * React component for displaying V1 coordination system transparency.
 * Provides real-time monitoring of QueenAgent and MeshCoordinator systems.
 *
 * @module web/dashboard/components/V1TransparencyDashboard
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  IV1TransparencySystem,
  V1TransparencyMetrics,
  V1AgentInfo,
  V1TaskInfo,
  V1CoordinatorInfo,
  V1TransparencyEvent,
  V1TransparencyEventListener
} from '../../../coordination/v1-transparency/interfaces/v1-transparency-system.js';

interface V1TransparencyDashboardProps {
  transparencySystem: IV1TransparencySystem;
  className?: string;
}

interface DashboardState {
  metrics: V1TransparencyMetrics | null;
  agents: V1AgentInfo[];
  tasks: V1TaskInfo[];
  coordinators: V1CoordinatorInfo[];
  recentEvents: V1TransparencyEvent[];
  selectedAgent: V1AgentInfo | null;
  selectedCoordinator: V1CoordinatorInfo | null;
  activeTab: 'overview' | 'agents' | 'tasks' | 'coordinators' | 'events';
  loading: boolean;
  error: string | null;
  lastUpdate: Date;
}

/**
 * V1 Transparency Dashboard Component
 */
export const V1TransparencyDashboard: React.FC<V1TransparencyDashboardProps> = ({
  transparencySystem,
  className = '',
}) => {
  const [state, setState] = useState<DashboardState>({
    metrics: null,
    agents: [],
    tasks: [],
    coordinators: [],
    recentEvents: [],
    selectedAgent: null,
    selectedCoordinator: null,
    activeTab: 'overview',
    loading: true,
    error: null,
    lastUpdate: new Date(),
  });

  const [refreshInterval, setRefreshInterval] = useState(5000);

  // Data fetching functions
  const fetchData = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const [
        metrics,
        agents,
        tasks,
        coordinators,
        recentEvents,
      ] = await Promise.all([
        transparencySystem.getTransparencyMetrics(),
        transparencySystem.getAllAgents(),
        transparencySystem.getAllTasks(),
        transparencySystem.getAllCoordinators(),
        transparencySystem.getRecentEvents(50),
      ]);

      setState(prev => ({
        ...prev,
        metrics,
        agents,
        tasks,
        coordinators,
        recentEvents,
        loading: false,
        lastUpdate: new Date(),
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false,
      }));
    }
  }, [transparencySystem]);

  // Initialize dashboard
  useEffect(() => {
    fetchData();

    // Set up event listener for real-time updates
    const eventListener: V1TransparencyEventListener = {
      onMetricsUpdate: (metrics) => {
        setState(prev => ({ ...prev, metrics }));
      },
      onTransparencyEvent: (event) => {
        setState(prev => ({
          ...prev,
          recentEvents: [event, ...prev.recentEvents.slice(0, 49)],
        }));
      },
    };

    transparencySystem.registerEventListener(eventListener);

    return () => {
      transparencySystem.unregisterEventListener(eventListener);
    };
  }, [transparencySystem, fetchData]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  // Event handlers
  const handleTabChange = (tab: DashboardState['activeTab']) => {
    setState(prev => ({ ...prev, activeTab: tab }));
  };

  const handleAgentSelect = (agent: V1AgentInfo) => {
    setState(prev => ({ ...prev, selectedAgent: agent, selectedCoordinator: null }));
  };

  const handleCoordinatorSelect = (coordinator: V1CoordinatorInfo) => {
    setState(prev => ({ ...prev, selectedCoordinator: coordinator, selectedAgent: null }));
  };

  const handleRefresh = () => {
    fetchData();
  };

  // Format helpers
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat().format(num);
  };

  const formatPercentage = (num: number): string => {
    return `${num.toFixed(1)}%`;
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      idle: 'text-gray-600',
      busy: 'text-green-600',
      ready: 'text-blue-600',
      working: 'text-blue-600',
      completed: 'text-green-600',
      failed: 'text-red-600',
      degraded: 'text-yellow-600',
      offline: 'text-red-600',
      active: 'text-green-600',
      pending: 'text-yellow-600',
    };
    return colors[status] || 'text-gray-600';
  };

  const getSeverityColor = (severity: string): string => {
    const colors: Record<string, string> = {
      info: 'text-blue-600',
      warning: 'text-yellow-600',
      error: 'text-red-600',
      critical: 'text-red-800',
    };
    return colors[severity] || 'text-gray-600';
  };

  if (state.error) {
    return (
      <div className={`p-6 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error Loading Dashboard</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{state.error}</p>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={handleRefresh}
            className="bg-red-100 hover:bg-red-200 text-red-800 font-medium py-2 px-4 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`v1-transparency-dashboard bg-white shadow-lg rounded-lg ${className}`}>
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">V1 Coordination Transparency</h1>
            <p className="text-sm text-gray-500">
              Real-time monitoring of V1 QueenAgent and MeshCoordinator systems
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Last updated: {state.lastUpdate.toLocaleTimeString()}
            </div>
            <button
              onClick={handleRefresh}
              disabled={state.loading}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded text-sm font-medium"
            >
              {state.loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {(['overview', 'agents', 'tasks', 'coordinators', 'events'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                state.activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {state.loading && !state.metrics ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-600">Loading dashboard...</span>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {state.activeTab === 'overview' && state.metrics && (
              <div className="space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white p-6 border border-gray-200 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Total Agents</dt>
                          <dd className="text-lg font-medium text-gray-900">
                            {formatNumber(state.metrics.agents.total)}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 border border-gray-200 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Active Tasks</dt>
                          <dd className="text-lg font-medium text-gray-900">
                            {formatNumber(state.metrics.tasks.active)}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 border border-gray-200 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-yellow-500 rounded-md p-3">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Task Throughput</dt>
                          <dd className="text-lg font-medium text-gray-900">
                            {formatNumber(state.metrics.performance.taskThroughput)}/hr
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 border border-gray-200 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-purple-500 rounded-md p-3">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Coordinators</dt>
                          <dd className="text-lg font-medium text-gray-900">
                            {formatNumber(state.metrics.coordinators.total)}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Performance Chart */}
                <div className="bg-white p-6 border border-gray-200 rounded-lg">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">System Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-gray-500">Agent Utilization</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {formatPercentage(state.metrics.agents.utilizationRate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Task Success Rate</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {formatPercentage(state.metrics.tasks.successRate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Avg Response Time</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {formatDuration(state.metrics.performance.averageResponseTime)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Events */}
                <div className="bg-white p-6 border border-gray-200 rounded-lg">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Events</h3>
                  <div className="space-y-2">
                    {state.recentEvents.slice(0, 5).map((event) => (
                      <div key={event.eventId} className="flex items-center justify-between py-2">
                        <div className="flex items-center space-x-3">
                          <div className={`text-sm ${getSeverityColor(event.severity)}`}>
                            {event.eventType}
                          </div>
                          <div className="text-sm text-gray-500">
                            {event.eventData.agentId || event.eventData.coordinatorId || 'System'}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400">
                          {event.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Agents Tab */}
            {state.activeTab === 'agents' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Agents ({state.agents.length})</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">Auto-refresh:</span>
                    <select
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(Number(e.target.value))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                      <option value={1000}>1s</option>
                      <option value={5000}>5s</option>
                      <option value={10000}>10s</option>
                      <option value={30000}>30s</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Agent ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Health
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tasks
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Coordinator
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {state.agents.map((agent) => (
                        <tr
                          key={agent.agentId}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => handleAgentSelect(agent)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {agent.agentId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {agent.agentType}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(agent.status)}`}>
                              {agent.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatPercentage(agent.health.successRate)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {agent.currentTasks.length} active
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {agent.coordinatorId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Agent Details */}
                {state.selectedAgent && (
                  <div className="bg-white p-6 border border-gray-200 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Agent Details: {state.selectedAgent.agentId}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Capabilities</h4>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div>Type: {state.selectedAgent.capabilities.type}</div>
                          <div>Skills: {state.selectedAgent.capabilities.skills.join(', ')}</div>
                          <div>Max Tasks: {state.selectedAgent.capabilities.maxConcurrentTasks}</div>
                          <div>Priority: {state.selectedAgent.capabilities.priority}</div>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Performance</h4>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div>Success Rate: {formatPercentage(state.selectedAgent.health.successRate)}</div>
                          <div>Avg Response: {formatDuration(state.selectedAgent.health.averageResponseTime)}</div>
                          <div>Errors: {state.selectedAgent.health.errorCount}</div>
                          <div>Consecutive Failures: {state.selectedAgent.health.consecutiveFailures}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tasks Tab */}
            {state.activeTab === 'tasks' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900">Tasks ({state.tasks.length})</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.entries(state.metrics.tasks.byType).map(([type, count]) => (
                    <div key={type} className="bg-white p-4 border border-gray-200 rounded-lg">
                      <div className="text-sm text-gray-500">{type}</div>
                      <div className="text-xl font-bold text-gray-900">{count}</div>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Task ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Priority
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Agents
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Duration
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {state.tasks.map((task) => (
                        <tr key={task.taskId} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {task.taskId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {task.taskType}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(task.status)}`}>
                              {task.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {task.priority}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {task.assignedAgents.join(', ')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {task.timing.startedAt && task.timing.completedAt
                              ? formatDuration(task.timing.completedAt.getTime() - task.timing.startedAt.getTime())
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Coordinators Tab */}
            {state.activeTab === 'coordinators' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900">Coordinators ({state.coordinators.length})</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {state.coordinators.map((coordinator) => (
                    <div
                      key={coordinator.coordinatorId}
                      className="bg-white p-6 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
                      onClick={() => handleCoordinatorSelect(coordinator)}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-medium text-gray-900">
                          {coordinator.coordinatorId}
                        </h4>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(coordinator.status)}`}>
                          {coordinator.status}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Type:</span>
                          <span className="font-medium">{coordinator.coordinatorType}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Topology:</span>
                          <span className="font-medium">{coordinator.topology}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Agents:</span>
                          <span className="font-medium">
                            {coordinator.config.currentAgents}/{coordinator.config.maxAgents}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tasks:</span>
                          <span className="font-medium">{coordinator.tasks.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Throughput:</span>
                          <span className="font-medium">
                            {coordinator.performance.taskThroughput} tasks/hr
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Coordinator Details */}
                {state.selectedCoordinator && (
                  <div className="bg-white p-6 border border-gray-200 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Coordinator Details: {state.selectedCoordinator.coordinatorId}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Configuration</h4>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div>Type: {state.selectedCoordinator.coordinatorType}</div>
                          <div>Topology: {state.selectedCoordinator.topology}</div>
                          <div>Strategy: {state.selectedCoordinator.config.strategy}</div>
                          <div>Consensus: {state.selectedCoordinator.config.enableConsensus ? 'Enabled' : 'Disabled'}</div>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Performance</h4>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div>Task Throughput: {state.selectedCoordinator.performance.taskThroughput} tasks/hr</div>
                          <div>Agent Utilization: {formatPercentage(state.selectedCoordinator.performance.agentUtilization)}</div>
                          <div>Avg Response Time: {formatDuration(state.selectedCoordinator.performance.averageResponseTime)}</div>
                          <div>Error Rate: {formatPercentage(state.selectedCoordinator.performance.errorRate)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Events Tab */}
            {state.activeTab === 'events' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900">Recent Events ({state.recentEvents.length})</h3>

                <div className="space-y-2">
                  {state.recentEvents.map((event) => (
                    <div
                      key={event.eventId}
                      className="bg-white p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSeverityColor(event.severity)}`}>
                            {event.eventType}
                          </span>
                          <span className="text-sm text-gray-500">
                            {event.eventData.agentId || event.eventData.coordinatorId || 'System'}
                          </span>
                          <span className="text-sm text-gray-400">
                            {event.category}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {event.timestamp.toLocaleString()}
                        </div>
                      </div>
                      {event.eventData.reason && (
                        <div className="mt-2 text-sm text-gray-600">
                          Reason: {event.eventData.reason}
                        </div>
                      )}
                      {event.eventData.error && (
                        <div className="mt-2 text-sm text-red-600">
                          Error: {event.eventData.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};