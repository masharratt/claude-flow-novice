/**
 * Fleet Overview Component
 * Displays real-time fleet metrics with auto-refresh
 */

import React, { useEffect, useState } from 'react';
import { FleetDashboardClient, FleetMetrics } from '../FleetDashboardClient';

export interface FleetOverviewProps {
  /** Dashboard client instance */
  client: FleetDashboardClient;
  /** Custom CSS class */
  className?: string;
  /** Show detailed metrics */
  detailed?: boolean;
}

/**
 * Fleet Overview Widget
 * Displays system-level metrics and swarm summaries
 */
export const FleetOverview: React.FC<FleetOverviewProps> = ({
  client,
  className = '',
  detailed = false
}) => {
  const [metrics, setMetrics] = useState<FleetMetrics | null>(null);
  const [connectionStatus, setConnectionStatus] = useState(client.getConnectionStatus());

  useEffect(() => {
    // Subscribe to metrics updates
    const handleMetrics = (data: FleetMetrics) => {
      setMetrics(data);
    };

    const handleStatus = (status: string) => {
      setConnectionStatus(status as any);
    };

    client.on('metrics', handleMetrics);
    client.on('statusChange', handleStatus);

    // Request initial metrics
    client.refresh();

    return () => {
      client.off('metrics', handleMetrics);
      client.off('statusChange', handleStatus);
    };
  }, [client]);

  if (!metrics) {
    return (
      <div className={`fleet-overview ${className}`}>
        <div className="loading">Loading fleet metrics...</div>
      </div>
    );
  }

  const { system, swarms } = metrics;
  const swarmCount = Object.keys(swarms).length;
  const activeSwarms = Object.values(swarms).filter(
    s => s.status === 'active' || s.status === 'running'
  ).length;
  const totalAgents = Object.values(swarms).reduce((sum, s) => sum + s.agents, 0);

  return (
    <div className={`fleet-overview ${className}`}>
      {/* Connection Status */}
      <div className="connection-indicator">
        <div className={`status-dot ${connectionStatus}`} />
        <span>{connectionStatus}</span>
      </div>

      {/* System Metrics */}
      <div className="system-metrics">
        <h3>System Performance</h3>
        <div className="metric-grid">
          <MetricCard
            label="CPU Usage"
            value={system.cpu.usage.toFixed(1)}
            unit="%"
            max={100}
            warning={80}
            critical={95}
          />
          <MetricCard
            label="Memory"
            value={system.memory.used.toFixed(1)}
            unit={`GB / ${system.memory.total.toFixed(0)}GB`}
            max={system.memory.total}
            warning={system.memory.total * 0.8}
            critical={system.memory.total * 0.9}
          />
          {system.memory.bandwidth && (
            <MetricCard
              label="Memory Bandwidth"
              value={system.memory.bandwidth.toFixed(1)}
              unit="GB/s"
              max={51.2}
            />
          )}
          <MetricCard
            label="CPU Cores"
            value={system.cpu.cores.toString()}
            unit="cores"
          />
        </div>
      </div>

      {/* Fleet Summary */}
      <div className="fleet-summary">
        <h3>Fleet Status</h3>
        <div className="summary-stats">
          <div className="stat">
            <div className="stat-value">{swarmCount}</div>
            <div className="stat-label">Total Swarms</div>
          </div>
          <div className="stat">
            <div className="stat-value">{activeSwarms}</div>
            <div className="stat-label">Active</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totalAgents}</div>
            <div className="stat-label">Agents</div>
          </div>
        </div>
      </div>

      {/* Detailed Metrics */}
      {detailed && system.heap && (
        <div className="detailed-metrics">
          <h4>Heap Memory</h4>
          <div className="metric-row">
            <span>Used:</span>
            <span>{(system.heap.used / 1024 / 1024).toFixed(0)} MB</span>
          </div>
          <div className="metric-row">
            <span>Total:</span>
            <span>{(system.heap.total / 1024 / 1024).toFixed(0)} MB</span>
          </div>
          <div className="metric-row">
            <span>Limit:</span>
            <span>{(system.heap.limit / 1024 / 1024).toFixed(0)} MB</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Metric Card Component
 */
interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  max?: number;
  warning?: number;
  critical?: number;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit = '',
  max,
  warning,
  critical
}) => {
  const numValue = parseFloat(value);
  let severity = 'normal';

  if (critical && numValue >= critical) {
    severity = 'critical';
  } else if (warning && numValue >= warning) {
    severity = 'warning';
  }

  const percentage = max ? (numValue / max) * 100 : 0;

  return (
    <div className={`metric-card ${severity}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value} <span className="unit">{unit}</span>
      </div>
      {max && (
        <div className="metric-bar">
          <div className="bar-fill" style={{ width: `${percentage}%` }} />
        </div>
      )}
    </div>
  );
};
