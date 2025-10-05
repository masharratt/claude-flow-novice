/**
 * Main Dashboard Component
 * Integrates all dashboard components into a unified transparency dashboard
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Users,
  BarChart3,
  Clock,
  Wifi,
  WifiOff,
  Settings,
  RefreshCw,
  AlertTriangle,
  Grid3X3,
  List,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { AgentHierarchyTree } from './components/AgentHierarchyTree';
import { AgentStatusMonitor } from './components/AgentStatusMonitor';
import { PerformanceMetricsChart } from './components/PerformanceMetricsChart';
import { EventTimeline } from './components/EventTimeline';
import { ResourceGauges } from './components/ResourceGauges';
import { useDashboardWebSocket } from './hooks/useWebSocket';
import {
  DashboardState,
  DashboardConfig,
  AgentHierarchyNode,
  AgentStatus,
  TransparencyMetrics,
  AgentLifecycleEvent,
  ResourceUsage,
  PerformanceAlert
} from './types';

interface DashboardProps {
  apiUrl?: string;
  wsUrl?: string;
  config?: Partial<DashboardConfig>;
  className?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({
  apiUrl = '/api',
  wsUrl = `ws://${window.location.host}`,
  config = {},
  className = ''
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Default configuration
  const dashboardConfig: DashboardConfig = {
    refreshInterval: 5000,
    maxEvents: 1000,
    enableAnimations: true,
    theme: 'light',
    autoRefresh: true,
    ...config
  };

  // Mock initial data - in real implementation, this would come from API
  const initialData: Partial<DashboardState> = {
    agents: [],
    statuses: {},
    events: [],
    metrics: null,
    alerts: [],
    resourceUsage: {
      memoryUsage: 0,
      cpuUsage: 0,
      networkLatency: 0,
      diskUsage: 0
    },
    filters: {},
    loading: true,
    error: null,
    lastUpdated: null,
    connected: false
  };

  const {
    socket,
    isConnected,
    error: wsError,
    dashboardState,
    refreshData,
    updateFilters
  } = useDashboardWebSocket(initialData, {
    url: wsUrl,
    autoConnect: true,
    reconnectAttempts: 5,
    reconnectDelay: 1000
  });

  // Load initial data from API
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // In a real implementation, these would be actual API calls
        // const response = await fetch(`${apiUrl}/dashboard/initial`);
        // const data = await response.json();

        // For now, we'll use mock data
        const mockData = await loadMockData();

        // Update dashboard state with initial data
        // setDashboardState(prev => ({ ...prev, ...mockData, loading: false }));
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, [apiUrl]);

  // Mock data loader - replace with actual API calls
  const loadMockData = async () => {
    return new Promise<{
      agents: AgentHierarchyNode[];
      statuses: Record<string, AgentStatus>;
      events: AgentLifecycleEvent[];
      metrics: TransparencyMetrics;
      resourceUsage: ResourceUsage;
    }>((resolve) => {
      setTimeout(() => {
        resolve({
          agents: [],
          statuses: {},
          events: [],
          metrics: {
            totalAgents: 0,
            agentsByLevel: {},
            agentsByState: {},
            agentsByType: {},
            totalTokensConsumed: 0,
            totalTokensSaved: 0,
            averageExecutionTimeMs: 0,
            failureRate: 0,
            averagePauseResumeLatencyMs: 0,
            hierarchyDepth: 0,
            dependencyResolutionRate: 0,
            eventStreamStats: {
              totalEvents: 0,
              eventsPerSecond: 0,
              eventTypes: {}
            }
          },
          resourceUsage: {
            memoryUsage: 0,
            cpuUsage: 0,
            networkLatency: 0,
            diskUsage: 0
          }
        });
      }, 1000);
    });
  };

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const agents = Object.values(dashboardState.statuses);
    const activeAgents = agents.filter(s => s.state === 'active').length;
    const errorAgents = agents.filter(s => s.state === 'error').length;
    const totalTokens = agents.reduce((sum, s) => sum + s.tokensUsed, 0);
    const criticalAlerts = dashboardState.alerts.filter(a => a.severity === 'critical').length;

    return {
      totalAgents: agents.length,
      activeAgents,
      errorAgents,
      totalTokens,
      criticalAlerts,
      avgProgress: agents.length > 0 ? agents.reduce((sum, s) => sum + s.progress, 0) / agents.length : 0
    };
  }, [dashboardState]);

  const handleAgentSelect = (agentId: string) => {
    setSelectedAgentId(agentId);
    setActiveTab('hierarchy');
  };

  const handleEventSelect = (eventId: string) => {
    setSelectedEventId(eventId);
    setActiveTab('events');
  };

  const handleRefresh = () => {
    refreshData();
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    setIsFullscreen(!isFullscreen);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Grid3X3 },
    { id: 'hierarchy', label: 'Hierarchy', icon: Users },
    { id: 'status', label: 'Status', icon: Activity },
    { id: 'metrics', label: 'Metrics', icon: BarChart3 },
    { id: 'events', label: 'Events', icon: Clock },
    { id: 'resources', label: 'Resources', icon: Wifi }
  ];

  return (
    <div className={`min-h-screen bg-gray-50 ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''} ${className}`}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">Agent Transparency Dashboard</h1>
              <div className="flex items-center space-x-2">
                {isConnected ? (
                  <div className="flex items-center space-x-1 text-green-600">
                    <Wifi className="w-4 h-4" />
                    <span className="text-sm">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1 text-red-600">
                    <WifiOff className="w-4 h-4" />
                    <span className="text-sm">Disconnected</span>
                  </div>
                )}
                {wsError && (
                  <div className="flex items-center space-x-1 text-red-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm">{wsError}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>Last updated:</span>
                <span>{dashboardState.lastUpdated?.toLocaleTimeString() || 'Never'}</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  title="Toggle view mode"
                >
                  {viewMode === 'grid' ? <List className="w-5 h-5" /> : <Grid3X3 className="w-5 h-5" />}
                </button>

                <button
                  onClick={handleRefresh}
                  className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  title="Refresh data"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>

                <button
                  onClick={toggleFullscreen}
                  className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  title="Toggle fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>

                <button
                  className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  title="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-900">{summaryStats.totalAgents}</p>
                  <p className="text-xs text-blue-600">Total Agents</p>
                </div>
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Activity className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-green-900">{summaryStats.activeAgents}</p>
                  <p className="text-xs text-green-600">Active</p>
                </div>
              </div>
            </div>

            <div className="bg-red-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <div>
                  <p className="text-2xl font-bold text-red-900">{summaryStats.errorAgents}</p>
                  <p className="text-xs text-red-600">Errors</p>
                </div>
              </div>
            </div>

            <div className="bg-purple-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold text-purple-900">{(summaryStats.totalTokens / 1000).toFixed(1)}K</p>
                  <p className="text-xs text-purple-600">Tokens Used</p>
                </div>
              </div>
            </div>

            <div className="bg-orange-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="text-2xl font-bold text-orange-900">{summaryStats.criticalAlerts}</p>
                  <p className="text-xs text-orange-600">Critical Alerts</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4">
          <nav className="flex space-x-8">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6">
        {dashboardState.loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
              <p className="text-gray-600">Loading dashboard data...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <AgentHierarchyTree
                    agents={dashboardState.agents}
                    onAgentSelect={handleAgentSelect}
                    maxHeight={400}
                  />
                  <AgentStatusMonitor
                    statuses={dashboardState.statuses}
                    onAgentSelect={handleAgentSelect}
                    autoRefresh={dashboardConfig.autoRefresh}
                    refreshInterval={dashboardConfig.refreshInterval}
                    maxCardsPerRow={2}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ResourceGauges
                    resourceUsage={dashboardState.resourceUsage}
                    alerts={dashboardState.alerts}
                    autoRefresh={dashboardConfig.autoRefresh}
                    refreshInterval={dashboardConfig.refreshInterval}
                  />
                  <EventTimeline
                    events={dashboardState.events}
                    onEventSelect={handleEventSelect}
                    maxEvents={50}
                    autoRefresh={dashboardConfig.autoRefresh}
                    refreshInterval={dashboardConfig.refreshInterval}
                  />
                </div>
              </div>
            )}

            {/* Hierarchy Tab */}
            {activeTab === 'hierarchy' && (
              <div className="space-y-6">
                <AgentHierarchyTree
                  agents={dashboardState.agents}
                  onAgentSelect={handleAgentSelect}
                  selectedAgentId={selectedAgentId}
                />
              </div>
            )}

            {/* Status Tab */}
            {activeTab === 'status' && (
              <div className="space-y-6">
                <AgentStatusMonitor
                  statuses={dashboardState.statuses}
                  onAgentSelect={handleAgentSelect}
                  autoRefresh={dashboardConfig.autoRefresh}
                  refreshInterval={dashboardConfig.refreshInterval}
                />
              </div>
            )}

            {/* Metrics Tab */}
            {activeTab === 'metrics' && (
              <div className="space-y-6">
                <PerformanceMetricsChart
                  metrics={dashboardState.metrics}
                  autoRefresh={dashboardConfig.autoRefresh}
                  refreshInterval={dashboardConfig.refreshInterval}
                />
              </div>
            )}

            {/* Events Tab */}
            {activeTab === 'events' && (
              <div className="space-y-6">
                <EventTimeline
                  events={dashboardState.events}
                  onEventSelect={handleEventSelect}
                  selectedEventId={selectedEventId}
                  maxEvents={dashboardConfig.maxEvents}
                  autoRefresh={dashboardConfig.autoRefresh}
                  refreshInterval={dashboardConfig.refreshInterval}
                />
              </div>
            )}

            {/* Resources Tab */}
            {activeTab === 'resources' && (
              <div className="space-y-6">
                <ResourceGauges
                  resourceUsage={dashboardState.resourceUsage}
                  alerts={dashboardState.alerts}
                  autoRefresh={dashboardConfig.autoRefresh}
                  refreshInterval={dashboardConfig.refreshInterval}
                  showTrends={true}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            Agent Transparency Dashboard v1.0
          </div>
          <div className="flex items-center space-x-4">
            <span>
              {Object.keys(dashboardState.statuses).length} agents
            </span>
            <span>
              {dashboardState.events.length} events
            </span>
            <span>
              {dashboardState.alerts.length} alerts
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;