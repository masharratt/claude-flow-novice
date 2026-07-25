/**
 * AlertsPanel Example Usage
 * Demonstrates all features of the AlertsPanel component
 */

import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import { AlertsPanel } from './AlertsPanel';
import { Alert, AlertSeverity, AlertCategory } from './AlertsPanel.types';

/**
 * Generate mock alerts for demonstration
 */
const generateMockAlerts = (): Alert[] => {
  const now = new Date();

  return [
    {
      id: 'alert-1',
      severity: 'error',
      category: 'security',
      title: 'Critical Security Alert',
      message: 'Unauthorized access attempt detected from IP 192.168.1.100. Multiple failed authentication attempts detected.',
      status: 'active',
      timestamp: new Date(now.getTime() - 1000 * 60 * 5), // 5 minutes ago
      source: 'Security Monitor',
      actions: [
        {
          id: 'investigate',
          label: 'Investigate',
          handler: (alert) => console.log('Investigating', alert.id),
          variant: 'contained',
          color: 'error',
        },
      ],
    },
    {
      id: 'alert-2',
      severity: 'error',
      category: 'agent',
      title: 'Agent Task Failed',
      message: 'Agent "data-processor-3" failed to complete task "process-dataset-large-2024". Error: Out of memory.',
      status: 'acknowledged',
      timestamp: new Date(now.getTime() - 1000 * 60 * 15), // 15 minutes ago
      source: 'Agent Monitor',
      acknowledgedAt: new Date(now.getTime() - 1000 * 60 * 10),
    },
    {
      id: 'alert-3',
      severity: 'warning',
      category: 'performance',
      title: 'High CPU Usage',
      message: 'CPU usage exceeded 80% threshold. Current usage: 87%. System performance may be degraded.',
      status: 'active',
      timestamp: new Date(now.getTime() - 1000 * 60 * 3), // 3 minutes ago
      source: 'Performance Monitor',
      metadata: {
        cpuUsage: 87,
        threshold: 80,
      },
    },
    {
      id: 'alert-4',
      severity: 'warning',
      category: 'system',
      title: 'Low Disk Space',
      message: 'Disk space on volume /data is running low. Only 12% remaining (5.2 GB free).',
      status: 'active',
      timestamp: new Date(now.getTime() - 1000 * 60 * 20), // 20 minutes ago
      source: 'System Monitor',
    },
    {
      id: 'alert-5',
      severity: 'info',
      category: 'system',
      title: 'System Update Available',
      message: 'A new system update (version 3.2.0) is available. Update includes security patches and performance improvements.',
      status: 'active',
      timestamp: new Date(now.getTime() - 1000 * 60 * 8), // 8 minutes ago
      source: 'Update Manager',
      autoDismissTimeout: 10000,
    },
    {
      id: 'alert-6',
      severity: 'info',
      category: 'validation',
      title: 'Weekly Report Ready',
      message: 'Your weekly performance report for Oct 4-11 is now available for download.',
      status: 'active',
      timestamp: new Date(now.getTime() - 1000 * 60 * 2), // 2 minutes ago
      source: 'Report Generator',
      autoDismissTimeout: 8000,
    },
    {
      id: 'alert-7',
      severity: 'success',
      category: 'validation',
      title: 'All Tests Passed',
      message: 'Validation suite completed successfully. 247 tests passed, 0 failed. Code quality score: 96/100.',
      status: 'active',
      timestamp: new Date(now.getTime() - 1000 * 60 * 1), // 1 minute ago
      source: 'Test Runner',
      autoDismissTimeout: 5000,
    },
    {
      id: 'alert-8',
      severity: 'success',
      category: 'agent',
      title: 'Deployment Complete',
      message: 'Successfully deployed version 2.1.4 to production. All health checks passed.',
      status: 'active',
      timestamp: new Date(now.getTime() - 1000 * 30), // 30 seconds ago
      source: 'Deployment Pipeline',
      autoDismissTimeout: 7000,
    },
  ];
};

/**
 * Basic AlertsPanel example
 */
export const BasicAlertsPanel: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>(generateMockAlerts());

  const handleAcknowledge = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId
          ? { ...alert, status: 'acknowledged' as const, acknowledgedAt: new Date() }
          : alert
      )
    );
  };

  const handleDismiss = (alertId: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  };

  const handleResolve = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId
          ? { ...alert, status: 'resolved' as const, resolvedAt: new Date() }
          : alert
      )
    );
  };

  const handleAlertSelect = (alertId: string) => {
    console.log('Alert selected:', alertId);
  };

  return (
    <Box sx={{ height: '600px', width: '100%' }}>
      <AlertsPanel
        alerts={alerts}
        onAcknowledge={handleAcknowledge}
        onDismiss={handleDismiss}
        onResolve={handleResolve}
        onAlertSelect={handleAlertSelect}
        showSummaryBadge={true}
        showFilters={true}
        showSort={true}
        enableAutoDismiss={true}
      />
    </Box>
  );
};

