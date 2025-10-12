/**
 * Swarm Visualization Component
 * Real-time visualization of active swarms
 */

import React, { useEffect, useState } from 'react';
import { FleetDashboardClient, SwarmMetrics } from '../FleetDashboardClient';

export interface SwarmVisualizationProps {
  /** Dashboard client instance */
  client: FleetDashboardClient;
  /** Custom CSS class */
  className?: string;
  /** Maximum swarms to display (default: 10) */
  maxSwarms?: number;
  /** Show only active swarms */
  activeOnly?: boolean;
}

/**
 * Swarm Visualization Widget
 * Displays individual swarm status and metrics
 */
export const SwarmVisualization: React.FC<SwarmVisualizationProps> = ({
  client,
  className = '',
  maxSwarms = 10,
  activeOnly = false
}) => {
  const [swarms, setSwarms] = useState<Record<string, SwarmMetrics>>({});

  useEffect(() => {
    const handleMetrics = (data: any) => {
      setSwarms(data.swarms || {});
    };

    client.on('metrics', handleMetrics);

    return () => {
      client.off('metrics', handleMetrics);
    };
  }, [client]);

  // Filter and sort swarms
  const swarmList = Object.entries(swarms)
    .filter(([_, swarm]) => !activeOnly || swarm.status === 'active' || swarm.status === 'running')
    .sort((a, b) => {
      // Sort by status priority: active > running > completed > failed > idle
      const statusPriority: Record<string, number> = {
        active: 5,
        running: 4,
        completed: 3,
        failed: 2,
        idle: 1
      };
      return (statusPriority[b[1].status] || 0) - (statusPriority[a[1].status] || 0);
    })
    .slice(0, maxSwarms);

  if (swarmList.length === 0) {
    return (
      <div className={`swarm-visualization ${className}`}>
        <div className="empty-state">
          <div className="empty-icon">🐝</div>
          <div className="empty-message">No active swarms</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`swarm-visualization ${className}`}>
      <h3>Active Swarms ({swarmList.length})</h3>
      <div className="swarm-grid">
        {swarmList.map(([id, swarm]) => (
          <SwarmCard key={id} swarm={swarm} />
        ))}
      </div>
    </div>
  );
};

/**
 * Individual Swarm Card
 */
interface SwarmCardProps {
  swarm: SwarmMetrics;
}

const SwarmCard: React.FC<SwarmCardProps> = ({ swarm }) => {
  const progressPercent = Math.round(swarm.progress * 100);
  const confidencePercent = swarm.confidence ? Math.round(swarm.confidence * 100) : undefined;

  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <div className={`swarm-card status-${swarm.status}`}>
      {/* Header */}
      <div className="swarm-header">
        <div className="swarm-name" title={swarm.objective || swarm.name}>
          {swarm.name}
        </div>
        <div className={`swarm-status status-${swarm.status}`}>
          <span className="status-indicator" />
          {swarm.status}
        </div>
      </div>

      {/* Metrics */}
      <div className="swarm-metrics">
        <div className="metric-row">
          <span>Agents:</span>
          <span className="value">{swarm.agents}</span>
        </div>
        <div className="metric-row">
          <span>Tasks:</span>
          <span className="value">{swarm.tasks}</span>
        </div>
        {swarm.uptime > 0 && (
          <div className="metric-row">
            <span>Uptime:</span>
            <span className="value">{formatUptime(swarm.uptime)}</span>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="swarm-progress">
        <div className="progress-label">
          <span>Progress</span>
          <span className="progress-value">{progressPercent}%</span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Confidence (if available) */}
      {confidencePercent !== undefined && (
        <div className="swarm-confidence">
          <div className="confidence-label">
            <span>Confidence</span>
            <span className="confidence-value">{confidencePercent}%</span>
          </div>
          <div className="confidence-bar">
            <div
              className={`confidence-fill ${
                confidencePercent >= 90 ? 'high' : confidencePercent >= 75 ? 'medium' : 'low'
              }`}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Objective */}
      {swarm.objective && (
        <div className="swarm-objective" title={swarm.objective}>
          {swarm.objective}
        </div>
      )}
    </div>
  );
};
