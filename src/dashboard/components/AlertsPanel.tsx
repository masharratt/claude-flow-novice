/**
 * Alerts Panel Component
 * Displays real-time alerts and notifications
 */

import React, { useEffect, useState } from 'react';
import { FleetDashboardClient, Alert } from '../FleetDashboardClient';

export interface AlertsPanelProps {
  /** Dashboard client instance */
  client: FleetDashboardClient;
  /** Custom CSS class */
  className?: string;
  /** Maximum alerts to display (default: 10) */
  maxAlerts?: number;
  /** Filter by severity */
  filterSeverity?: 'all' | 'info' | 'warning' | 'critical';
}

/**
 * Alerts Panel Widget
 * Displays system alerts with filtering
 */
export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  client,
  className = '',
  maxAlerts = 10,
  filterSeverity = 'all'
}) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activeSeverity, setActiveSeverity] = useState(filterSeverity);

  useEffect(() => {
    const handleAlert = (alert: Alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 50)); // Keep max 50 alerts
    };

    client.on('alert', handleAlert);

    return () => {
      client.off('alert', handleAlert);
    };
  }, [client]);

  // Filter alerts by severity
  const filteredAlerts = alerts
    .filter(alert => activeSeverity === 'all' || alert.severity === activeSeverity)
    .slice(0, maxAlerts);

  return (
    <div className={`alerts-panel ${className}`}>
      <div className="alerts-header">
        <h3>Alerts ({filteredAlerts.length})</h3>
        <div className="severity-filters">
          <button
            className={`filter-btn ${activeSeverity === 'all' ? 'active' : ''}`}
            onClick={() => setActiveSeverity('all')}
          >
            All
          </button>
          <button
            className={`filter-btn ${activeSeverity === 'critical' ? 'active' : ''}`}
            onClick={() => setActiveSeverity('critical')}
          >
            Critical
          </button>
          <button
            className={`filter-btn ${activeSeverity === 'warning' ? 'active' : ''}`}
            onClick={() => setActiveSeverity('warning')}
          >
            Warning
          </button>
          <button
            className={`filter-btn ${activeSeverity === 'info' ? 'active' : ''}`}
            onClick={() => setActiveSeverity('info')}
          >
            Info
          </button>
        </div>
      </div>

      <div className="alerts-list">
        {filteredAlerts.length === 0 ? (
          <div className="no-alerts">
            <div className="icon">✓</div>
            <div className="message">No alerts</div>
          </div>
        ) : (
          filteredAlerts.map((alert, index) => (
            <AlertItem key={`${alert.id}-${index}`} alert={alert} />
          ))
        )}
      </div>
    </div>
  );
};

/**
 * Individual Alert Item
 */
interface AlertItemProps {
  alert: Alert;
}

const AlertItem: React.FC<AlertItemProps> = ({ alert }) => {
  const formatTime = (date: Date): string => {
    return new Date(date).toLocaleTimeString();
  };

  const getSeverityIcon = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '•';
    }
  };

  return (
    <div className={`alert-item severity-${alert.severity}`}>
      <div className="alert-icon">{getSeverityIcon(alert.severity)}</div>
      <div className="alert-content">
        <div className="alert-title">{alert.title}</div>
        <div className="alert-message">{alert.message}</div>
        {alert.category && (
          <div className="alert-category">{alert.category}</div>
        )}
        <div className="alert-time">{formatTime(alert.timestamp)}</div>
      </div>
    </div>
  );
};
