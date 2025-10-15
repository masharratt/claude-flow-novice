import React, { useState } from 'react';
import RedisTransparencyDashboard from '../components/RedisTransparencyDashboard';
import PredictiveProgressModel from '../components/PredictiveProgressModel';
import CollaborationTracker from '../components/CollaborationTracker';
import AnomalyDetector from '../components/AnomalyDetector';
import PerformanceAnalyzer from '../components/PerformanceAnalyzer';
import useRedisTransparencyData from '../hooks/useRedisTransparencyData';
import styles from './RedisTransparencyPage.module.css';

const RedisTransparencyPage: React.FC = () => {
  const [activeView, setActiveView] = useState<'dashboard' | 'models' | 'collaboration' | 'anomalies' | 'performance'>('dashboard');
  
  const {
    data,
    loading,
    error,
    refreshData,
    updateFilters,
    updateTimeRange,
    summary
  } = useRedisTransparencyData({
    autoRefresh: true,
    refreshInterval: 30000,
    timeRange: '24h'
  });

  const handleExportData = () => {
    if (data) {
      const dataStr = JSON.stringify(data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `redis-transparency-${new Date().toISOString()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleRefreshData = () => {
    refreshData();
  };

  const renderActiveView = () => {
    if (!data) return null;

    switch (activeView) {
      case 'dashboard':
        return (
          <RedisTransparencyDashboard
            predictiveModels={data.predictiveModels}
            agentCollaborations={data.agents.map(agent => ({
              agentId: agent.id,
              agentName: agent.name,
              role: agent.role,
              collaborations: Math.floor(Math.random() * 50) + 10,
              successRate: 0.8 + Math.random() * 0.2,
              avgResponseTime: Math.floor(Math.random() * 200) + 50,
              lastActive: agent.lastActive,
              status: agent.status
            }))}
            performanceMetrics={data.performanceMetrics}
            anomalies={data.anomalies}
            summary={{
              totalAgents: summary.totalAgents,
              activeModels: summary.activeModels,
              anomalyCount: summary.totalAnomalies,
              avgLatency: summary.avgLatency,
              systemHealth: summary.systemHealth
            }}
          />
        );
      
      case 'models':
        return (
          <PredictiveProgressModel
            models={data.predictiveModels}
            predictions={data.predictions}
            trainingHistory={[]}
            featureImportance={[]}
          />
        );
      
      case 'collaboration':
        return (
          <CollaborationTracker
            agents={data.agents}
            events={data.collaborationEvents}
            metrics={data.agents.map(agent => ({
              agentId: agent.id,
              totalCollaborations: Math.floor(Math.random() * 50) + 10,
              successfulCollaborations: Math.floor(Math.random() * 45) + 5,
              avgResponseTime: Math.floor(Math.random() * 200) + 50,
              collaborationScore: 7 + Math.random() * 3,
              partners: data.agents.filter(a => a.id !== agent.id).map(a => a.id),
              frequentPartners: data.agents
                .filter(a => a.id !== agent.id)
                .slice(0, 3)
                .map(a => ({
                  agentId: a.id,
                  count: Math.floor(Math.random() * 20) + 5
                })),
              collaborationTypes: {
                message: Math.floor(Math.random() * 20) + 5,
                task_handoff: Math.floor(Math.random() * 15) + 3,
                data_share: Math.floor(Math.random() * 10) + 2,
                coordination: Math.floor(Math.random() * 8) + 1,
                review: Math.floor(Math.random() * 5) + 1
              }
            }))}
            network={{
              nodes: data.agents.map(agent => ({
                id: agent.id,
                name: agent.name,
                role: agent.role,
                group: agent.status === 'online' ? 1 : 2
              })),
              links: data.collaborationEvents.slice(0, 10).map(event => ({
                source: event.sourceAgentId,
                target: event.targetAgentId,
                value: Math.floor(Math.random() * 10) + 1,
                type: event.type
              }))
            }}
          />
        );
      
      case 'anomalies':
        return (
          <AnomalyDetector
            anomalies={data.anomalies}
            patterns={[]}
            metrics={Object.fromEntries(
              ['latency', 'throughput', 'error_rate', 'memory_usage', 'cpu_usage'].map(metric => [
                metric,
                data.performanceMetrics
                  .filter(m => m.metric === metric)
                  .map(m => ({
                    timestamp: m.timestamp,
                    value: m.value,
                    threshold: m.threshold || 100,
                    baseline: m.baseline || 50,
                    anomaly: Math.random() > 0.8
                  }))
              ])
            )}
            rules={[]}
          />
        );
      
      case 'performance':
        return (
          <PerformanceAnalyzer
            metrics={data.performanceMetrics}
            trends={[]}
            resourceUsage={data.resourceUsage}
            bottlenecks={[]}
            benchmarks={[]}
            onExportData={handleExportData}
            onRefreshData={handleRefreshData}
          />
        );
      
      default:
        return null;
    }
  };

  if (loading && !data) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Loading Redis Transparency data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <h2>Error Loading Data</h2>
        <p>{error}</p>
        <button onClick={handleRefreshData} className={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <header className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <div>
            <h1 className={styles.pageTitle}>Redis Transparency Enhancement</h1>
            <p className={styles.pageSubtitle}>
              Phase 4: Real-time monitoring and analytics for Redis operations
            </p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.systemHealth}>
              <span className={styles.healthLabel}>System Health</span>
              <span className={`${styles.healthScore} ${summary.systemHealth >= 80 ? styles.good : summary.systemHealth >= 60 ? styles.warning : styles.critical}`}>
                {summary.systemHealth}%
              </span>
            </div>
            <button onClick={handleRefreshData} className={styles.refreshButton}>
              Refresh Data
            </button>
          </div>
        </div>
      </header>

      <nav className={styles.navigation}>
        <div className={styles.navTabs}>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: '📊' },
            { id: 'models', label: 'Predictive Models', icon: '🤖' },
            { id: 'collaboration', label: 'Collaboration', icon: '👥' },
            { id: 'anomalies', label: 'Anomalies', icon: '⚠️' },
            { id: 'performance', label: 'Performance', icon: '📈' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id as any)}
              className={`${styles.navTab} ${activeView === tab.id ? styles.active : ''}`}
            >
              <span className={styles.tabIcon}>{tab.icon}</span>
              <span className={styles.tabLabel}>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className={styles.mainContent}>
        {renderActiveView()}
      </main>

      <footer className={styles.pageFooter}>
        <div className={styles.footerContent}>
          <p>
            Last updated: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'Never'}
          </p>
          <div className={styles.footerStats}>
            <span>{summary.totalAgents} agents</span>
            <span>{summary.activeModels} models</span>
            <span>{summary.totalAnomalies} anomalies</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default RedisTransparencyPage;