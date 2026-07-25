/**
 * AlertsPanelContainer
 * Wrapper for AlertsPanel from web-components with Zustand store integration
 */

import React, { useCallback } from 'react';
import { AlertsPanel } from '@components';
import { useEventsStore } from '../../../shared/stores/eventsStore';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface AlertsPanelContainerProps {
  maxAlerts?: number;
  autoClose?: boolean;
  autoCloseDelay?: number;
  filterBySeverity?: ('info' | 'warning' | 'error' | 'critical')[];
  showTimestamp?: boolean;
  className?: string;
}

export const AlertsPanelContainer: React.FC<AlertsPanelContainerProps> = ({
  maxAlerts = 10,
  autoClose = false,
  autoCloseDelay = 5000,
  filterBySeverity,
  showTimestamp = true,
  className,
}) => {
  const { events, addEvent, loading } = useEventsStore();

  // Subscribe to alert events
  useWebSocketEvent('alert:created', (data: any) => {
    console.log('[AlertsPanel] Alert created:', data);
    if (data.alert) {
      addEvent({
        id: data.alert.id || `alert-${Date.now()}`,
        type: 'alert',
        agentId: data.alert.agentId,
        timestamp: data.alert.timestamp || Date.now(),
        severity: data.alert.severity || 'info',
        message: data.alert.message,
        metadata: data.alert.metadata,
      });
    }
  });

  // Transform events to alerts format
  const alerts = events
    .filter((e) => e.type === 'alert' || e.severity === 'error' || e.severity === 'critical')
    .map((event) => ({
      id: event.id,
      severity: event.severity as 'info' | 'warning' | 'error' | 'critical',
      message: event.message,
      timestamp: event.timestamp,
      agentId: event.agentId,
      metadata: event.metadata,
    }))
    .slice(0, maxAlerts);

  const handleDismiss = useCallback((alertId: string) => {
    console.log('[AlertsPanel] Alert dismissed:', alertId);
    // Implement dismiss logic
  }, []);

  const handleDismissAll = useCallback(() => {
    console.log('[AlertsPanel] All alerts dismissed');
    // Implement dismiss all logic
  }, []);

  if (loading && alerts.length === 0) {
    return <LoadingSpinner message="Loading alerts..." size={24} />;
  }

  return (
    <ErrorBoundary>
      <AlertsPanel
        alerts={alerts}
        onDismiss={handleDismiss}
        onDismissAll={handleDismissAll}
        maxAlerts={maxAlerts}
        autoClose={autoClose}
        autoCloseDelay={autoCloseDelay}
        filterBySeverity={filterBySeverity}
        showTimestamp={showTimestamp}
        className={className}
      />
    </ErrorBoundary>
  );
};

export default AlertsPanelContainer;
