import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AgentHierarchyTree,
  PerformanceCharts,
  ResourceGauges,
  EventTimeline,
  AgentNetworkTopology,
  type AgentNode,
  type PerformanceMetrics,
  type AgentPerformanceData,
  type ResourceMetrics,
  type AgentResourceData,
  type HeatmapData,
  type TimelineEvent,
  type NetworkNode,
  type NetworkLink,
  type NetworkCluster,
} from './index';
import { XSSProtection } from '../../web/security/xss-protection.js';

export interface DashboardData {
  agents: AgentNode[];
  performanceMetrics: PerformanceMetrics[];
  agentPerformanceData: AgentPerformanceData[];
  resourceMetrics: ResourceMetrics;
  agentResourceData: AgentResourceData[];
  heatmapData: HeatmapData[];
  timelineEvents: TimelineEvent[];
  networkNodes: NetworkNode[];
  networkLinks: NetworkLink[];
  networkClusters: NetworkCluster[];
}

export interface DashboardProps {
  data: DashboardData;
  width?: number;
  height?: number;
  realTimeUpdates?: boolean;
  updateInterval?: number;
  theme?: 'light' | 'dark';
  layout?: 'grid' | 'tabs' | 'stacked';
  autoRefresh?: boolean;
  showControls?: boolean;
  exportEnabled?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  data,
  width = 1400,
  height = 900,
  realTimeUpdates = true,
  updateInterval = 5000,
  theme = 'light',
  layout = 'grid',
  autoRefresh = true,
  showControls = true,
  exportEnabled = true,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'network' | 'timeline' | 'resources'>('overview');
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['cpu', 'memory', 'network']);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Memoize filtered data based on time range
  const filteredData = useMemo(() => {
    const cutoff = Date.now() - {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    }[selectedTimeRange];

    return {
      ...data,
      performanceMetrics: data.performanceMetrics.filter(m => m.timestamp >= cutoff),
      timelineEvents: data.timelineEvents.filter(e => e.timestamp >= cutoff),
      heatmapData: data.heatmapData.filter(h => h.timestamp >= cutoff),
    };
  }, [data, selectedTimeRange]);

  // Handle real-time updates
  useEffect(() => {
    if (!realTimeUpdates || !autoRefresh) return;

    const interval = setInterval(() => {
      setLastUpdate(Date.now());
      // In a real implementation, this would fetch new data
      console.log('Dashboard data updated at:', new Date().toISOString());
    }, updateInterval);

    return () => clearInterval(interval);
  }, [realTimeUpdates, autoRefresh, updateInterval]);

  // Handle fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Handle export
  const handleExportDashboard = useCallback(() => {
    const exportData = {
      timestamp: Date.now(),
      timeRange: selectedTimeRange,
      data: filteredData,
      config: {
        theme,
        layout,
        updateInterval,
        realTimeUpdates,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dashboard-export-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredData, selectedTimeRange, theme, layout, updateInterval, realTimeUpdates]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const activeAgents = data.agents.filter(a => a.status === 'active').length;
    const totalTasks = data.agentPerformanceData.reduce((sum, a) => sum + a.metrics.tasksCompleted, 0);
    const avgSuccessRate = data.agentPerformanceData.reduce((sum, a) => sum + a.metrics.successRate, 0) / data.agentPerformanceData.length || 0;
    const avgResponseTime = data.performanceMetrics.reduce((sum, m) => sum + m.responseTime, 0) / data.performanceMetrics.length || 0;

    return {
      activeAgents,
      totalAgents: data.agents.length,
      totalTasks,
      avgSuccessRate: avgSuccessRate * 100,
      avgResponseTime,
      systemLoad: data.resourceMetrics.cpu,
      memoryUsage: data.resourceMetrics.memory,
      errorRate: data.performanceMetrics[data.performanceMetrics.length - 1]?.errorRate || 0,
    };
  }, [data]);

  const themeColors = {
    light: {
      background: '#f9fafb',
      text: '#1f2937',
      border: '#e5e7eb',
      panel: '#ffffff',
      accent: '#3b82f6',
    },
    dark: {
      background: '#111827',
      text: '#f9fafb',
      border: '#374151',
      panel: '#1f2937',
      accent: '#60a5fa',
    },
  };

  const colors = themeColors[theme];

  if (layout === 'tabs') {
    return (
      <div
        className={`dashboard dashboard-tabs ${isFullscreen ? 'fullscreen' : ''}`}
        style={{
          width: isFullscreen ? '100vw' : width,
          height: isFullscreen ? '100vh' : height,
          background: colors.background,
          color: colors.text,
          position: isFullscreen ? 'fixed' : 'relative',
          top: isFullscreen ? 0 : 'auto',
          left: isFullscreen ? 0 : 'auto',
          zIndex: isFullscreen ? 9999 : 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: colors.panel,
            borderBottom: `1px solid ${colors.border}`,
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Agent Dashboard</h1>

          {showControls && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <select
                value={selectedTimeRange}
                onChange={(e) => setSelectedTimeRange(e.target.value as any)}
                style={{
                  padding: '8px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  background: colors.background,
                  color: colors.text,
                }}
              >
                <option value="1h">Last Hour</option>
                <option value="6h">Last 6 Hours</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
              </select>

              <button
                onClick={toggleFullscreen}
                style={{
                  padding: '8px 16px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  background: colors.accent,
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </button>

              {exportEnabled && (
                <button
                  onClick={handleExportDashboard}
                  style={{
                    padding: '8px 16px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    background: colors.accent,
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  Export
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            background: colors.panel,
            borderBottom: `1px solid ${colors.border}`,
            padding: '0 24px',
            display: 'flex',
            gap: '2px',
          }}
        >
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'performance', label: 'Performance' },
            { id: 'network', label: 'Network' },
            { id: 'timeline', label: 'Timeline' },
            { id: 'resources', label: 'Resources' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: activeTab === tab.id ? colors.accent : 'transparent',
                color: activeTab === tab.id ? '#ffffff' : colors.text,
                cursor: 'pointer',
                borderRadius: '4px 4px 0 0',
                fontSize: '14px',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
              {/* Summary Stats */}
              <div
                style={{
                  background: colors.panel,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  padding: '20px',
                }}
              >
                <h3 style={{ margin: '0 0 16px 0', color: colors.text }}>System Overview</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: colors.text, opacity: 0.7 }}>Active Agents</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.accent }}>
                      {summaryStats.activeAgents}/{summaryStats.totalAgents}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: colors.text, opacity: 0.7 }}>Total Tasks</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.accent }}>
                      {summaryStats.totalTasks}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: colors.text, opacity: 0.7 }}>Success Rate</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.accent }}>
                      {summaryStats.avgSuccessRate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: colors.text, opacity: 0.7 }}>Avg Response</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.accent }}>
                      {summaryStats.avgResponseTime.toFixed(0)}ms
                    </div>
                  </div>
                </div>
              </div>

              {/* Agent Hierarchy */}
              <div
                style={{
                  background: colors.panel,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  padding: '20px',
                  gridColumn: 'span 2',
                }}
              >
                <h3 style={{ margin: '0 0 16px 0', color: colors.text }}>Agent Hierarchy</h3>
                <div style={{ height: '300px' }}>
                  <AgentHierarchyTree
                    data={data.agents[0] || { id: 'root', name: 'Root', type: 'coordinator', status: 'active' }}
                    width={600}
                    height={300}
                    realTimeUpdates={realTimeUpdates}
                    theme={theme}
                    showMetrics={true}
                    animationsEnabled={true}
                  />
                </div>
              </div>

              {/* Resource Gauges */}
              <div
                style={{
                  background: colors.panel,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  padding: '20px',
                }}
              >
                <h3 style={{ margin: '0 0 16px 0', color: colors.text }}>Resource Usage</h3>
                <div style={{ height: '200px' }}>
                  <ResourceGauges
                    resourceMetrics={data.resourceMetrics}
                    agentData={data.agentResourceData}
                    heatmapData={filteredData.heatmapData}
                    width={400}
                    height={200}
                    realTimeUpdates={realTimeUpdates}
                    theme={theme}
                    gaugeStyle="arc"
                    showLabels={true}
                    animationsEnabled={true}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <div style={{ height: '100%' }}>
              <PerformanceCharts
                systemMetrics={filteredData.performanceMetrics}
                agentData={data.agentPerformanceData}
                width={width - 48}
                height={height - 200}
                realTimeUpdates={realTimeUpdates}
                theme={theme}
                timeRange={selectedTimeRange}
                showGrid={true}
                animationsEnabled={true}
              />
            </div>
          )}

          {activeTab === 'network' && (
            <div style={{ height: '100%' }}>
              <AgentNetworkTopology
                nodes={data.networkNodes}
                links={data.networkLinks}
                clusters={data.networkClusters}
                width={width - 48}
                height={height - 200}
                realTimeUpdates={realTimeUpdates}
                theme={theme}
                showLabels={true}
                showMetrics={true}
                layoutType="force"
                clusteringEnabled={true}
                metricsMode="performance"
              />
            </div>
          )}

          {activeTab === 'timeline' && (
            <div style={{ height: '100%' }}>
              <EventTimeline
                events={filteredData.timelineEvents}
                width={width - 48}
                height={height - 200}
                realTimeUpdates={realTimeUpdates}
                theme={theme}
                showCategories={true}
                showAgents={true}
                timeRange={selectedTimeRange}
                groupingMode="category"
                animationSpeed={750}
              />
            </div>
          )}

          {activeTab === 'resources' && (
            <div style={{ height: '100%' }}>
              <ResourceGauges
                resourceMetrics={data.resourceMetrics}
                agentData={data.agentResourceData}
                heatmapData={filteredData.heatmapData}
                width={width - 48}
                height={height - 200}
                realTimeUpdates={realTimeUpdates}
                theme={theme}
                gaugeStyle="arc"
                showLabels={true}
                animationsEnabled={true}
                heatmapResolution={10}
              />
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div
          style={{
            background: colors.panel,
            borderTop: `1px solid ${colors.border}`,
            padding: '8px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: colors.text,
          }}
        >
          <div>
            Last updated: {new Date(lastUpdate).toLocaleString()}
          </div>
          <div>
            Real-time updates: {realTimeUpdates ? 'Enabled' : 'Disabled'}
          </div>
          <div>
            Time range: {selectedTimeRange}
          </div>
        </div>
      </div>
    );
  }

  // Grid layout
  return (
    <div
      className={`dashboard dashboard-grid ${isFullscreen ? 'fullscreen' : ''}`}
      style={{
        width: isFullscreen ? '100vw' : width,
        height: isFullscreen ? '100vh' : height,
        background: colors.background,
        color: colors.text,
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 9999 : 1,
        padding: '16px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'auto 1fr 1fr',
        gap: '16px',
      }}
    >
      {/* Header */}
      <div
        style={{
          gridColumn: '1 / -1',
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Agent Dashboard</h1>

        {showControls && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value as any)}
              style={{
                padding: '8px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                background: colors.background,
                color: colors.text,
              }}
            >
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
            </select>

            <button
              onClick={toggleFullscreen}
              style={{
                padding: '8px 16px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                background: colors.accent,
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>

            {exportEnabled && (
              <button
                onClick={handleExportDashboard}
                style={{
                  padding: '8px 16px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  background: colors.accent,
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                Export
              </button>
            )}
          </div>
        )}
      </div>

      {/* Agent Hierarchy */}
      <div
        style={{
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', color: colors.text }}>Agent Hierarchy</h3>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AgentHierarchyTree
            data={data.agents[0] || { id: 'root', name: 'Root', type: 'coordinator', status: 'active' }}
            width={width / 2 - 48}
            height={height / 2 - 100}
            realTimeUpdates={realTimeUpdates}
            theme={theme}
            showMetrics={true}
            animationsEnabled={true}
          />
        </div>
      </div>

      {/* Performance Charts */}
      <div
        style={{
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', color: colors.text }}>Performance Metrics</h3>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PerformanceCharts
            systemMetrics={filteredData.performanceMetrics}
            agentData={data.agentPerformanceData}
            width={width / 2 - 48}
            height={height / 2 - 100}
            realTimeUpdates={realTimeUpdates}
            theme={theme}
            timeRange={selectedTimeRange}
            showGrid={true}
            animationsEnabled={true}
          />
        </div>
      </div>

      {/* Network Topology */}
      <div
        style={{
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', color: colors.text }}>Network Topology</h3>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AgentNetworkTopology
            nodes={data.networkNodes}
            links={data.networkLinks}
            clusters={data.networkClusters}
            width={width / 2 - 48}
            height={height / 2 - 100}
            realTimeUpdates={realTimeUpdates}
            theme={theme}
            showLabels={true}
            showMetrics={true}
            layoutType="force"
            clusteringEnabled={true}
            metricsMode="performance"
          />
        </div>
      </div>

      {/* Timeline and Resources */}
      <div
        style={{
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', color: colors.text }}>Event Timeline & Resources</h3>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <EventTimeline
              events={filteredData.timelineEvents.slice(-20)} // Show last 20 events
              width={width / 2 - 48}
              height={(height / 2 - 100) / 2 - 6}
              realTimeUpdates={realTimeUpdates}
              theme={theme}
              showCategories={false}
              showAgents={false}
              timeRange={selectedTimeRange}
              groupingMode="none"
              animationSpeed={500}
            />
          </div>
          <div style={{ flex: 1 }}>
            <ResourceGauges
              resourceMetrics={data.resourceMetrics}
              agentData={data.agentResourceData.slice(0, 5)} // Show top 5 agents
              heatmapData={filteredData.heatmapData}
              width={width / 2 - 48}
              height={(height / 2 - 100) / 2 - 6}
              realTimeUpdates={realTimeUpdates}
              theme={theme}
              gaugeStyle="linear"
              showLabels={false}
              animationsEnabled={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
};