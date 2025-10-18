/**
 * Fleet Dashboard - Main Component
 * Complete real-time fleet monitoring dashboard
 */

import React, { useEffect, useState } from 'react';
import { FleetDashboardClient, DashboardConfig } from '../FleetDashboardClient';
import { FleetOverview } from './FleetOverview';
import { SwarmVisualization } from './SwarmVisualization';
import { PerformanceChart } from './PerformanceChart';
import { AlertsPanel } from './AlertsPanel';

export interface FleetDashboardProps {
  /** Dashboard configuration */
  config?: DashboardConfig;
  /** Custom CSS class */
  className?: string;
  /** Dashboard layout: 'grid' | 'vertical' | 'horizontal' */
  layout?: 'grid' | 'vertical' | 'horizontal';
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Show performance chart (default: true) */
  showChart?: boolean;
  /** Show alerts panel (default: true) */
  showAlerts?: boolean;
  /** Custom client instance (optional) */
  client?: FleetDashboardClient;
}

/**
 * Complete Fleet Dashboard Component
 * Provides comprehensive real-time fleet monitoring
 */
export const FleetDashboard: React.FC<FleetDashboardProps> = ({
  config,
  className = '',
  layout = 'grid',
  autoConnect = true,
  showChart = true,
  showAlerts = true,
  client: externalClient
}) => {
  const [dashboardClient, setDashboardClient] = useState<FleetDashboardClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Use external client or create new one
    const client = externalClient || new FleetDashboardClient(config);
    setDashboardClient(client);

    // Connect if auto-connect is enabled
    if (autoConnect) {
      client.connect().catch(err => {
        setError(err.message);
      });
    }

    // Subscribe to events
    const handleConnected = () => {
      setIsConnected(true);
      setError(null);
    };

    const handleDisconnected = () => {
      setIsConnected(false);
    };

    const handleError = (err: any) => {
      setError(err.message || 'Connection error');
    };

    client.on('connected', handleConnected);
    client.on('disconnected', handleDisconnected);
    client.on('error', handleError);

    return () => {
      client.off('connected', handleConnected);
      client.off('disconnected', handleDisconnected);
      client.off('error', handleError);

      // Only disconnect if we created the client
      if (!externalClient) {
        client.disconnect();
      }
    };
  }, [config, autoConnect, externalClient]);

  if (!dashboardClient) {
    return <div className="fleet-dashboard-loading">Initializing dashboard...</div>;
  }

  if (error) {
    return (
      <div className="fleet-dashboard-error">
        <div className="error-icon">⚠️</div>
        <div className="error-message">{error}</div>
        <button onClick={() => dashboardClient.connect()}>Retry Connection</button>
      </div>
    );
  }

  return (
    <div className={`fleet-dashboard fleet-dashboard-${layout} ${className}`}>
      {/* Fleet Overview Section */}
      <div className="dashboard-section overview-section">
        <FleetOverview client={dashboardClient} detailed />
      </div>

      {/* Performance Chart Section */}
      {showChart && (
        <div className="dashboard-section chart-section">
          <h3>Real-time Performance</h3>
          <PerformanceChart
            client={dashboardClient}
            height={300}
            timeWindow={60}
            metrics={['cpu', 'memory']}
          />
        </div>
      )}

      {/* Swarm Visualization Section */}
      <div className="dashboard-section swarms-section">
        <SwarmVisualization client={dashboardClient} maxSwarms={10} />
      </div>

      {/* Alerts Panel Section */}
      {showAlerts && (
        <div className="dashboard-section alerts-section">
          <AlertsPanel client={dashboardClient} maxAlerts={10} />
        </div>
      )}
    </div>
  );
};

/**
 * Hook for using Fleet Dashboard client
 */
export function useFleetDashboard(config?: DashboardConfig) {
  const [client] = useState(() => new FleetDashboardClient(config));
  const [connectionStatus, setConnectionStatus] = useState(client.getConnectionStatus());
  const [latestMetrics, setLatestMetrics] = useState(client.getLatestMetrics());

  useEffect(() => {
    const handleStatus = (status: any) => {
      setConnectionStatus(status);
    };

    const handleMetrics = (metrics: any) => {
      setLatestMetrics(metrics);
    };

    client.on('statusChange', handleStatus);
    client.on('metrics', handleMetrics);

    // Auto-connect
    client.connect();

    return () => {
      client.off('statusChange', handleStatus);
      client.off('metrics', handleMetrics);
      client.disconnect();
    };
  }, [client]);

  return {
    client,
    connectionStatus,
    latestMetrics,
    connect: () => client.connect(),
    disconnect: () => client.disconnect(),
    refresh: () => client.refresh()
  };
}

export default FleetDashboard;
