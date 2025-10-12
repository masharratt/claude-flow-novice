/**
 * ResourceGaugesContainer
 * Wrapper for ResourceGauges from web-components with Zustand store integration
 */

import React from 'react';
import { ResourceGauges } from '@components';
import { useMetricsStore } from '../../../shared/stores/metricsStore';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface ResourceGaugesContainerProps {
  showLabels?: boolean;
  size?: 'small' | 'medium' | 'large';
  layout?: 'horizontal' | 'vertical';
  className?: string;
}

export const ResourceGaugesContainer: React.FC<ResourceGaugesContainerProps> = ({
  showLabels = true,
  size = 'medium',
  layout = 'horizontal',
  className,
}) => {
  const { metrics, loading } = useMetricsStore();

  // Subscribe to resource metrics events
  useWebSocketEvent('metrics:resources', (data: any) => {
    console.log('[ResourceGauges] Resources updated:', data);
  });

  const resources = {
    cpu: {
      current: metrics.cpuUsage || 0,
      max: 100,
      label: 'CPU',
      unit: '%',
    },
    memory: {
      current: metrics.memoryUsage || 0,
      max: 100,
      label: 'Memory',
      unit: '%',
    },
    network: {
      current: metrics.networkUsage || 0,
      max: 100,
      label: 'Network',
      unit: '%',
    },
    disk: {
      current: metrics.diskUsage || 0,
      max: 100,
      label: 'Disk',
      unit: '%',
    },
  };

  if (loading) {
    return <LoadingSpinner message="Loading resource metrics..." size={24} />;
  }

  return (
    <ErrorBoundary>
      <ResourceGauges
        resources={resources}
        showLabels={showLabels}
        size={size}
        layout={layout}
        className={className}
      />
    </ErrorBoundary>
  );
};

export default ResourceGaugesContainer;