/**
 * Compact AlertsPanel example
 */
export const CompactAlertsPanel: React.FC = () => {
  const [alerts] = useState<Alert[]>(generateMockAlerts());

  return (
    <Box sx={{ height: '400px', width: '100%' }}>
      <AlertsPanel
        alerts={alerts}
        compact={true}
        showSummaryBadge={true}
        showFilters={false}
        showSort={false}
      />
    </Box>
  );
};

/**
 * Grouped by category example
 */
export const GroupedAlertsPanel: React.FC = () => {
  const [alerts] = useState<Alert[]>(generateMockAlerts());

  return (
    <Box sx={{ height: '600px', width: '100%' }}>
      <AlertsPanel
        alerts={alerts}
        groupByCategory={true}
        showSummaryBadge={true}
        showFilters={true}
        showSort={true}
      />
    </Box>
  );
};

/**
 * Live alerts demo with auto-generation
 */
export const LiveAlertsPanel: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>(generateMockAlerts());

  useEffect(() => {
    const interval = setInterval(() => {
      const severities: AlertSeverity[] = ['error', 'warning', 'info', 'success'];
      const categories: AlertCategory[] = ['system', 'agent', 'security', 'performance', 'validation', 'user'];

      const randomSeverity = severities[Math.floor(Math.random() * severities.length)];
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];

      const newAlert: Alert = {
        id: `alert-${Date.now()}`,
        severity: randomSeverity,
        category: randomCategory,
        title: `${randomSeverity.charAt(0).toUpperCase() + randomSeverity.slice(1)} Alert`,
        message: `Randomly generated ${randomSeverity} alert for testing auto-dismiss and real-time updates.`,
        status: 'active',
        timestamp: new Date(),
        source: 'Live Generator',
        autoDismissTimeout: randomSeverity === 'success' || randomSeverity === 'info' ? 5000 : undefined,
      };

      setAlerts((prev) => [newAlert, ...prev].slice(0, 20)); // Keep only last 20 alerts
    }, 10000); // Generate new alert every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const handleDismiss = (alertId: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  };

  return (
    <Box sx={{ height: '600px', width: '100%' }}>
      <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
        New alerts are generated every 10 seconds. Success and info alerts auto-dismiss after 5 seconds.
      </Typography>
      <AlertsPanel
        alerts={alerts}
        onDismiss={handleDismiss}
        enableAutoDismiss={true}
        showSummaryBadge={true}
        showFilters={true}
        showSort={true}
      />
    </Box>
  );
};

/**
 * Demo playground with controls
 */
export const AlertsPanelPlayground: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>(generateMockAlerts());
  const [compact, setCompact] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [autoDismiss, setAutoDismiss] = useState(true);

  const handleAddAlert = () => {
    const severities: AlertSeverity[] = ['error', 'warning', 'info', 'success'];
    const randomSeverity = severities[Math.floor(Math.random() * severities.length)];

    const newAlert: Alert = {
      id: `alert-${Date.now()}`,
      severity: randomSeverity,
      category: 'user',
      title: 'Manual Test Alert',
      message: 'This is a manually added alert for testing purposes.',
      status: 'active',
      timestamp: new Date(),
      source: 'Manual Generator',
    };

    setAlerts((prev) => [newAlert, ...prev]);
  };

  const handleClearAll = () => {
    setAlerts([]);
  };

  const handleReset = () => {
    setAlerts(generateMockAlerts());
  };

  const handleDismiss = (alertId: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  };

  const handleAcknowledge = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId
          ? { ...alert, status: 'acknowledged' as const, acknowledgedAt: new Date() }
          : alert
      )
    );
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button variant="contained" onClick={handleAddAlert}>
          Add Alert
        </Button>
        <Button variant="outlined" onClick={handleReset}>
          Reset
        </Button>
        <Button variant="outlined" color="error" onClick={handleClearAll}>
          Clear All
        </Button>
        <Button variant="outlined" onClick={() => setCompact(!compact)}>
          {compact ? 'Normal' : 'Compact'}
        </Button>
        <Button variant="outlined" onClick={() => setGrouped(!grouped)}>
          {grouped ? 'Ungroup' : 'Group'}
        </Button>
        <Button variant="outlined" onClick={() => setAutoDismiss(!autoDismiss)}>
          Auto-Dismiss: {autoDismiss ? 'ON' : 'OFF'}
        </Button>
      </Stack>

      <Box sx={{ height: '600px' }}>
        <AlertsPanel
          alerts={alerts}
          onAcknowledge={handleAcknowledge}
          onDismiss={handleDismiss}
          compact={compact}
          groupByCategory={grouped}
          enableAutoDismiss={autoDismiss}
          showSummaryBadge={true}
          showFilters={true}
          showSort={true}
        />
      </Box>
    </Box>
  );
};

export default BasicAlertsPanel;
